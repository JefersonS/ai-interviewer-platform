import { describe, expect, it } from "vitest";
import { pickEnglishVoice } from "./voice";

const v = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;

describe("pickEnglishVoice", () => {
  it("ignores non-English voices", () => {
    expect(pickEnglishVoice([v("Maria", "pt-BR")])).toBeNull();
  });
  it("prefers natural/online voices over plain ones", () => {
    const picked = pickEnglishVoice([
      v("Microsoft David", "en-US"),
      v("Microsoft Aria Online (Natural)", "en-US"),
      v("Google US English", "en-US"),
    ]);
    expect(picked?.name).toBe("Microsoft Aria Online (Natural)");
  });
  it("falls back to any English voice", () => {
    expect(pickEnglishVoice([v("Maria", "pt-BR"), v("Daniel", "en-GB")])?.name).toBe("Daniel");
  });
});
