// Browsers default to the OS language voice, which can be wrong for English text.
// Prefer neural/online English voices (Edge, Chrome), then any en-US voice.
export function pickEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const rank = (v: SpeechSynthesisVoice) => {
    if (/natural|online/i.test(v.name)) return 0;
    if (/google/i.test(v.name)) return 1;
    return v.lang === "en-US" ? 2 : 3;
  };
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  return english.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}
