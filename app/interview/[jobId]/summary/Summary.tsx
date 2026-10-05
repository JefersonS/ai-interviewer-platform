"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import type { Job } from "@/lib/jobs";
import { parseSaved, storageKey } from "@/lib/session";

const linkBtn =
  "inline-block rounded-full px-5 py-2.5 font-medium transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500";

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export default function Summary({ job }: { job: Job }) {
  // undefined on the server so the first client render matches, then the stored value.
  const raw = useSyncExternalStore(
    () => () => {},
    () => readStored(storageKey(job.id)),
    () => undefined,
  );
  const saved = useMemo(() => parseSaved(raw), [raw]);
  const evaluation = saved?.evaluation ?? null;

  if (raw === undefined) return <main className="mx-auto max-w-3xl px-6 py-16 text-zinc-500">Loading...</main>;

  if (!saved || !evaluation) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">No results yet</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">Finish a {job.title} interview in this browser to see your summary.</p>
        <Link href={`/interview/${job.id}`} className={`${linkBtn} mt-6 bg-indigo-600 text-white hover:bg-indigo-500`}>
          Go to the interview
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-10">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100">
        &larr; All roles
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{job.title} interview summary</h1>

      <section className="mt-6 rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
        <div className="flex items-baseline gap-2">
          <span className="text-6xl font-semibold">{evaluation.overall_score}</span>
          <span className="text-zinc-500">/ 10</span>
        </div>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">{evaluation.summary}</p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Strengths</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{evaluation.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Concerns</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{evaluation.concerns.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        </div>
        <details className="mt-6 text-sm">
          <summary className="cursor-pointer text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">Raw JSON</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-100 p-4 dark:bg-zinc-900">{JSON.stringify(evaluation, null, 2)}</pre>
        </details>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold">Transcript</h2>
        <ol className="space-y-4">
          {saved.turns.map((t, i) => (
            <li key={i} className={t.role === "candidate" ? "flex justify-end" : ""}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${t.role === "candidate" ? "rounded-br-md bg-indigo-600 text-white" : "rounded-tl-md bg-zinc-100 dark:bg-zinc-800"}`}>
                <p className={`mb-0.5 text-xs uppercase ${t.role === "candidate" ? "text-indigo-200" : "text-zinc-500"}`}>
                  {t.role === "candidate" ? "You" : `Interviewer · ${t.kind === "follow_up" ? "follow-up" : "question"}`}
                </p>
                <p className="whitespace-pre-wrap">{t.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-10 flex gap-3">
        <Link href={`/interview/${job.id}`} className={`${linkBtn} bg-indigo-600 text-white hover:bg-indigo-500`}>
          Practice again
        </Link>
        <Link href="/" className={`${linkBtn} border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800`}>
          All roles
        </Link>
      </div>
    </main>
  );
}
