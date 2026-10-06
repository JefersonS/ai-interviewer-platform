import { log } from "./logger";

// Protects the public model routes from anyone burning the OpenRouter key.
// In-memory fixed windows: fine for one instance, resets on redeploy. A shared store
// (Redis) would be needed to run several instances.
const MAX_BODY_BYTES = 100_000; // a full 7-question history is about 30 KB
const IP_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;

type Bucket = { count: number; resetAt: number };
const perIp = new Map<string, Bucket>();
const everyone: Bucket = { count: 0, resetAt: 0 };

const limits = () => ({
  perIp: Number(process.env.RATE_LIMIT_PER_IP) || 60,
  global: Number(process.env.RATE_LIMIT_GLOBAL_PER_HOUR) || 600,
});

// Off in dev and tests so local work and live test runs are never blocked.
const enforced = () => process.env.NODE_ENV === "production" || process.env.RATE_LIMIT_ENABLED === "1";

// Behind Railway's proxy the client address arrives in headers. A forged header can only
// dodge the per-IP limit, never the global cap, which bounds the cost either way.
export function clientIp(request: Request): string {
  return request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

function consume(bucket: Bucket, limit: number, windowMs: number, now: number): number {
  if (now >= bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count++;
  return bucket.count > limit ? Math.ceil((bucket.resetAt - now) / 1000) : 0; // seconds to wait, 0 = allowed
}

function tooMany(waitSeconds: number, message: string) {
  return Response.json({ error: message }, { status: 429, headers: { "Retry-After": String(waitSeconds) } });
}

// Returns a ready-made error Response when the request must be refused, otherwise null.
export function guard(request: Request, now = Date.now()): Response | null {
  const size = Number(request.headers.get("content-length") ?? 0);
  if (size > MAX_BODY_BYTES) return Response.json({ error: "request too large" }, { status: 413 });
  if (!enforced()) return null;

  const max = limits();
  const ip = clientIp(request);

  if (perIp.size > 5000) {
    for (const [key, b] of perIp) if (now >= b.resetAt) perIp.delete(key);
  }
  const bucket = perIp.get(ip) ?? { count: 0, resetAt: 0 };
  perIp.set(ip, bucket);

  const waitIp = consume(bucket, max.perIp, IP_WINDOW_MS, now);
  if (waitIp) {
    log("warn", "rate_limited", { scope: "ip" });
    return tooMany(waitIp, `Too many requests. Please wait ${Math.ceil(waitIp / 60)} minute(s) and try again.`);
  }
  const waitAll = consume(everyone, max.global, GLOBAL_WINDOW_MS, now);
  if (waitAll) {
    log("warn", "rate_limited", { scope: "global" });
    return tooMany(waitAll, "The service is very busy right now. Please try again in a little while.");
  }
  return null;
}

export function resetRateLimits() {
  perIp.clear();
  everyone.count = 0;
  everyone.resetAt = 0;
}
