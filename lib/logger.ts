type Level = "info" | "warn" | "error";

// One JSON object per line so Railway's log viewer can filter on fields.
export function log(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else console.log(line);
}
