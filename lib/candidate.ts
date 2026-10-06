import { isLang, type Lang } from "./languages";

export type Candidate = { name: string; language: Lang };

export const NO_CANDIDATE: Candidate = { name: "", language: "en" };

// The name is typed by the user and ends up inside a model prompt, so keep it to
// plain letters and a few separators. That rules out instructions smuggled in as a name.
export function cleanName(raw: unknown): string {
  const name = (typeof raw === "string" ? raw : "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (!name || name.length > 40 || !/^\p{L}[\p{L}\p{M} .'-]*$/u.test(name)) {
    throw new Error("name must be 1-40 letters (spaces, . ' - allowed)");
  }
  return name;
}

// Absent candidate means an old client or saved session: English, no name.
export function parseCandidate(raw: unknown): Candidate {
  if (raw === undefined || raw === null) return NO_CANDIDATE;
  const r = raw as Record<string, unknown>;
  if (!isLang(r.language)) throw new Error("unsupported language");
  return { name: r.name === "" || r.name === undefined ? "" : cleanName(r.name), language: r.language };
}
