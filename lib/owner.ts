// There are no accounts. Each browser gets a random id and history is private to whoever
// holds it. It is a capability, not real authentication: anyone who learns the id can read
// that history, which is why it is random, long, and sent in a header rather than a URL.
export const OWNER_KEY = "interview:owner";
export const OWNER_HEADER = "x-owner-id";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

// Server side: the owner id from a request, or null when missing or malformed.
// Lowercased because Postgres stores uuids that way, so comparisons always match.
export function ownerFrom(request: Request): string | null {
  const value = request.headers.get(OWNER_HEADER);
  return isUuid(value) ? value.toLowerCase() : null;
}

let inMemoryFallback: string | null = null;

// Browser side: the id for this browser, created on first use.
export function getOwnerId(): string {
  try {
    const existing = localStorage.getItem(OWNER_KEY);
    if (isUuid(existing)) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(OWNER_KEY, created);
    return created;
  } catch {
    // Storage blocked: the id lasts for this page load only.
    inMemoryFallback ??= crypto.randomUUID();
    return inMemoryFallback;
  }
}
