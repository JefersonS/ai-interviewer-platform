import { log } from "./logger";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "http" | "invalid_output" | "network" | "timeout",
    readonly status?: number,
  ) {
    super(message);
  }
}

// True for failures that may clear up on their own (bad output, network, running out of time,
// rate limit, provider outage). False for ones that need a human, like a missing or rejected key.
export function isTransient(e: unknown): boolean {
  if (!(e instanceof LlmError)) return false;
  if (e.kind === "invalid_output" || e.kind === "network" || e.kind === "timeout") return true;
  return e.kind === "http" && (e.status === 429 || (e.status ?? 0) >= 500);
}

type Options<T> = {
  messages: ChatMessage[];
  // Return the typed value, or throw with a reason if the shape is wrong.
  validate: (raw: unknown) => T;
  label: string;
  maxAttempts?: number;
  timeoutMs?: number; // per attempt
  deadlineMs?: number; // for the whole call: waiting for a slot, every attempt, and the pauses between them
  maxTokens?: number; // cap on the reply length
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_DEADLINE_MS = 30_000;
const DEFAULT_MAX_TOKENS = 800;
const MIN_ATTEMPT_MS = 3_000; // starting a retry with less time left than this cannot finish
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Caps in-flight model calls for the whole server process.
const MAX_CONCURRENT = 4;
let active = 0;
const waiting: Array<() => void> = [];

// Waits for a free slot, but never longer than the caller can afford.
function acquire(maxWaitMs: number): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const turn = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      const i = waiting.indexOf(turn);
      if (i >= 0) waiting.splice(i, 1);
      reject(new LlmError("every model slot stayed busy", "timeout"));
    }, Math.max(0, maxWaitMs));
    waiting.push(turn);
  });
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
  const deadlineMs = opts.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const deadlineAt = now() + deadlineMs; // the clock starts before queueing
  // Grows on invalid output: the model sees what it got wrong instead of repeating it.
  let messages = opts.messages;

  await acquire(deadlineMs);
  try {
    let lastError: LlmError = new LlmError("no attempts made", "network");
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const remaining = deadlineAt - now();
      if (remaining <= 0 || (attempt > 1 && remaining < MIN_ATTEMPT_MS)) {
        lastError = new LlmError("model call ran out of time", "timeout");
        break;
      }
      const started = now();
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
            max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
          }),
          signal: AbortSignal.timeout(Math.min(timeoutMs, remaining)),
        });

        if (!res.ok) {
          retryAfter = res.headers.get("retry-after");
          const retryable = res.status === 429 || res.status >= 500;
          lastError = new LlmError(`OpenRouter HTTP ${res.status}`, "http", res.status);
          if (!retryable) throw Object.assign(lastError, { fatal: true });
        } else {
          const body = await res.json();
          const choice = body?.choices?.[0];
          const content = choice?.message?.content;
          if (typeof content !== "string") throw new Error("response had no message content");
          rejected = content;
          if (choice?.finish_reason === "length") throw new Error("reply was cut off at the token limit");
          const value = opts.validate(extractJson(content));
          log("info", "llm.ok", { label: opts.label, attempt, ms: now() - started, model });
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
        ms: now() - started,
      });
      if (attempt < maxAttempts) {
        const pause = backoffMs(attempt, retryAfter);
        // No point pausing if the next attempt would not have enough time left to finish.
        if (deadlineAt - now() - pause < MIN_ATTEMPT_MS) {
          lastError = new LlmError("model call ran out of time", "timeout");
          break;
        }
        await sleep(pause);
      }
    }
    log("error", "llm.failed", { label: opts.label, kind: lastError.kind, reason: lastError.message, ms: now() - (deadlineAt - deadlineMs) });
    throw lastError;
  } finally {
    release();
  }
}
