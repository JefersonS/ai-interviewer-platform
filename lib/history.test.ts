import { describe, expect, it } from "vitest";
import { makeRecord } from "../tests/sessionFixture";
import { parseSessionRecord } from "./history";

const valid = () => JSON.parse(JSON.stringify(makeRecord()));

describe("parseSessionRecord", () => {
  it("accepts a complete interview and keeps the turn timestamps", () => {
    const parsed = parseSessionRecord(valid());
    expect(parsed.turns).toHaveLength(14);
    expect(parsed.turns[0].at).toBeGreaterThan(0);
    expect(parsed.lastAnswer?.rating).toBe("adequate");
  });

  it("rejects a bad id, unknown job, or incomplete interview", () => {
    expect(() => parseSessionRecord({ ...valid(), id: "nope" })).toThrow(/UUID/);
    expect(() => parseSessionRecord({ ...valid(), jobId: "astronaut" })).toThrow(/unknown job/);
    const short = valid();
    short.turns = short.turns.slice(0, 10);
    expect(() => parseSessionRecord(short)).toThrow(/not complete/);
  });

  it("rejects impossible timestamps", () => {
    const r = valid();
    expect(() => parseSessionRecord({ ...r, finishedAt: r.startedAt - 1 })).toThrow(/timestamps/);
    expect(() => parseSessionRecord({ ...r, startedAt: 5 })).toThrow(/timestamps/);
    expect(() => parseSessionRecord({ ...r, finishedAt: Date.now() + 10 * 86_400_000 })).toThrow(/timestamps/);
    expect(() => parseSessionRecord({ ...r, startedAt: r.finishedAt - 40 * 86_400_000 })).toThrow(/timestamps/);
  });

  it("rejects a malformed evaluation or candidate", () => {
    expect(() => parseSessionRecord({ ...valid(), evaluation: { strengths: [] } })).toThrow();
    expect(() => parseSessionRecord({ ...valid(), candidate: { name: "Ana", language: "fr" } })).toThrow(/language/);
  });

  it("drops an invalid final-answer rating instead of failing the save", () => {
    expect(parseSessionRecord({ ...valid(), lastAnswer: { rating: "great", skills: [] } }).lastAnswer).toBeUndefined();
    expect(parseSessionRecord({ ...valid(), lastAnswer: undefined }).lastAnswer).toBeUndefined();
  });

  it("ignores fields it does not know, and bad timestamps on turns", () => {
    const r = valid();
    r.turns[1].at = "yesterday";
    r.extra = "ignored";
    const parsed = parseSessionRecord(r);
    expect(parsed.turns[1].at).toBeUndefined();
    expect("extra" in parsed).toBe(false);
  });
});
