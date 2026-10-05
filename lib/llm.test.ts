import { beforeEach, describe, expect, it, vi } from "vitest";
import { chatJson, extractJson, LlmError } from "./llm";

vi.mock("./logger", () => ({ log: vi.fn() }));

const reply = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

const validate = (raw: unknown) => {
  const r = raw as { ok?: boolean };
  if (r.ok !== true) throw new Error("ok must be true");
  return r;
};

const base = { messages: [], validate, label: "test", sleep: async () => {} };

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
});

describe("extractJson", () => {
  it("parses fenced JSON with surrounding prose", () => {
    expect(extractJson('Sure!\n```json\n{"ok": true}\n```\nDone')).toEqual({ ok: true });
  });
  it("throws when there is no object", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("chatJson", () => {
  it("returns validated output", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(reply('{"ok": true}'));
    await expect(chatJson({ ...base, fetchImpl })).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(reply('{"ok": true}'));
    await expect(chatJson({ ...base, fetchImpl })).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 401", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    await expect(chatJson({ ...base, fetchImpl })).rejects.toMatchObject({ kind: "http" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries malformed output and then gives up as invalid_output", async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => reply("not json at all"));
    const err = await chatJson({ ...base, fetchImpl, maxAttempts: 3 }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.kind).toBe("invalid_output");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("retries when the shape fails validation", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(reply('{"ok": false}'))
      .mockResolvedValueOnce(reply('{"ok": true}'));
    await expect(chatJson({ ...base, fetchImpl })).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries network failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(reply('{"ok": true}'));
    await expect(chatJson({ ...base, fetchImpl })).resolves.toEqual({ ok: true });
  });

  it("fails fast with a config error when the key is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const fetchImpl = vi.fn();
    await expect(chatJson({ ...base, fetchImpl })).rejects.toMatchObject({ kind: "config" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never runs more than 4 calls at once", async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchImpl = vi.fn().mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
      return reply('{"ok": true}');
    });
    await Promise.all(Array.from({ length: 10 }, () => chatJson({ ...base, fetchImpl })));
    expect(peak).toBe(4);
  });
});
