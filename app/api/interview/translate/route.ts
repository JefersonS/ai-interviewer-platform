import { guard, readJsonBody } from "@/lib/guard";
import { translationPrompt, validateEvaluation, validateTranslation } from "@/lib/interview";
import { isLang } from "@/lib/languages";
import { chatJson, LlmError } from "@/lib/llm";
import { log } from "@/lib/logger";

// View-only: the client keeps the English evaluation as the record and asks for a
// translation to show. Nothing is stored here.
export async function POST(request: Request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value as { language?: unknown; evaluation?: unknown };

  if (!isLang(body.language) || body.language === "en") {
    return Response.json({ error: "language must be a supported language other than English" }, { status: 400 });
  }
  const language = body.language;

  let original;
  try {
    original = validateEvaluation(body.evaluation);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  try {
    const evaluation = await chatJson({
      label: `translate:${language}`,
      messages: translationPrompt(original, language),
      deadlineMs: 40_000,
      maxTokens: 900,
      validate: (raw) => validateTranslation(raw, original),
    });
    return Response.json({ evaluation });
  } catch (e) {
    const kind = e instanceof LlmError ? e.kind : "unknown";
    log("error", "translate.failed", { language, kind });
    return Response.json({ error: "Translation failed, please retry." }, { status: 502 });
  }
}
