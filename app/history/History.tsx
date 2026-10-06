"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SessionListItem } from "@/lib/history";
import { JOBS, getJob } from "@/lib/jobs";
import { getOwnerId, OWNER_HEADER } from "@/lib/owner";
import { fmtDate, fmtDuration, fmtPercent, linkPill } from "./format";

type Result = { key: string; sessions?: SessionListItem[]; error?: string; status?: number };

// Score over time for the sessions on screen: plain SVG, oldest on the left.
function ScoreTrend({ sessions }: { sessions: SessionListItem[] }) {
  const ordered = [...sessions].sort((a, b) => a.finishedAt - b.finishedAt);
  if (ordered.length < 2) {
    return <p className="text-sm text-zinc-500">Complete at least two interviews to see a score trend.</p>;
  }
  const W = 420;
  const H = 170;
  const left = 28;
  const right = 30;
  const top = 10;
  const bottom = 24;
  const x = (i: number) => left + (i * (W - left - right)) / (ordered.length - 1);
  const y = (score: number) => top + ((10 - score) * (H - top - bottom)) / 10;
  const points = ordered.map((s, i) => `${x(i)},${y(s.score)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-xl" role="img" aria-label={`Score trend over ${ordered.length} interviews`}>
      {[0, 5, 10].map((tick) => (
        <g key={tick}>
          <line x1={left} x2={W - right} y1={y(tick)} y2={y(tick)} className="stroke-zinc-200 dark:stroke-zinc-800" strokeDasharray={tick === 5 ? "4 4" : undefined} />
          <text x={left - 6} y={y(tick) + 4} textAnchor="end" className="fill-zinc-500 text-[11px]">
            {tick}
          </text>
        </g>
      ))}
      <polyline points={points} fill="none" className="stroke-indigo-500" strokeWidth={2} strokeLinejoin="round" />
      {ordered.map((s, i) => (
        <g key={s.id}>
          <circle cx={x(i)} cy={y(s.score)} r={5} className="fill-indigo-600 stroke-white dark:stroke-zinc-950" strokeWidth={2}>
            <title>{`${fmtDate(s.finishedAt)} · ${getJob(s.jobId)?.title ?? s.jobId} · ${s.score}/10`}</title>
          </circle>
          <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-zinc-500 text-[10px]">
            {new Date(s.finishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </text>
        </g>
      ))}
    </svg>
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

function SessionCard({ s }: { s: SessionListItem }) {
  const m = s.metrics;
  return (
    <li>
      <Link
        href={`/history/${s.id}`}
        className="group flex flex-col gap-4 rounded-xl border border-zinc-200 p-4 transition hover:-translate-y-0.5 hover:border-indigo-500 hover:shadow-md focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-zinc-800 dark:hover:border-indigo-400 sm:flex-row sm:items-center"
      >
        <div className="flex items-center gap-4 sm:w-56 sm:shrink-0">
          <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full bg-indigo-600 text-white">
            <span className="text-xl font-semibold leading-none">{s.score}</span>
            <span className="text-[10px] opacity-80">/ 10</span>
          </div>
          <div className="min-w-0">
            <h2 className="truncate font-medium">{getJob(s.jobId)?.title ?? s.jobId}</h2>
            <p className="truncate text-xs text-zinc-500">{s.candidateName || "Unnamed candidate"}</p>
            <p className="text-xs text-zinc-500">{fmtDate(s.finishedAt)}</p>
          </div>
        </div>
        <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Duration" value={fmtDuration(m.durationSeconds)} />
          <Stat label="Coverage" value={`${m.coverage.covered}/${m.coverage.total} areas`} />
          <Stat label="Talk share (by words)" value={fmtPercent(m.talkRatio)} />
          {m.avgAnswerSeconds !== null && <Stat label="Avg answer time" value={`${Math.round(m.avgAnswerSeconds)} s`} />}
          <Stat wide label="Ratings" value={`${m.ratings.strong} strong · ${m.ratings.adequate} ok · ${m.ratings.weak} weak`} />
          <Stat label="Follow-ups" value={String(m.followUps)} />
        </dl>
        <span className="hidden text-xl text-zinc-400 transition group-hover:translate-x-1 group-hover:text-indigo-500 sm:block" aria-hidden>
          &rarr;
        </span>
      </Link>
    </li>
  );
}

export default function History() {
  const [job, setJob] = useState("");
  const [attempt, setAttempt] = useState(0); // bumped by Retry to refetch
  const [result, setResult] = useState<Result | null>(null);
  const key = `${job}:${attempt}`;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sessions${job ? `?job=${encodeURIComponent(job)}` : ""}`, { headers: { [OWNER_HEADER]: getOwnerId() } });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setResult(res.ok ? { key, sessions: data.sessions ?? [] } : { key, error: data.error ?? `Request failed (${res.status})`, status: res.status });
      } catch {
        if (!cancelled) setResult({ key, error: "Could not reach the server. Check your connection and try again." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job, key]);

  const loading = !result || result.key !== key;
  const sessions = result?.sessions;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100">
        &larr; All roles
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Interview history</h1>
          <p className="mt-1 text-sm text-zinc-500">Finished interviews saved from this browser. Only this browser can see them.</p>
        </div>
        <label className="text-sm text-zinc-600 dark:text-zinc-400">
          <span className="mr-2">Role</span>
          <select
            value={job}
            onChange={(e) => setJob(e.target.value)}
            className="rounded-full border border-zinc-300 bg-transparent px-3 py-1.5 text-sm text-zinc-900 outline-none transition hover:border-indigo-500 focus:border-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">All roles</option>
            {JOBS.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading && <p className="mt-10 text-center text-zinc-500">Loading...</p>}

      {!loading && result?.error && (
        <div className="mt-8 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200" role="alert">
          <p className="font-medium">{result.status === 503 ? "History is unavailable" : "Could not load history"}</p>
          <p className="mt-1">{result.error}</p>
          <button onClick={() => setAttempt((n) => n + 1)} className={`${linkPill} mt-3 inline-block`}>
            Retry
          </button>
        </div>
      )}

      {!loading && sessions && sessions.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
          <h2 className="text-lg font-medium">No interviews yet</h2>
          <p className="mt-1 text-sm text-zinc-500">{job ? "Nothing saved for this role yet." : "Finish an interview and it shows up here."}</p>
          <Link href="/" className="mt-5 inline-block rounded-full bg-indigo-600 px-5 py-2.5 font-medium text-white transition hover:bg-indigo-500 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">
            Start an interview
          </Link>
        </div>
      )}

      {!loading && sessions && sessions.length > 0 && (
        <>
          <section className="mt-8 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">Score trend{job ? ` · ${getJob(job)?.title}` : ""}</h2>
            <ScoreTrend sessions={sessions} />
          </section>
          <ul className="mt-6 space-y-3">
            {sessions.map((s) => (
              <SessionCard key={s.id} s={s} />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
