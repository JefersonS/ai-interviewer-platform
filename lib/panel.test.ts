import { describe, expect, it } from "vitest";
import type { Assessment, Difficulty, QuestionKind, Turn } from "./interview";
import { JOBS } from "./jobs";
import { panelState } from "./panel";

const job = JOBS[0];
const [A1, A2, A3, A4] = job.focusAreas;

type Opts = { area?: string; difficulty?: Difficulty; assessment?: Assessment | null; skills?: string[]; reasoning?: string; references?: string; source?: "fallback" };
const q = (kind: QuestionKind, o: Opts = {}): Turn => ({
  role: "interviewer",
  text: "Q?",
  kind,
  topic: "t",
  area: o.area ?? A1,
  reasoning: o.reasoning ?? "r",
  references: o.references ?? (kind === "follow_up" ? "a quote" : ""),
  difficulty: o.difficulty ?? 1,
  assessment: o.assessment ?? null,
  skills: o.skills ?? [],
  ...(o.source ? { source: o.source } : {}),
});
const a: Turn = { role: "candidate", text: "An answer" };
const run = (...qs: Turn[]): Turn[] => qs.flatMap((t) => [t, a]);

describe("panelState: empty and basic", () => {
  it("has nothing to show before the first question", () => {
    const p = panelState(job, []);
    expect(p.current).toBeNull();
    expect(p.asked).toBe(0);
    expect(p.areas.every((x) => x.status === "gap")).toBe(true);
    expect(p.skills).toEqual([]);
    expect(p.nextRule).toBe("Waiting for the first question.");
  });

  it("describes the current question and why it was chosen", () => {
    const turns = run(q("new_topic")).concat(q("follow_up", { difficulty: 2, assessment: "strong", reasoning: "Probing the caching claim", references: "read replicas and caching", area: A1 }));
    const { current } = panelState(job, turns);
    expect(current).toMatchObject({ n: 2, kind: "follow_up", area: A1, difficulty: 2, levelName: "Core", assessment: "strong", reasoning: "Probing the caching claim", quote: "read replicas and caching", fromBank: false });
  });

  it("flags questions that came from the bank", () => {
    expect(panelState(job, [q("new_topic", { source: "fallback" })]).current?.fromBank).toBe(true);
  });
});

describe("panelState: topics and budget", () => {
  it("marks each area as current, covered, or a gap, with counts", () => {
    const p = panelState(job, run(q("new_topic", { area: A1 }), q("follow_up", { area: A1 })).concat(q("new_topic", { area: A2 })));
    expect(p.areas).toEqual([
      { name: A1, asked: 2, status: "covered" },
      { name: A2, asked: 1, status: "current" },
      { name: A3, asked: 0, status: "gap" },
      { name: A4, asked: 0, status: "gap" },
    ]);
  });

  it("counts follow-ups against the budget (7 questions minus 4 areas = 3)", () => {
    const p = panelState(job, run(q("new_topic"), q("follow_up"), q("follow_up")));
    expect(p.followUps).toEqual({ used: 2, budget: 3, min: 2 });
  });
});

describe("panelState: trail and skills", () => {
  it("attaches each answer's rating to the question it answered", () => {
    const turns = run(q("new_topic", { assessment: null }), q("follow_up", { assessment: "strong", difficulty: 2 })).concat(q("new_topic", { assessment: "weak", difficulty: 1, area: A2 }));
    const { trail } = panelState(job, turns);
    expect(trail.map((t) => [t.n, t.difficulty, t.rating])).toEqual([
      [1, 1, "strong"], // answer 1 was rated strong, noted on question 2
      [2, 2, "weak"],
      [3, 1, undefined], // question 3 is still open
    ]);
  });

  it("collects skills across turns without duplicates, ignoring case and punctuation", () => {
    const turns = run(q("new_topic", { skills: [] }), q("follow_up", { skills: ["Node.js", "Postgres"] })).concat(q("new_topic", { skills: ["node js", "Redis"], area: A2 }));
    expect(panelState(job, turns).skills).toEqual(["Node.js", "Postgres", "Redis"]);
  });
});

describe("panelState: rule for the next question", () => {
  it("is a free choice early on, and says how many follow-ups are affordable", () => {
    const p = panelState(job, [q("new_topic")]);
    expect(p.nextRule).toMatch(/^Free choice/);
    expect(p.nextRule).toContain("3 follow-ups still affordable");
    expect(p.nextRule).toContain(A2); // an uncovered area it may open
  });

  it("forces a new area when the follow-up budget is spent", () => {
    const p = panelState(job, run(q("new_topic"), q("follow_up"), q("follow_up")).concat(q("follow_up")));
    expect(p.nextRule).toContain("No follow-up slots left");
    expect(p.nextRule).toContain("must open an uncovered area");
    expect(p.nextRule).toContain(A2);
    expect(p.nextRule).not.toContain(A1);
  });

  it("forces a follow-up when the minimum would otherwise be missed", () => {
    // all four areas covered by new topics, one more new topic: 2 slots left, 2 follow-ups owed
    const turns = run(q("new_topic", { area: A1 }), q("new_topic", { area: A2 }), q("new_topic", { area: A3 }), q("new_topic", { area: A4 })).concat(q("new_topic", { area: A1 }));
    expect(panelState(job, turns).nextRule).toMatch(/must be a follow-up/);
  });

  it("says so when the last question has been asked", () => {
    const seven = run(...Array.from({ length: 7 }, (_, i) => q("new_topic", { area: job.focusAreas[i % 4] })));
    expect(panelState(job, seven).nextRule).toBe("That was the last question.");
  });
});
