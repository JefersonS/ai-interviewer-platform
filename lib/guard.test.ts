import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientIp, guard, readJsonBody, resetRateLimits } from "./guard";

vi.mock("./logger", () => ({ log: vi.fn() }));

const req = (headers: Record<string, string> = {}) => new Request("http://test.local/api", { method: "POST", headers });
const from = (ip: string) => req({ "x-real-ip": ip });

beforeEach(() => {
  resetRateLimits();
  process.env.RATE_LIMIT_ENABLED = "1";
  process.env.RATE_LIMIT_PER_IP = "3";
  process.env.RATE_LIMIT_GLOBAL_PER_HOUR = "5";
});
afterEach(() => {
  delete process.env.RATE_LIMIT_ENABLED;
  delete process.env.RATE_LIMIT_PER_IP;
  delete process.env.RATE_LIMIT_GLOBAL_PER_HOUR;
});

describe("guard: per-IP limit", () => {
  it("allows up to the limit, then answers 429 with Retry-After", () => {
    for (let i = 0; i < 3; i++) expect(guard(from("1.1.1.1"))).toBeNull();
    const blocked = guard(from("1.1.1.1"));
    expect(blocked?.status).toBe(429);
    expect(Number(blocked?.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("counts each address separately", () => {
    for (let i = 0; i < 4; i++) guard(from("1.1.1.1"));
    expect(guard(from("2.2.2.2"))).toBeNull();
  });

  it("starts a fresh window after 15 minutes", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 4; i++) guard(from("1.1.1.1"), t0);
    expect(guard(from("1.1.1.1"), t0 + 60_000)?.status).toBe(429);
    expect(guard(from("1.1.1.1"), t0 + 15 * 60_000 + 1)).toBeNull();
  });
});

describe("guard: global cap", () => {
  it("stops everyone once the hourly total is reached, even with different addresses", async () => {
    for (let i = 0; i < 5; i++) expect(guard(from(`10.0.0.${i}`))).toBeNull();
    const blocked = guard(from("10.0.0.99"));
    expect(blocked?.status).toBe(429);
    expect((await blocked!.json()).error).toMatch(/very busy/);
  });
});

describe("guard: request size and environment", () => {
  it("rejects an oversized body even when rate limiting is off", () => {
    delete process.env.RATE_LIMIT_ENABLED;
    expect(guard(req({ "content-length": "200000" }))?.status).toBe(413);
  });

  it("does not limit outside production unless enabled", () => {
    delete process.env.RATE_LIMIT_ENABLED;
    for (let i = 0; i < 20; i++) expect(guard(from("1.1.1.1"))).toBeNull();
  });
});

describe("clientIp", () => {
  it("prefers x-real-ip, then the first x-forwarded-for entry, then 'unknown'", () => {
    expect(clientIp(req({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }))).toBe("9.9.9.9");
    expect(clientIp(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(req())).toBe("unknown");
  });
});

// A body sent in pieces has no Content-Length header, which is exactly what the header check misses.
const streamed = (chunks: string[]) =>
  new Request("http://test.local/api", {
    method: "POST",
    body: new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
        controller.close();
      },
    }),
    duplex: "half",
  } as RequestInit);

describe("readJsonBody", () => {
  it("parses a normal body", async () => {
    const r = await readJsonBody(new Request("http://test.local/api", { method: "POST", body: JSON.stringify({ a: 1 }) }));
    expect(r).toEqual({ ok: true, value: { a: 1 } });
  });

  it("stops a chunked upload that has no Content-Length once it passes the limit", async () => {
    const piece = "x".repeat(40_000);
    const request = streamed(['{"pad":"', piece, piece, piece, '"}']); // 120 KB in four chunks
    expect(request.headers.get("content-length")).toBeNull();
    const r = await readJsonBody(request, 100_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(413);
  });

  it("accepts a chunked body that stays under the limit", async () => {
    const r = await readJsonBody(streamed(['{"a":', "[1,2,", "3]}"]), 100_000);
    expect(r).toEqual({ ok: true, value: { a: [1, 2, 3] } });
  });

  it("still refuses on the header alone, without reading anything", async () => {
    const r = await readJsonBody(new Request("http://test.local/api", { method: "POST", headers: { "content-length": "999999" }, body: "{}" }), 100_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(413);
  });

  it("answers 400 for invalid JSON or a missing body", async () => {
    const bad = await readJsonBody(new Request("http://test.local/api", { method: "POST", body: "{nope" }));
    expect(bad.ok === false && bad.response.status).toBe(400);
    const none = await readJsonBody(new Request("http://test.local/api", { method: "POST" }));
    expect(none.ok === false && none.response.status).toBe(400);
  });
});
