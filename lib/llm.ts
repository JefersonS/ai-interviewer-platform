import { log } from "./logger";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class LlmError extends Error {
  constructor(message: string, readonly kind: "config" | "http" | "invalid_output" | "network") {
    super(message);
  }
}

type Options<T> = {
  messages: ChatMessage[];
  // Return the typed value, or throw with a reason if the shape is wrong.
  validate: (raw: unknown) => T;
  label: string;
  maxAttempts?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Caps in-flight model calls for the whole server process.
const MAX_CONCURRENT = 4;
let active = 0;
const waiting: Array<() => void> = [];

async function acquire() {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
}

function release() {
  const next = waiting.shift();
  if (next) next(); // hand the slot straight to the next waiter
  else active--;
}

// Models often wrap JSON in ```json fences or add a sentence around it.
export function extractJson(text: string): unknown {
  const stripped = text.replace(/```(?:json)?/gi, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object found");
  return JSON.parse(stripped.slice(start, end + 1));
}

export function backoffMs(attempt: number, retryAfterHeader?: string | null): number {
  const retryAfter = Number(retryAfterHeader);
  if (retryAfterHeader && Number.isFinite(retryAfter)) return Math.min(retryAfter * 1000, 10_000);
  const exp = 500 * 2 ** (attempt - 1);
  return exp + Math.random() * 250; // jitter avoids synchronized retries
}

export async function chatJson<T>(opts: Options<T>): Promise<T> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new LlmError("OPENROUTER_API_KEY is not set", "config");
  const model = process.env.OPENROUTER_MODEL ?? "mistralai/mistral-small-3.2-24b-instruct";

  const maxAttempts = opts.maxAttempts ?? 3;
  const timeoutMs = opts.timeoutMs ?? 25_000;
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  // Grows on invalid output: the model sees what it got wrong instead of repeating it.
  let messages = opts.messages;

  await acquire();
  try {
    let lastError: LlmError = new LlmError("no attempts made", "network");
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const started = Date.now();
      let retryAfter: string | null = null;
      let rejected: string | null = null;
      try {
        const res = await doFetch(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages,
            response_format: { type: "json_object" },
            temperature: 0.4,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!res.ok) {
          retryAfter = res.headers.get("retry-after");
          const retryable = res.status === 429 || res.status >= 500;
          lastError = new LlmError(`OpenRouter HTTP ${res.status}`, "http");
          if (!retryable) throw Object.assign(lastError, { fatal: true });
        } else {
          const body = await res.json();
          const content = body?.choices?.[0]?.message?.content;
          if (typeof content !== "string") throw new Error("response had no message content");
          rejected = content;
          const value = opts.validate(extractJson(content));
          log("info", "llm.ok", { label: opts.label, attempt, ms: Date.now() - started, model });
          return value;
        }
      } catch (err) {
        if ((err as { fatal?: boolean }).fatal) throw err;
        if (!(err instanceof LlmError)) {
          const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
          const reason = err instanceof Error ? err.message : String(err);
          // JSON/validation errors are SyntaxError or plain Error from validate; network ones are TypeError.
          const isNetwork = timedOut || err instanceof TypeError;
          lastError = new LlmError(reason, isNetwork ? "network" : "invalid_output");
          if (lastError.kind === "invalid_output" && rejected !== null) {
            messages = [
              ...opts.messages,
              { role: "assistant", content: rejected },
              { role: "user", content: `Your reply was rejected: ${reason}. Reply again with only the corrected JSON.` },
            ];
          }
        }
      }

      log("warn", "llm.retry", {
        label: opts.label,
        attempt,
        kind: lastError.kind,
        reason: lastError.message,
        ms: Date.now() - started,
      });
      if (attempt < maxAttempts) await sleep(backoffMs(attempt, retryAfter));
    }
    log("error", "llm.failed", { label: opts.label, kind: lastError.kind, reason: lastError.message });
    throw lastError;
  } finally {
    release();
  }
}
