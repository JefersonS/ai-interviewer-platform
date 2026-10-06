import type { SessionRecord } from "./history";
import { getOwnerId, OWNER_HEADER } from "./owner";

// Browser side: saves a finished interview to the server's history. Returns false instead of
// throwing, because history is an extra and must never get in the way of the interview.
export async function saveToHistory(record: SessionRecord): Promise<boolean> {
  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", [OWNER_HEADER]: getOwnerId() },
      body: JSON.stringify(record),
    });
    return res.ok;
  } catch {
    return false;
  }
}
