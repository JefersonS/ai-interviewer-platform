export type Job = {
  id: string;
  title: string;
  description: string;
  // Used to ground the interviewer prompt in the role.
  focusAreas: string[];
};

export const JOBS: Job[] = [
  {
    id: "backend-engineer",
    title: "Backend Engineer",
    description:
      "Design and run the APIs and data pipelines behind a high-traffic product.",
    focusAreas: [
      "API design",
      "databases and data modeling",
      "reliability and debugging in production",
      "scaling and performance",
    ],
  },
  {
    id: "frontend-engineer",
    title: "Frontend Engineer",
    description:
      "Build fast, accessible web interfaces with React and TypeScript.",
    focusAreas: [
      "React and state management",
      "performance and rendering",
      "accessibility",
      "working with designers and APIs",
    ],
  },
  {
    id: "product-manager",
    title: "Product Manager",
    description:
      "Own the roadmap for a product area, from discovery to launch.",
    focusAreas: [
      "prioritization and tradeoffs",
      "customer discovery",
      "metrics and experimentation",
      "stakeholder communication",
    ],
  },
];

export function getJob(id: string): Job | undefined {
  return JOBS.find((j) => j.id === id);
}
