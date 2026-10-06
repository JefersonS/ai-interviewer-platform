import { newDb } from "pg-mem";
import { describe, expect, it } from "vitest";
import { makeRecord } from "../tests/sessionFixture";
import { computeMetrics } from "./metrics";
import { JOBS } from "./jobs";
import { MemoryStore, PgStore, type SessionStore } from "./sessionStore";

const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";

const metricsFor = (record: ReturnType<typeof makeRecord>) => computeMetrics(JOBS.find((j) => j.id === record.jobId)!, record);

// The same behaviour is required of both stores. PgStore runs its real SQL on pg-mem, an
// in-process Postgres emulator, since the hosted database is not reachable from tests.
const stores: Array<[string, () => SessionStore]> = [
  ["MemoryStore", () => new MemoryStore()],
  [
    "PgStore (SQL on pg-mem)",
    () => {
      const { Pool } = newDb().adapters.createPg();
      return new PgStore(new Pool());
    },
  ],
];

describe.each(stores)("%s", (_name, make) => {
  it("saves and reads a session back, owner and transcript intact", async () => {
    const store = make();
    const record = makeRecord();
    expect(await store.save(OWNER_A, record, metricsFor(record))).toBe("saved");

    const found = await store.get(OWNER_A, record.id);
    expect(found?.record.id).toBe(record.id);
    expect(found?.record.turns).toHaveLength(14);
    expect(found?.record.turns[0].at).toBe(record.turns[0].at);
    expect(found?.metrics.score).toBe(7);
  });

  it("lists newest first without the transcript, and filters by role", async () => {
    const store = make();
    const older = makeRecord({ finishedAt: 1_700_000_500_000, startedAt: 1_700_000_000_000 });
    const newer = makeRecord({ jobId: "product-manager", finishedAt: 1_700_009_000_000, startedAt: 1_700_008_000_000 });
    for (const r of [older, newer]) await store.save(OWNER_A, r, metricsFor(r));

    const all = await store.list(OWNER_A);
    expect(all.map((s) => s.id)).toEqual([newer.id, older.id]);
    expect(all[0]).toMatchObject({ jobId: "product-manager", candidateName: "Ana", language: "en", score: 7 });
    expect("turns" in all[0]).toBe(false);

    const onlyBackend = await store.list(OWNER_A, "backend-engineer");
    expect(onlyBackend.map((s) => s.id)).toEqual([older.id]);
  });

  it("keeps each owner's history private", async () => {
    const store = make();
    const record = makeRecord();
    await store.save(OWNER_A, record, metricsFor(record));

    expect(await store.list(OWNER_B)).toEqual([]);
    expect(await store.get(OWNER_B, record.id)).toBeNull();
  });

  it("saving the same interview again updates it instead of duplicating", async () => {
    const store = make();
    const record = makeRecord();
    await store.save(OWNER_A, record, metricsFor(record));
    const edited = { ...record, evaluation: { ...record.evaluation, overall_score: 9 } };
    expect(await store.save(OWNER_A, edited, metricsFor(edited))).toBe("saved");

    const list = await store.list(OWNER_A);
    expect(list).toHaveLength(1);
    expect(list[0].score).toBe(9);
  });

  it("will not let another owner overwrite an id that is already taken", async () => {
    const store = make();
    const record = makeRecord();
    await store.save(OWNER_A, record, metricsFor(record));
    const hijack = { ...record, evaluation: { ...record.evaluation, overall_score: 1 } };

    expect(await store.save(OWNER_B, hijack, metricsFor(hijack))).toBe("taken");
    expect((await store.get(OWNER_A, record.id))?.record.evaluation.overall_score).toBe(7);
  });

  it("matches owners case-insensitively, like the uuid column does", async () => {
    const store = make();
    const record = makeRecord();
    await store.save(OWNER_A, record, metricsFor(record));
    // routes lowercase the header, so a stored owner is always compared in lowercase
    expect(await store.save(OWNER_A.toLowerCase(), record, metricsFor(record))).toBe("saved");
  });

  it("returns null for an id that does not exist", async () => {
    expect(await make().get(OWNER_A, "33333333-3333-4333-8333-333333333333")).toBeNull();
  });
});
