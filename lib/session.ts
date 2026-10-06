import type { Candidate } from "./candidate";
import type { Evaluation, Turn } from "./interview";
import type { Lang } from "./languages";

export type Saved = {
  id: string;
  startedAt: number;
  turns: Turn[];
  evaluation: Evaluation | null;
  candidate?: Candidate; // absent in sessions saved before names and languages existed
  translations?: Partial<Record<Lang, Evaluation>>; // view-only copies; the English evaluation stays the source
};

// Remembers the last name and language typed on the start screen.
export const PROFILE_KEY = "interview:profile";

export const storageKey = (jobId: string) => `interview:${jobId}`;

export const CLOSING_LINES: Record<Lang, string> = {
  en: "Thanks, that's everything I wanted to cover. Give me a moment to put together your feedback.",
  "pt-BR": "Obrigado, era isso que eu queria abordar. Me dê um instante para preparar o seu feedback.",
};

export function parseSaved(raw: string | null | undefined): Saved | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Saved;
    return Array.isArray(s.turns) ? s : null;
  } catch {
    return null; // corrupt or foreign data: treat as no session
  }
}
