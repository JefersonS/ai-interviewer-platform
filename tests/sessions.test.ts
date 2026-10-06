import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getOne } from "@/app/api/sessions/[id]/route";
import { GET as list, POST as save } from "@/app/api/sessions/route";
import { resetRateLimits } from "@/lib/guard";
import { MemoryStore, setStoreForTests } from "@/lib/sessionStore";
import { makeRecord } from "./sessionFixture";

vi.mock("@/lib/logger", () => ({ log: vi.fn() }));

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const headers = (owner: string | null): Record<string, string> => (owner ? { "x-owner-id": owner } : {});
const post = (body: unknown, owner: string | null = OWNER) =>
  save(new Request("http://t/api/sessions", { method: "POST", headers: headers(owner), body: JSON.stringify(body) }));
const getList = (query = "", owner: string | null = OWNER) => list(new Request(`http://t/api/sessions${query}`, { headers: headers(owner) }));
const getRecord = (id: string, owner: string | null = OWNER) =>
  getOne(new Request(`http://t/api/sessions/${id}`, { headers: headers(owner) }), { params: Promise.resolve({ id }) } as never);

beforeEach(() => {
  resetRateLimits();
  setStoreForTests(new MemoryStore());
});
afterEach(() => {
  setStoreForTests(undefined);
  delete process.env.RATE_LIMIT_ENABLED;
  delete process.env.RATE_LIMIT_HISTORY_PER_IP;
});

describe("POST /api/sessions", () => {
  it("saves a finished interview and returns its metrics", async () => {
    const record = makeRecord();
    const res = await post(record);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(record.id);
    expect(body.metrics).toMatchObject({ score: 7, coverage: { covered: 4, total: 4 }, avgAnswerSeconds: 20 });
  });

  it("is safe to retry: saving the same interview twice leaves one entry", async () => {
    const record = makeRecord();
    await post(record);
    expect((await post(record)).status).toBe(200);
    expect((await (await getList()).json()).sessions).toHaveLength(1);
  });

  it("needs a valid owner id", async () => {
    expect((await post(makeRecord(), null)).status).toBe(400);
    expect((await post(makeRecord(), "not-a-uuid")).status).toBe(400);
  });

  it("refuses an id that another owner already saved", async () => {
    const record = makeRecord();
    await post(record, OWNER);
    expect((await post(record, OTHER)).status).toBe(409);
  });

  it("rejects malformed bodies and incomplete interviews with 400", async () => {
    expect((await save(new Request("http://t/api/sessions", { method: "POST", headers: headers(OWNER), body: "{nope" }))).status).toBe(400);
    expect((await post({ ...makeRecord(), turns: [] })).status).toBe(400);
    expect((await post({ ...makeRecord(), jobId: "astronaut" })).status).toBe(400);
  });
});

describe("GET /api/sessions", () => {
  it("lists only this owner's interviews and can filter by role", async () => {
    const mine = makeRecord();
    const pm = makeRecord({ jobId: "product-manager" });
    const theirs = makeRecord();
    await post(mine, OWNER);
    await post(pm, OWNER);
    await post(theirs, OTHER);

    const all = (await (await getList()).json()).sessions;
    expect(all.map((s: { id: string }) => s.id).sort()).toEqual([mine.id, pm.id].sort());

    const onlyPm = (await (await getList("?job=product-manager")).json()).sessions;
    expect(onlyPm.map((s: { id: string }) => s.id)).toEqual([pm.id]);
  });

  it("rejects an unknown role and a missing owner", async () => {
    expect((await getList("?job=astronaut")).status).toBe(400);
    expect((await getList("", null)).status).toBe(400);
  });
});

describe("GET /api/sessions/[id]", () => {
  it("returns the full interview with its metrics to its owner", async () => {
    const record = makeRecord();
    await post(record);
    const res = await getRecord(record.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session.turns).toHaveLength(14);
    expect(body.metrics.score).toBe(7);
  });

  it("answers 404 both for unknown ids and for someone else's interview", async () => {
    const record = makeRecord();
    await post(record, OWNER);
    expect((await getRecord(record.id, OTHER)).status).toBe(404);
    expect((await getRecord("cccccccc-cccc-4ccc-8ccc-cccccccccccc")).status).toBe(404);
    expect((await getRecord("not-a-uuid")).status).toBe(404);
  });

  it("finds the interview when the owner id arrives in uppercase", async () => {
    const record = makeRecord();
    await post(record, OWNER);
    expect((await getRecord(record.id, OWNER.toUpperCase())).status).toBe(200);
  });
});

describe("when history is not available", () => {
  it("answers 503 on every route if no store is configured", async () => {
    setStoreForTests(null);
    expect((await post(makeRecord())).status).toBe(503);
    expect((await getList()).status).toBe(503);
    expect((await getRecord(makeRecord().id)).status).toBe(503);
  });

  it("answers 503, not a crash, when the database fails", async () => {
    setStoreForTests({
      save: async () => {
        throw new Error("connection refused");
      },
      list: async () => {
        throw new Error("connection refused");
      },
      get: async () => {
        throw new Error("connection refused");
      },
    });
    expect((await post(makeRecord())).status).toBe(503);
    expect((await getList()).status).toBe(503);
    expect((await getRecord(makeRecord().id)).status).toBe(503);
  });
});

describe("history protection", () => {
  it("has its own per-IP limit, separate from the model routes", async () => {
    process.env.RATE_LIMIT_ENABLED = "1";
    process.env.RATE_LIMIT_HISTORY_PER_IP = "2";
    const call = () => list(new Request("http://t/api/sessions", { headers: { ...headers(OWNER), "x-real-ip": "9.9.9.9" } }));
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(429);
  });

  it("refuses oversized bodies", async () => {
    const res = await save(new Request("http://t/api/sessions", { method: "POST", headers: { ...headers(OWNER), "content-length": "500000" }, body: "{}" }));
    expect(res.status).toBe(413);
  });
});
