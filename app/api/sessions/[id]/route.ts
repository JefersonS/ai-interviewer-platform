import { guardHistory } from "@/lib/guard";
import { log } from "@/lib/logger";
import { isUuid, ownerFrom } from "@/lib/owner";
import { getStore } from "@/lib/sessionStore";

// One finished interview in full (transcript, evaluation, metrics) for replay.
export async function GET(request: Request, ctx: RouteContext<"/api/sessions/[id]">) {
  const blocked = guardHistory(request);
  if (blocked) return blocked;
  const store = getStore();
  if (!store) return Response.json({ error: "History is not configured on this server." }, { status: 503 });
  const owner = ownerFrom(request);
  if (!owner) return Response.json({ error: "missing or invalid x-owner-id" }, { status: 400 });

  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "not found" }, { status: 404 });
  try {
    const found = await store.get(owner, id.toLowerCase());
    // Same answer whether it does not exist or belongs to someone else.
    if (!found) return Response.json({ error: "not found" }, { status: 404 });
    return Response.json({ session: found.record, metrics: found.metrics });
  } catch (e) {
    log("error", "sessions.get_failed", { reason: (e as Error).message });
    return Response.json({ error: "Could not load the interview right now." }, { status: 503 });
  }
}
