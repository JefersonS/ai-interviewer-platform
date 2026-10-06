import type { Candidate } from "@/lib/candidate";

export type Scenario = {
  id: string;
  candidate?: Candidate; // omitted = English, no name
  jobId: string;
  persona: "strong" | "weak";
  answers: string[]; // one per question, in order
  clarifyAfter?: number; // 0-based question index at which the candidate asks for clarification
  // Only used by the offline fake model:
  eager: boolean; // follow up whenever the policy leaves the choice open
  flakyAtQuestion?: number; // fake model omits the rating of the previous answer at this question until it is told why
  failQuestions?: "all" | number[]; // fake model returns garbage for these questions (0-based), forcing the fallback
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
  {
    id: "backend-pt-strong",
    jobId: "backend-engineer",
    candidate: { name: "Ana", language: "pt-BR" },
    persona: "strong",
    eager: true,
    answers: [
      "Construí uma API de pagamentos em Node com Postgres que atendia cerca de duas mil requisições por segundo, e adicionei chaves de idempotência depois de cobranças duplicadas.",
      "Usei réplicas de leitura e cache com Redis, mas a invalidação do cache gerou alguns bugs de saldo desatualizado, que resolvemos com TTLs curtos e atualização write-through.",
      "Tivemos uma queda quando uma migração travou uma tabela grande. Fiz rollback e depois passamos a usar migrações online, com preenchimento em lotes pequenos.",
      "Eu monitoro com dashboards no Grafana e alertas de latência p99 e taxa de erro, e cada alerta aponta para um runbook.",
      "Para escalar, primeiro eu faria profiling, depois adicionaria índices, e só consideraria sharding se um único primário não aguentasse.",
      "Gosto de trabalhar junto com os engenheiros de frontend para combinar o contrato da API cedo, documentado em um arquivo OpenAPI.",
      "Quero aprender mais sobre arquiteturas orientadas a eventos e como manter consumidores idempotentes.",
    ],
  },
  {
    id: "pm-pt-weak",
    jobId: "product-manager",
    candidate: { name: "Ana", language: "pt-BR" },
    persona: "weak",
    eager: false,
    clarifyAfter: 1,
    answers: [
      "Eu gerenciei alguns projetos e conversei com a equipe.",
      "Eu priorizava pelo que a pessoa que falava mais alto queria.",
      "A gente olhava se as pessoas tinham gostado.",
      "Eu dizia sim para quase todos os pedidos para deixar todo mundo feliz.",
      "Eu mando atualizações quando lembro.",
      "Os clientes quase sempre escrevem para o suporte, eu não falei muito com eles.",
      "Nada me vem à cabeça.",
    ],
  },
];
