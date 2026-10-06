import type { Assessment, QuestionKind } from "@/lib/interview";
import type { PanelState, Step } from "@/lib/panel";

const RATING_BAR: Record<Assessment, string> = { strong: "bg-emerald-500", adequate: "bg-amber-400", weak: "bg-rose-500" };
const RATING_PILL: Record<Assessment, string> = {
  strong: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  adequate: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  weak: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      {children}
    </section>
  );
}

function KindBadge({ kind }: { kind: QuestionKind }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${kind === "follow_up" ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200" : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"}`}>
      {kind === "follow_up" ? "Follow-up" : "New topic"}
    </span>
  );
}

const Chip = ({ children }: { children: React.ReactNode }) => <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs dark:bg-zinc-800">{children}</span>;

function RatingPill({ rating }: { rating: Assessment }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RATING_PILL[rating]}`}>{rating}</span>;
}

function StepCard({ step }: { step: Step }) {
  return (
    <li className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-zinc-500">Q{step.n}</span>
        <KindBadge kind={step.kind} />
        <Chip>{step.area}</Chip>
        <Chip>
          {step.levelName} · {step.difficulty}/4
        </Chip>
        {step.rating && (
          <span className="ml-auto flex items-center gap-1 text-xs text-zinc-500">
            answer <RatingPill rating={step.rating} />
          </span>
        )}
      </div>
      {step.quote && <p className="mt-2 text-xs text-zinc-500">Builds on: &ldquo;{step.quote}&rdquo;</p>}
      {step.reasoning && <p className="mt-1.5 text-zinc-700 dark:text-zinc-300">{step.reasoning}</p>}
      {step.fromBank && <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">Fixed question from the bank: the model was unavailable.</p>}
    </li>
  );
}

// "live" sits beside the chat during the interview. "final" is the read-only view on the summary page.
export default function DecisionPanel({ state, onClose, mode = "live" }: { state: PanelState; onClose?: () => void; mode?: "live" | "final" }) {
  const { current } = state;
  const live = mode === "live";
  return (
    <div className="space-y-6 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{live ? "Decision panel" : "How the interviewer decided"}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{live ? "What the interviewer is tracking, and why it asked this." : "Topic coverage, pacing, and the reasoning behind each question."}</p>
        </div>
        {live && (
          <button onClick={onClose} className="rounded-full border border-zinc-300 px-3 py-1 text-xs transition hover:bg-zinc-100 active:scale-95 dark:border-zinc-700 dark:hover:bg-zinc-800 lg:hidden">
            Close
          </button>
        )}
      </div>

      {live && (
        <Section title="Why this question">
          {current ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <KindBadge kind={current.kind} />
                <Chip>{current.area}</Chip>
                <Chip>
                  {current.levelName} · {current.difficulty}/4
                </Chip>
              </div>
              {current.assessment && (
                <p className="text-xs text-zinc-500">
                  Previous answer rated <RatingPill rating={current.assessment} />, which set this difficulty.
                </p>
              )}
              {current.quote && <p className="text-xs text-zinc-500">Builds on: &ldquo;{current.quote}&rdquo;</p>}
              {current.reasoning && <blockquote className="border-l-2 border-indigo-400 pl-3 text-zinc-700 dark:text-zinc-300">{current.reasoning}</blockquote>}
              {current.fromBank && (
                <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  The model was unavailable, so a fixed question from the role&apos;s question bank was used.
                </p>
              )}
            </div>
          ) : (
            <p className="text-zinc-500">Waiting for the first question.</p>
          )}
        </Section>
      )}

      <Section title="Topics">
        <ul className="space-y-1.5">
          {state.areas.map((a) => (
            <li key={a.name} className="flex items-center gap-2">
              <span
                aria-hidden
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  a.status === "current" ? "bg-indigo-600 text-white" : a.status === "covered" ? "bg-emerald-500 text-white" : "border border-zinc-300 text-transparent dark:border-zinc-600"
                }`}
              >
                {a.status === "covered" ? "✓" : a.status === "current" ? "•" : "·"}
              </span>
              <span className={a.status === "gap" ? "text-zinc-500" : ""}>{a.name}</span>
              <span className="ml-auto text-xs text-zinc-500">{a.status === "gap" ? "not yet" : `${a.asked} asked`}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Follow-ups">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: state.followUps.budget }, (_, i) => (
            <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < state.followUps.used ? "bg-indigo-600" : "bg-zinc-200 dark:bg-zinc-700"}`} />
          ))}
          <span className="ml-2 text-xs text-zinc-500">
            {state.followUps.used} of {state.followUps.budget} used, at least {state.followUps.min} required
          </span>
        </div>
      </Section>

      <Section title="Difficulty and ratings">
        <div className="flex h-16 items-end gap-1" role="img" aria-label="Difficulty of each question">
          {Array.from({ length: state.total }, (_, i) => {
            const step = state.trail[i];
            return (
              <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={step ? `Question ${step.n}: difficulty ${step.difficulty}/4${step.rating ? `, answer rated ${step.rating}` : ""}` : `Question ${i + 1}: not asked yet`}>
                {step ? (
                  <div className={`w-full rounded-sm ${step.rating ? RATING_BAR[step.rating] : "bg-zinc-300 dark:bg-zinc-600"}`} style={{ height: `${step.difficulty * 25}%` }} />
                ) : (
                  <div className="h-1 w-full rounded-sm border border-dashed border-zinc-300 dark:border-zinc-700" />
                )}
                <span className="text-[10px] text-zinc-500">{i + 1}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-zinc-500">Bar height is the question&apos;s difficulty. Colour is how the answer to it was rated (green strong, amber adequate, red weak, grey not rated yet).</p>
      </Section>

      <Section title="Skills detected">
        {state.skills.length ? (
          <div className="flex flex-wrap gap-1.5">
            {state.skills.map((skill) => (
              <span key={skill} className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200">
                {skill}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-zinc-500">None yet.</p>
        )}
      </Section>

      {live ? (
        <Section title={state.complete ? "Status" : "Rule for the next question"}>
          <p className="text-zinc-700 dark:text-zinc-300">{state.nextRule}</p>
        </Section>
      ) : (
        <Section title="Question by question">
          <ol className="space-y-2">
            {state.steps.map((step) => (
              <StepCard key={step.n} step={step} />
            ))}
          </ol>
        </Section>
      )}
    </div>
  );
}
