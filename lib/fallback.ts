import { difficultyFor, type AskDecision, type NextQuestion, type Turn } from "./interview";
import type { Job } from "./jobs";
import { bankQuestion } from "./questions";

const GREETING = "Hi, I'm your AI interviewer, thanks for joining.";
const REACTIONS = ["Thanks for sharing that.", "Got it, thank you.", "That's helpful, thanks."];

const PROBES = [
  (quote: string) => `You mentioned "${quote}". Can you walk me through a concrete example of that?`,
  (quote: string) => `Earlier you said "${quote}". What was the hardest part of that, and how did you handle it?`,
  (quote: string) => `On "${quote}": what would you do differently if you did it again?`,
];

// Used when the model could not produce a valid question. It follows the same policy
// (kind, area, difficulty) as a model question, so the interview stays on track.
// Rating is unknown, so difficulty is the base for this point in the interview.
export function fallbackQuestion(job: Job, history: Turn[], decision: AskDecision): NextQuestion {
  const asked = history.filter((t): t is Extract<Turn, { role: "interviewer" }> => t.role === "interviewer");
  const index = asked.length;
  const difficulty = difficultyFor(index, null);
  const reaction = index === 0 ? GREETING : REACTIONS[index % REACTIONS.length];
  const common = { difficulty, assessment: null, source: "fallback" } as const;

  if (index > 0 && decision.allowed.length === 1 && decision.allowed[0] === "follow_up") {
    const lastAnswer = history[history.length - 1].text;
    const quote = lastAnswer.replace(/["\n]/g, " ").split(/\s+/).filter(Boolean).slice(0, 12).join(" ");
    const followUps = asked.filter((t) => t.kind === "follow_up").length;
    return {
      question: `${reaction} ${PROBES[followUps % PROBES.length](quote)}`,
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
  const options = bankQuestion(job.id, area, difficulty);
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
