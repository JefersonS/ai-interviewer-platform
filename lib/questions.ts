import type { Difficulty } from "./interview";
import type { Lang } from "./languages";
import { QUESTION_BANK_PT } from "./questions.pt";

export type Bank = Record<string, Record<string, [string, string, string, string]>>;

// Fixed questions used only when the model fails. One per difficulty level (1 to 4)
// for every focus area, so the interview can always continue at the right pace.
// Keys must match each job's focusAreas exactly; a test checks this.
export const QUESTION_BANK: Bank = {
  "backend-engineer": {
    "API design": [
      "To start, how would you describe the kind of APIs you have built and who used them?",
      "How do you decide how to structure an endpoint and its error responses?",
      "How would you handle versioning and backward compatibility when an API already has many clients?",
      "Imagine two teams need conflicting changes to a shared API. How would you resolve it and protect existing consumers?",
    ],
    "databases and data modeling": [
      "What databases have you worked with, and what did you like or dislike about them?",
      "How do you decide which tables and indexes to create for a new feature?",
      "How would you change a large table's schema in production without downtime?",
      "When would you denormalize or split a database, and how would you manage consistency afterwards?",
    ],
    "reliability and debugging in production": [
      "How do you usually find out that something is wrong in production?",
      "Can you walk me through how you debug a production issue, starting from the first alert?",
      "How do you design a service so that one failing dependency does not take everything down?",
      "Tell me how you would track down a hard-to-reproduce production failure with very limited data.",
    ],
    "scaling and performance": [
      "What is the highest traffic system you have worked on, in simple terms?",
      "How do you figure out what is making a service slow?",
      "How would you scale a service that suddenly gets ten times more traffic?",
      "How would you decide between scaling up, scaling out, and re-architecting when cost and deadlines both matter?",
    ],
  },
  "frontend-engineer": {
    "React and state management": [
      "What kinds of React applications have you built?",
      "How do you decide where a piece of state should live?",
      "How would you manage server data, caching and loading states in a large React app?",
      "How would you untangle a codebase where state is shared everywhere and every change causes bugs?",
    ],
    "performance and rendering": [
      "How do you notice that a page feels slow?",
      "What do you check first when a component re-renders too often?",
      "How would you speed up a page that loads a huge list or a heavy bundle?",
      "How would you set and enforce a performance budget across a team that ships features every week?",
    ],
    accessibility: [
      "What does accessibility mean to you in day-to-day frontend work?",
      "How do you make a custom dropdown or modal usable with only a keyboard?",
      "How do you test accessibility, and what do you do when a design is not accessible?",
      "How would you build accessibility into the team's process when deadlines push the other way?",
    ],
    "working with designers and APIs": [
      "How do you usually work with designers and backend engineers?",
      "What do you do when a design is unclear or is missing states like loading or errors?",
      "How do you keep the frontend moving when the API is not ready yet?",
      "Design and the API disagree about how a feature should work. How do you resolve it?",
    ],
  },
  "product-manager": {
    "prioritization and tradeoffs": [
      "How do you usually decide what to work on next?",
      "How do you choose between two good features when you can only build one?",
      "How would you say no to an important stakeholder's request and keep the relationship healthy?",
      "You have a fixed deadline and a shrinking team. How do you rework the roadmap and explain the tradeoffs?",
    ],
    "customer discovery": [
      "How do you usually learn what customers need?",
      "How do you run a customer interview so that you get honest answers?",
      "How do you tell the difference between what customers ask for and what they actually need?",
      "How would you do discovery for a product when you cannot easily reach the customers?",
    ],
    "metrics and experimentation": [
      "What metrics do you look at for a product you own?",
      "How do you pick a success metric for a new feature?",
      "How would you design an experiment, and what would make you stop it early?",
      "A metric goes up while customer complaints also go up. How do you investigate and decide what to do?",
    ],
    "stakeholder communication": [
      "How do you keep people informed about what your team is building?",
      "How do you handle stakeholders who disagree about priorities?",
      "How do you communicate a delay or a failed launch to leadership?",
      "How would you align engineering, sales and support when each wants a different outcome?",
    ],
  },
};

export const QUESTION_BANKS: Record<Lang, Bank> = { en: QUESTION_BANK, "pt-BR": QUESTION_BANK_PT };

// Returns all four variants for an area, ordered by closeness to the wanted difficulty.
export function bankQuestion(jobId: string, area: string, difficulty: Difficulty, lang: Lang = "en"): string[] {
  const variants = QUESTION_BANKS[lang][jobId]?.[area] ?? [];
  return variants
    .map((text, i) => ({ text, distance: Math.abs(i + 1 - difficulty), i }))
    .sort((a, b) => a.distance - b.distance || a.i - b.i)
    .map((v) => v.text);
}
