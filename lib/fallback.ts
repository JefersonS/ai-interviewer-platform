import type { Candidate } from "./candidate";
import { difficultyFor, type AskDecision, type NextQuestion, type Turn } from "./interview";
import type { Job } from "./jobs";
import type { Lang } from "./languages";
import { bankQuestion } from "./questions";

// Fixed phrases for the fallback path, per interview language.
const PHRASES: Record<Lang, { greeting: (name: string) => string; reactions: string[]; probes: ((quote: string) => string)[] }> = {
  en: {
    greeting: (name) => `Hi${name ? ` ${name}` : ""}, I'm your AI interviewer, thanks for joining.`,
    reactions: ["Thanks for sharing that.", "Got it, thank you.", "That's helpful, thanks."],
    probes: [
      (quote) => `You mentioned "${quote}". Can you walk me through a concrete example of that?`,
      (quote) => `Earlier you said "${quote}". What was the hardest part of that, and how did you handle it?`,
      (quote) => `On "${quote}": what would you do differently if you did it again?`,
    ],
  },
  "pt-BR": {
    greeting: (name) => `Olá${name ? `, ${name}` : ""}, eu sou seu entrevistador de IA, obrigado por participar.`,
    reactions: ["Obrigado por compartilhar isso.", "Entendi, obrigado.", "Isso ajuda, obrigado."],
    probes: [
      (quote) => `Você mencionou "${quote}". Pode me guiar por um exemplo concreto disso?`,
      (quote) => `Antes você disse "${quote}". Qual foi a parte mais difícil disso e como você lidou com ela?`,
      (quote) => `Sobre "${quote}": o que você faria diferente se fizesse de novo?`,
    ],
  },
};

// Used when the model could not produce a valid question. It follows the same policy
// (kind, area, difficulty) as a model question, so the interview stays on track.
// Rating is unknown, so difficulty is the base for this point in the interview.
export function fallbackQuestion(job: Job, history: Turn[], decision: AskDecision, candidate: Candidate): NextQuestion {
  const phrases = PHRASES[candidate.language];
  const asked = history.filter((t): t is Extract<Turn, { role: "interviewer" }> => t.role === "interviewer");
  const index = asked.length;
  const difficulty = difficultyFor(index, null);
  const reaction = index === 0 ? phrases.greeting(candidate.name) : phrases.reactions[index % phrases.reactions.length];
  // A fixed question cannot rate the last answer or detect skills.
  const common: Pick<NextQuestion, "difficulty" | "assessment" | "skills" | "source"> = {
    difficulty,
    assessment: null,
    skills: [],
    source: "fallback",
  };

  if (index > 0 && decision.allowed.length === 1 && decision.allowed[0] === "follow_up") {
    const lastAnswer = history[history.length - 1].text;
    const quote = lastAnswer.replace(/["\n]/g, " ").split(/\s+/).filter(Boolean).slice(0, 12).join(" ");
    const followUps = asked.filter((t) => t.kind === "follow_up").length;
    return {
      question: `${reaction} ${phrases.probes[followUps % phrases.probes.length](quote)}`,
      kind: "follow_up",
      topic: "follow-up",
      area: decision.parentArea ?? "",
      reasoning: "Fallback: the model was unavailable, so a generic probe quoting the last answer was used.",
      references: quote,
      ...common,
    };
  }

  // New topic: prefer the area asked about least so far (an uncovered area when one exists).
  const asks = (area: string) => asked.filter((t) => t.area === area).length;
  const area = [...decision.newTopicAreas].sort((x, y) => asks(x) - asks(y))[0];
  const options = bankQuestion(job.id, area, difficulty, candidate.language);
  const text = options.find((q) => !asked.some((t) => t.text.includes(q))) ?? options[0];
  return {
    question: `${reaction} ${text}`,
    kind: "new_topic",
    topic: area,
    area,
    reasoning: "Fallback: the model was unavailable, so a question from the role's question bank was used.",
    references: "",
    ...common,
  };
}
