import type { Scenario } from "./scenarios";

type Message = { role: string; content: string };

// Stands in for OpenRouter. It reads the same prompts the real model sees and
// answers like a compliant model would, so the real routes, policy, validators
// and retry logic all run for real. If the prompt wording changes in a way that
// breaks these patterns, the conversation tests fail, which is the point.
export function fakeModel(scn: Scenario) {
  let calls = 0;
  const questionPrompts: string[] = [];

  const questionPayload = (system: string, messages: Message[]) => {
    const idx = Number(/question (\d+) of/.exec(system)?.[1]) - 1;
    let difficulty = 1; // the opening prompt states this outright
    if (idx > 0) {
      const levels = /strong -> (\d), adequate -> (\d), weak -> (\d)/.exec(system);
      if (!levels) throw new Error("fake model: no difficulty levels in prompt");
      difficulty = Number(scn.persona === "strong" ? levels[1] : levels[3]);
    }

    // Reproduces a real failure: wrong difficulty until the retry explains the rejection.
    const repaired = messages.some((m) => m.content.includes("Your reply was rejected"));
    if (idx === scn.flakyAtQuestion && !repaired) difficulty = (difficulty % 4) + 1;

    const areas = /exactly one of[^:\n]*: (.+)\.$/m.exec(system)?.[1].split("; ") ?? [];
    const mustFollowUp = system.includes("You MUST ask a follow_up");
    const mustMoveOn = idx === 0 || /kind must be "new_topic"/.test(system);
    const kind = mustFollowUp ? "follow_up" : mustMoveOn ? "new_topic" : scn.eager ? "follow_up" : "new_topic";

    const lastAnswer = [...(messages.find((m) => m.role === "user")?.content ?? "").matchAll(/^Candidate: (.+)$/gm)].pop()?.[1] ?? "";
    // One real word from the last answer plus an invented skill, so the filter is exercised end to end.
    const realWord = lastAnswer.split(/\W+/).find((w) => w.length > 4);
    return {
      skills: idx === 0 || !realWord ? [] : [realWord, "Invented Skill 123"],
      assessment: idx === 0 ? null : scn.persona,
      reaction: idx === 0 ? "Hi, I'm your AI interviewer." : "Thanks for sharing that.",
      question: `Question ${idx + 1}: tell me more about this?`,
      kind,
      area: kind === "new_topic" ? areas[0] : "",
      difficulty,
      topic: `topic ${idx + 1}`,
      reasoning: "Scripted fake model.",
      references: kind === "follow_up" ? lastAnswer.split(" ").slice(0, 6).join(" ") : "",
    };
  };

  const fetchImpl = async (_url: unknown, init: { body: string }) => {
    calls++;
    const { messages } = JSON.parse(init.body) as { messages: Message[] };
    const system = messages[0].content;

    let payload: unknown;
    if (system.startsWith("You are a friendly, professional interviewer")) {
      questionPrompts.push(system);
      const idx = Number(/question (\d+) of/.exec(system)?.[1]) - 1;
      const fails = scn.failQuestions === "all" || (Array.isArray(scn.failQuestions) && scn.failQuestions.includes(idx));
      if (fails) return new Response(JSON.stringify({ choices: [{ message: { content: "Sorry, I cannot do that." } }] }), { status: 200 });
      payload = questionPayload(system, messages);
    }
    else if (system.startsWith("You evaluate a voice interview")) {
      payload = {
        strengths: ["Clear examples"],
        concerns: ["Could go deeper"],
        overall_score: scn.persona === "strong" ? 8 : 3,
        summary: "Scripted evaluation.",
      };
    } else if (system.startsWith("You are the interviewer for the role")) {
      payload = { reply: "Sure, think of a recent project. Over to you." };
    } else throw new Error(`fake model: unrecognized prompt: ${system.slice(0, 60)}`);

    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(payload) } }] }), { status: 200 });
  };

  return { fetchImpl, calls: () => calls, questionPrompts: () => questionPrompts };
}
