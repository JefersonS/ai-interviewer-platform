import { beforeEach, describe, expect, it, vi } from "vitest";
import { chatJson, extractJson, isTransient, LlmError } from "./llm";

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

  it("tells the model why its previous reply was rejected", async () => {
    const bodies: { messages: { role: string; content: string }[] }[] = [];
    const fetchImpl = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return bodies.length === 1 ? reply('{"ok": false}') : reply('{"ok": true}');
    });
    await chatJson({ ...base, messages: [{ role: "user", content: "hi" }], fetchImpl });
    const retryMessages = bodies[1].messages;
    expect(retryMessages).toHaveLength(3);
    expect(retryMessages[1]).toEqual({ role: "assistant", content: '{"ok": false}' });
    expect(retryMessages[2].content).toContain("ok must be true");
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

describe("token cap and deadline", () => {
  it("sends max_tokens, 800 by default and an override when given", async () => {
    const bodies: { max_tokens: number }[] = [];
    const fetchImpl = vi.fn().mockImplementation(async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return reply('{"ok": true}');
    });
    await chatJson({ ...base, fetchImpl });
    await chatJson({ ...base, fetchImpl, maxTokens: 300 });
    expect(bodies.map((b) => b.max_tokens)).toEqual([800, 300]);
  });

  it("treats a reply cut off at the token limit as invalid output and retries", async () => {
    const cut = new Response(JSON.stringify({ choices: [{ message: { content: '{"ok": tr' }, finish_reason: "length" }] }), { status: 200 });
    const fetchImpl = vi.fn().mockResolvedValueOnce(cut).mockResolvedValueOnce(reply('{"ok": true}'));
    await expect(chatJson({ ...base, fetchImpl })).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("stops at the deadline when a request hangs, instead of waiting out the attempt timeout", async () => {
    const hang = vi.fn().mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))),
    );
    const started = Date.now();
    const err = await chatJson({ ...base, fetchImpl: hang, deadlineMs: 300 }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.kind).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(1500); // the attempt timeout alone is 25 s
    expect(hang).toHaveBeenCalledTimes(1);
  });

  it("does not start a retry that cannot finish in the time left", async () => {
    let t = 0;
    const slow = vi.fn().mockImplementation(async () => {
      t += 4000;
      return reply("not json");
    });
    const err = await chatJson({ ...base, fetchImpl: slow, now: () => t, deadlineMs: 6000 }).catch((e) => e);
    expect(err.kind).toBe("timeout");
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it("still uses all its attempts when there is plenty of time", async () => {
    let t = 0;
    const quick = vi.fn().mockImplementation(async () => {
      t += 500;
      return reply("not json");
    });
    const err = await chatJson({ ...base, fetchImpl: quick, now: () => t, deadlineMs: 30_000 }).catch((e) => e);
    expect(err.kind).toBe("invalid_output");
    expect(quick).toHaveBeenCalledTimes(3);
  });

  it("stops waiting for a free model slot once the deadline passes, without calling the model", async () => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const held = vi.fn().mockImplementation(async () => {
      await gate;
      return reply('{"ok": true}');
    });
    const running = Array.from({ length: 4 }, () => chatJson({ ...base, fetchImpl: held, deadlineMs: 5_000 }));
    await new Promise((r) => setTimeout(r, 20)); // let the four calls take every slot

    const extra = vi.fn();
    const err = await chatJson({ ...base, fetchImpl: extra, deadlineMs: 150 }).catch((e) => e);
    expect(err.kind).toBe("timeout");
    expect(extra).not.toHaveBeenCalled();

    open();
    await Promise.all(running);
  });

  it("counts running out of time as transient, so a question falls back instead of failing", () => {
    expect(isTransient(new LlmError("out of time", "timeout"))).toBe(true);
    expect(isTransient(new LlmError("no key", "config"))).toBe(false);
  });
});
