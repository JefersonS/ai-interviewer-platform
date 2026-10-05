import { describe, expect, it } from "vitest";
import { parseSaved } from "./session";

describe("parseSaved", () => {
  it("returns null for empty or corrupt data", () => {
    expect(parseSaved(null)).toBeNull();
    expect(parseSaved("{not json")).toBeNull();
    expect(parseSaved('{"turns": 5}')).toBeNull();
  });
  it("parses a saved session", () => {
    const s = parseSaved('{"id":"a","startedAt":1,"turns":[],"evaluation":null}');
    expect(s?.id).toBe("a");
  });
});
