import { guardHistory, readJsonBody } from "@/lib/guard";
import { parseSessionRecord } from "@/lib/history";
import { getJob } from "@/lib/jobs";
import { log } from "@/lib/logger";
import { computeMetrics } from "@/lib/metrics";
import { ownerFrom } from "@/lib/owner";
import { getStore } from "@/lib/sessionStore";

const NOT_CONFIGURED = { error: "History is not configured on this server." };

// Save a finished interview. Saving the same id again updates it, so retries are safe.
export async function POST(request: Request) {
  const blocked = guardHistory(request);
  if (blocked) return blocked;
  const store = getStore();
  if (!store) return Response.json(NOT_CONFIGURED, { status: 503 });
  const owner = ownerFrom(request);
  if (!owner) return Response.json({ error: "missing or invalid x-owner-id" }, { status: 400 });

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as unknown;
  let record;
  try {
    record = parseSessionRecord(body);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  const metrics = computeMetrics(getJob(record.jobId)!, record);
  try {
    if ((await store.save(owner, record, metrics)) === "taken") return Response.json({ error: "id already in use" }, { status: 409 });
  } catch (e) {
    log("error", "sessions.save_failed", { reason: (e as Error).message });
    return Response.json({ error: "Could not save the interview right now." }, { status: 503 });
  }
  return Response.json({ id: record.id, metrics });
}

// This browser's finished interviews, newest first, optionally for one role.
export async function GET(request: Request) {
  const blocked = guardHistory(request);
  if (blocked) return blocked;
  const store = getStore();
  if (!store) return Response.json(NOT_CONFIGURED, { status: 503 });
  const owner = ownerFrom(request);
  if (!owner) return Response.json({ error: "missing or invalid x-owner-id" }, { status: 400 });

  const jobId = new URL(request.url).searchParams.get("job") ?? undefined;
  if (jobId && !getJob(jobId)) return Response.json({ error: "unknown job" }, { status: 400 });

  try {
    return Response.json({ sessions: await store.list(owner, jobId) });
  } catch (e) {
    log("error", "sessions.list_failed", { reason: (e as Error).message });
    return Response.json({ error: "Could not load history right now." }, { status: 503 });
  }
}
