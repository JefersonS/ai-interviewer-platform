export type Scenario = {
  id: string;
  jobId: string;
  persona: "strong" | "weak";
  answers: string[]; // one per question, in order
  clarifyAfter?: number; // 0-based question index at which the candidate asks for clarification
  // Only used by the offline fake model:
  eager: boolean; // follow up whenever the policy leaves the choice open
  flakyAtQuestion?: number; // fake model gets this question's difficulty wrong until it is told why
};

export const SCENARIOS: Scenario[] = [
  {
    id: "backend-strong",
    jobId: "backend-engineer",
    persona: "strong",
    eager: true,
    flakyAtQuestion: 3,
    answers: [
      "I built a payments API in Node with Postgres handling about 2000 requests per second, and I added idempotency keys after we had duplicate charges.",
      "Mostly I used read replicas and caching with Redis, but cache invalidation caused a few stale-balance bugs that we fixed with short TTLs and write-through updates.",
      "We had an outage when a migration locked a big table. I rolled back, then moved us to online migrations with backfills in small batches.",
      "I monitor with Grafana dashboards and alerts on p99 latency and error rate, and every alert links to a runbook.",
      "For scaling I would first profile, then add indexes, then consider sharding only if a single primary cannot keep up.",
      "I like pairing with frontend engineers to agree on API contracts early, written down in an OpenAPI file.",
      "I would like to learn more about event-driven architectures and how to keep consumers idempotent.",
    ],
  },
  {
    id: "backend-weak",
    jobId: "backend-engineer",
    persona: "weak",
    eager: false,
    clarifyAfter: 1,
    answers: [
      "I have worked on some APIs, nothing special.",
      "We just used the database the team picked.",
      "Things broke sometimes and we restarted them.",
      "I check the logs when someone complains.",
      "I am not sure, probably add more servers.",
      "I mostly work alone.",
      "Not really, I cannot think of anything.",
    ],
  },
  {
    id: "frontend-strong",
    jobId: "frontend-engineer",
    persona: "strong",
    eager: true,
    flakyAtQuestion: 3,
    answers: [
      "I built a React and TypeScript dashboard used by 50 thousand people, and moving data fetching to the server cut load time by 40 percent.",
      "I used React Query for server state and kept local UI state in useReducer, because a global store caused rerender storms in large tables.",
      "We profiled with React DevTools and Lighthouse, then virtualized the long lists and split the bundle by route.",
      "I audited with axe and keyboard-only testing, fixed focus traps in modals, and added proper ARIA labels.",
      "When designers hand off a spec I flag edge cases early, like loading and empty states, and we agree on tokens for spacing and color.",
      "We mock the API with MSW so frontend work is not blocked, and agree on response shapes in a shared OpenAPI file.",
      "I want to go deeper on web performance budgets and measuring real user metrics.",
    ],
  },
  {
    id: "frontend-weak",
    jobId: "frontend-engineer",
    persona: "weak",
    eager: false,
    clarifyAfter: 1,
    answers: [
      "I did some React, mostly copy and paste from older components.",
      "I use useState for everything, it works.",
      "It was slow sometimes but I did not look into why.",
      "Accessibility is mostly the designer's job I think.",
      "I just build what the ticket says.",
      "The backend team tells me what the API returns.",
      "I do not have any questions.",
    ],
  },
  {
    id: "pm-strong",
    jobId: "product-manager",
    persona: "strong",
    eager: true,
    flakyAtQuestion: 3,
    answers: [
      "I led a checkout redesign for a marketplace. I interviewed 20 buyers, found surprise fees drove drop-off, and showing total cost early lifted conversion by 8 percent.",
      "We had 12 requests and limited engineers, so I scored them by reach, impact and effort, cut the lowest three, and told those stakeholders why.",
      "I set conversion as the primary metric with refund rate as a guardrail, and ran a two week A/B test with a minimum sample size agreed beforehand.",
      "Sales wanted a custom feature for one big client. I showed usage data that only one account needed it and proposed a configurable option for the roadmap instead.",
      "Early on I write a one page brief with the problem, success metrics and non-goals, and review it with engineering and design before any build starts.",
      "I do weekly customer calls and tag the notes by theme so patterns show up before they become support tickets.",
      "I would like more experience with pricing and monetization decisions.",
    ],
  },
  {
    id: "pm-weak",
    jobId: "product-manager",
    persona: "weak",
    eager: false,
    clarifyAfter: 1,
    answers: [
      "I managed some projects and talked to the team.",
      "I prioritized by what the loudest person wanted.",
      "We looked at whether people liked it.",
      "I said yes to most requests to keep everyone happy.",
      "I send updates when I remember.",
      "Customers mostly email support, I have not spoken to them much.",
      "Nothing comes to mind.",
    ],
  },
];
