// Browsers default to the OS language voice, which can be wrong for the interview language.
// Pick a voice for the language, preferring neural/online voices (Edge, Chrome).
export function pickVoice(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
  const norm = (l: string) => l.toLowerCase().replace("_", "-");
  const wanted = norm(lang);
  const base = wanted.split("-")[0];
  const rank = (v: SpeechSynthesisVoice) => {
    if (/natural|online/i.test(v.name)) return 0;
    if (/google/i.test(v.name)) return 1;
    return norm(v.lang) === wanted ? 2 : 3;
  };
  const matching = voices.filter((v) => norm(v.lang).split("-")[0] === base);
  return matching.sort((a, b) => rank(a) - rank(b))[0] ?? null;
}
