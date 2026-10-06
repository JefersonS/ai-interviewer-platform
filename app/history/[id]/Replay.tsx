"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Metrics, SessionRecord } from "@/lib/history";
import type { Turn } from "@/lib/interview";
import { getJob } from "@/lib/jobs";
import { getOwnerId, OWNER_HEADER } from "@/lib/owner";
import { panelState } from "@/lib/panel";
import DecisionPanel from "../../interview/[jobId]/DecisionPanel";
import { fmtDate, fmtDuration, fmtPercent, linkPill } from "../format";

type Loaded = { session: SessionRecord; metrics: Metrics };
type Result = { id: string; data?: Loaded; error?: string; notFound?: boolean };

const STEP_MS = 1500;

const ctl =
  "flex h-9 items-center justify-center gap-1.5 rounded-full border border-zinc-300 px-4 text-sm transition hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-700 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-indigo-950 dark:hover:text-indigo-200";

const Avatar = () => (
  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">AI</div>
);
const Interviewer = ({ text }: { text: string }) => (
  <div className="flex items-start gap-3">
    <Avatar />
    <p className="max-w-[85%] rounded-2xl rounded-tl-md bg-zinc-100 px-4 py-2.5 dark:bg-zinc-800">{text}</p>
  </div>
);
const Candidate = ({ text }: { text: string }) => (
  <div className="flex justify-end">
    <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-white">{text}</p>
  </div>
);

function Bubble({ turn }: { turn: Turn }) {
  if (turn.role === "candidate") return <Candidate text={turn.text} />;
  return (
    <>
      <Interviewer text={turn.text} />
      {(turn.clarifications ?? []).map((c, i) => (
        <div key={i} className="space-y-3">
          <Candidate text={c.ask} />
          <Interviewer text={c.reply} />
        </div>
      ))}
    </>
  );
}

function Stat({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

function Message({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:px-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="mt-2 text-zinc-600 dark:text-zinc-400">{children}</div>
      <Link href="/history" className={`${linkPill} mt-6 inline-block`}>
        &larr; Back to history
      </Link>
    </main>
  );
}

export default function Replay({ id }: { id: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const chat = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { headers: { [OWNER_HEADER]: getOwnerId() } });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) setResult({ id, data: body });
        else setResult({ id, notFound: res.status === 404, error: body.error ?? `Request failed (${res.status})` });
      } catch {
        if (!cancelled) setResult({ id, error: "Could not reach the server. Check your connection and try again." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const loaded = result?.id === id ? result.data : undefined;
  const total = loaded?.session.turns.length ?? 0;
  const isPlaying = playing && step < total; // stops by itself at the end

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => setStep((k) => Math.min(k + 1, total)), STEP_MS);
    return () => clearInterval(timer);
  }, [isPlaying, total]);

  // Scroll the chat box itself, not the page, so the controls stay where they are.
  useEffect(() => {
    chat.current?.scrollTo({ top: chat.current.scrollHeight, behavior: "smooth" });
  }, [step]);

  const job = loaded ? getJob(loaded.session.jobId) : undefined;
  const state = useMemo(
    () => (loaded && job ? panelState(job, loaded.session.turns.slice(0, step), loaded.session.lastAnswer) : null),
    [loaded, job, step],
  );

  if (!result || result.id !== id) return <main className="mx-auto max-w-3xl px-6 py-16 text-zinc-500">Loading...</main>;
  if (result.notFound) return <Message title="Interview not found">This interview is not in this browser&apos;s history. History is private to the browser that finished it.</Message>;
  if (!loaded || !job || !state) return <Message title="Could not load this interview">{result.error ?? "Something went wrong."}</Message>;

  const { session, metrics } = loaded;
  const { evaluation } = session;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <Link href="/history" className="text-sm text-zinc-500 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100">
        &larr; Interview history
      </Link>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">{job.title} interview</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {session.candidate.name || "Unnamed candidate"} · {fmtDate(session.finishedAt)}
      </p>

      <section className="mt-6 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-5xl font-semibold leading-none">{metrics.score}</span>
            <span className="text-zinc-500">/ 10</span>
          </div>
          <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Duration" value={fmtDuration(metrics.durationSeconds)} />
            <Stat label="Coverage" value={`${metrics.coverage.covered}/${metrics.coverage.total} areas`} />
            <Stat label="Talk share (by words)" value={fmtPercent(metrics.talkRatio)} />
            {metrics.avgAnswerSeconds !== null && <Stat label="Avg answer time" value={`${Math.round(metrics.avgAnswerSeconds)} s`} />}
            <Stat wide label="Ratings" value={`${metrics.ratings.strong} strong · ${metrics.ratings.adequate} ok · ${metrics.ratings.weak} weak`} />
            <Stat label="Avg difficulty" value={`${metrics.avgDifficulty} / 4`} />
            <Stat label="Follow-ups" value={String(metrics.followUps)} />
            <Stat label="Skills detected" value={String(metrics.skills)} />
          </dl>
        </div>
        <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">{evaluation.summary}</p>
        <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Strengths</h2>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              {evaluation.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Concerns</h2>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              {evaluation.concerns.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-label="Replay">
          <div ref={chat} className="h-[28rem] space-y-4 overflow-y-auto rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800" aria-live="polite">
            {step === 0 ? (
              <p className="mt-24 text-center text-sm text-zinc-500">Press Play or Next to replay the interview.</p>
            ) : (
              session.turns.slice(0, step).map((turn, i) => <Bubble key={i} turn={turn} />)
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => { setPlaying(false); setStep((k) => Math.max(k - 1, 0)); }} disabled={step === 0} aria-label="Previous step" className={ctl}>
              &larr; Prev
            </button>
            <button
              onClick={() => {
                if (isPlaying) return setPlaying(false);
                if (step >= total) setStep(0);
                setPlaying(true);
              }}
              aria-label={isPlaying ? "Pause replay" : step >= total ? "Replay from the start" : "Play replay"}
              className={`${ctl} bg-indigo-600 text-white hover:bg-indigo-500 hover:text-white dark:border-indigo-600 dark:hover:bg-indigo-500`}
            >
              {isPlaying ? "Pause" : step >= total ? "Replay" : "Play"}
            </button>
            <button onClick={() => { setPlaying(false); setStep((k) => Math.min(k + 1, total)); }} disabled={step >= total} aria-label="Next step" className={ctl}>
              Next &rarr;
            </button>
            <span className="ml-auto text-sm text-zinc-500">
              Step {step} of {total}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={total}
            value={step}
            onChange={(e) => {
              setPlaying(false);
              setStep(Number(e.target.value));
            }}
            aria-label="Replay position"
            className="mt-3 w-full accent-indigo-600"
          />
        </section>

        <aside className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <DecisionPanel state={state} />
        </aside>
      </div>
    </main>
  );
}
