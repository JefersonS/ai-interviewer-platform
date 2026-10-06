import { describe, expect, it } from "vitest";
import { pickVoice } from "./voice";

const v = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;

describe("pickVoice", () => {
  it("ignores voices of other languages", () => {
    expect(pickVoice([v("Maria", "pt-BR")], "en-US")).toBeNull();
    expect(pickVoice([v("David", "en-US")], "pt-BR")).toBeNull();
  });
  it("prefers natural/online voices over plain ones", () => {
    const picked = pickVoice(
      [v("Microsoft David", "en-US"), v("Microsoft Aria Online (Natural)", "en-US"), v("Google US English", "en-US")],
      "en-US",
    );
    expect(picked?.name).toBe("Microsoft Aria Online (Natural)");
  });
  it("falls back to any voice of the same language", () => {
    expect(pickVoice([v("Maria", "pt-BR"), v("Daniel", "en-GB")], "en-US")?.name).toBe("Daniel");
  });
  it("picks a Portuguese voice for pt-BR, preferring the exact region", () => {
    const picked = pickVoice([v("Joana", "pt-PT"), v("Maria", "pt-BR"), v("Daniel", "en-US")], "pt-BR");
    expect(picked?.name).toBe("Maria");
  });
  it("accepts underscore language tags some platforms report", () => {
    expect(pickVoice([v("Maria", "pt_BR")], "pt-BR")?.name).toBe("Maria");
  });
});
