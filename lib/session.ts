import type { Evaluation, Turn } from "./interview";

export type Saved = { id: string; startedAt: number; turns: Turn[]; evaluation: Evaluation | null };

export const storageKey = (jobId: string) => `interview:${jobId}`;

export const CLOSING_LINE =
  "Thanks, that's everything I wanted to cover. Give me a moment to put together your feedback.";

export function parseSaved(raw: string | null | undefined): Saved | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Saved;
    return Array.isArray(s.turns) ? s : null;
  } catch {
    return null; // corrupt or foreign data: treat as no session
  }
}
