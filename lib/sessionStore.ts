import { Pool } from "pg";
import type { Metrics, SessionListItem, SessionRecord } from "./history";
import type { Lang } from "./languages";

export type StoredSession = { record: SessionRecord; metrics: Metrics };

// Every method takes the owner id, so one browser can never read another's history.
export interface SessionStore {
  // "taken" means the id already belongs to a different owner and nothing was written.
  save(ownerId: string, record: SessionRecord, metrics: Metrics): Promise<"saved" | "taken">;
  list(ownerId: string, jobId?: string): Promise<SessionListItem[]>;
  get(ownerId: string, id: string): Promise<StoredSession | null>;
}

const LIST_LIMIT = 100;

export class MemoryStore implements SessionStore {
  private rows = new Map<string, { ownerId: string; stored: StoredSession }>();

  async save(ownerId: string, record: SessionRecord, metrics: Metrics) {
    const existing = this.rows.get(record.id);
    if (existing && existing.ownerId !== ownerId) return "taken" as const;
    this.rows.set(record.id, { ownerId, stored: { record, metrics } });
    return "saved" as const;
  }

  async list(ownerId: string, jobId?: string) {
    return [...this.rows.values()]
      .filter((r) => r.ownerId === ownerId && (!jobId || r.stored.record.jobId === jobId))
      .map(({ stored: { record, metrics } }) => toListItem(record, metrics))
      .sort((a, b) => b.finishedAt - a.finishedAt)
      .slice(0, LIST_LIMIT);
  }

  async get(ownerId: string, id: string) {
    const row = this.rows.get(id);
    return row && row.ownerId === ownerId ? row.stored : null;
  }
}

function toListItem(record: SessionRecord, metrics: Metrics): SessionListItem {
  return {
    id: record.id,
    jobId: record.jobId,
    candidateName: record.candidate.name,
    language: record.candidate.language,
    finishedAt: record.finishedAt,
    score: record.evaluation.overall_score,
    metrics,
  };
}

// The part of node-postgres this file uses, so tests can hand in an emulator.
type Db = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }> };

const CREATE_TABLE = `
  create table if not exists interview_sessions (
    id uuid primary key,
    owner_id uuid not null,
    job_id text not null,
    candidate_name text not null,
    language text not null,
    started_at timestamptz not null,
    finished_at timestamptz not null,
    score integer not null,
    metrics jsonb not null,
    record jsonb not null
  )`;
const CREATE_INDEX = "create index if not exists interview_sessions_owner_idx on interview_sessions (owner_id, finished_at)";

export class PgStore implements SessionStore {
  private ready: Promise<unknown> | null = null;

  constructor(private db: Db) {}

  // Creates the table on first use, so there is no separate migration step to run.
  private ensureSchema() {
    this.ready ??= this.db
      .query(CREATE_TABLE)
      .then(() => this.db.query(CREATE_INDEX))
      .catch((e) => {
        this.ready = null; // try again next time
        throw e;
      });
    return this.ready;
  }

  async save(ownerId: string, record: SessionRecord, metrics: Metrics) {
    await this.ensureSchema();
    // An id that belongs to someone else is refused up front. The WHERE on the upsert below
    // repeats the rule inside the statement, so two simultaneous saves cannot slip past it.
    const existing = await this.db.query("select owner_id from interview_sessions where id = $1", [record.id]);
    if (existing.rows[0] && String(existing.rows[0].owner_id).toLowerCase() !== ownerId) return "taken" as const;

    // Re-saving the same interview updates it.
    const result = await this.db.query(
      `insert into interview_sessions
         (id, owner_id, job_id, candidate_name, language, started_at, finished_at, score, metrics, record)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (id) do update set
         job_id = excluded.job_id, candidate_name = excluded.candidate_name, language = excluded.language,
         started_at = excluded.started_at, finished_at = excluded.finished_at, score = excluded.score,
         metrics = excluded.metrics, record = excluded.record
       where interview_sessions.owner_id = excluded.owner_id`,
      [
        record.id,
        ownerId,
        record.jobId,
        record.candidate.name,
        record.candidate.language,
        new Date(record.startedAt).toISOString(),
        new Date(record.finishedAt).toISOString(),
        record.evaluation.overall_score,
        JSON.stringify(metrics),
        JSON.stringify(record),
      ],
    );
    return result.rowCount === 0 ? ("taken" as const) : ("saved" as const);
  }

  async list(ownerId: string, jobId?: string) {
    await this.ensureSchema();
    const params: unknown[] = [ownerId];
    if (jobId) params.push(jobId);
    const { rows } = await this.db.query(
      `select id, job_id, candidate_name, language, finished_at, score, metrics
         from interview_sessions
        where owner_id = $1 ${jobId ? "and job_id = $2" : ""}
        order by finished_at desc
        limit ${LIST_LIMIT}`,
      params,
    );
    return rows.map((row) => ({
      id: row.id as string,
      jobId: row.job_id as string,
      candidateName: row.candidate_name as string,
      language: row.language as Lang,
      finishedAt: new Date(row.finished_at as string | Date).getTime(),
      score: Number(row.score),
      metrics: row.metrics as Metrics,
    }));
  }

  async get(ownerId: string, id: string) {
    await this.ensureSchema();
    const { rows } = await this.db.query("select record, metrics from interview_sessions where owner_id = $1 and id = $2", [ownerId, id]);
    return rows[0] ? { record: rows[0].record as SessionRecord, metrics: rows[0].metrics as Metrics } : null;
  }
}

let override: SessionStore | null | undefined;
let memory: MemoryStore | undefined;
const globalPool = globalThis as unknown as { __interviewPool?: Pool; __interviewStore?: PgStore };

// Tests hand in their own store; pass undefined to go back to the real selection.
export function setStoreForTests(store: SessionStore | null | undefined) {
  override = store;
}

// Database when DATABASE_URL is set. Without it, a memory store in dev so the app still works
// locally, and no store at all in production, because silently losing history would be worse
// than saying it is not configured.
export function getStore(): SessionStore | null {
  if (override !== undefined) return override;
  const url = process.env.DATABASE_URL;
  if (url) {
    globalPool.__interviewPool ??= new Pool({
      connectionString: url,
      max: 5,
      connectionTimeoutMillis: 5000,
      ssl: process.env.DATABASE_SSL === "1" ? { rejectUnauthorized: false } : undefined,
    });
    globalPool.__interviewStore ??= new PgStore(globalPool.__interviewPool);
    return globalPool.__interviewStore;
  }
  if (process.env.NODE_ENV === "production") return null;
  return (memory ??= new MemoryStore());
}
