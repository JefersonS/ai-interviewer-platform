import { guard } from "@/lib/guard";
import { translationPrompt, validateEvaluation, validateTranslation } from "@/lib/interview";
import { isLang } from "@/lib/languages";
import { chatJson, LlmError } from "@/lib/llm";
import { log } from "@/lib/logger";

// View-only: the client keeps the English evaluation as the record and asks for a
// translation to show. Nothing is stored here.
export async function POST(request: Request) {
  const blocked = guard(request);
  if (blocked) return blocked;

  let body: { language?: unknown; evaluation?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

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
      validate: (raw) => validateTranslation(raw, original),
    });
    return Response.json({ evaluation });
  } catch (e) {
    const kind = e instanceof LlmError ? e.kind : "unknown";
    log("error", "translate.failed", { language, kind });
    return Response.json({ error: "Translation failed, please retry." }, { status: 502 });
  }
}
