"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { LANGUAGES } from "@/lib/languages";
import type { Job } from "@/lib/jobs";
import { panelState } from "@/lib/panel";
import { parseSaved, storageKey } from "@/lib/session";
import DecisionPanel from "../DecisionPanel";

const linkBtn =
  "inline-block rounded-full px-5 py-2.5 font-medium transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500";

// localStorage only notifies other tabs, so same-tab writes notify through this list.
const listeners = new Set<() => void>();
function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

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
    subscribe,
    () => readStored(storageKey(job.id)),
    () => undefined,
  );
  const saved = useMemo(() => parseSaved(raw), [raw]);
  const evaluation = saved?.evaluation ?? null;

  const [showTranslated, setShowTranslated] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState("");

  // The English evaluation is the saved record. A translation is only another way to view it.
  const lang = saved?.candidate?.language;
  const canTranslate = Boolean(lang && lang !== "en");
  const translation = lang ? saved?.translations?.[lang] : undefined;
  const shown = showTranslated && translation ? translation : evaluation;

  async function toggleTranslation() {
    if (!saved || !evaluation || !lang) return;
    if (showTranslated) return setShowTranslated(false);
    if (translation) return setShowTranslated(true);

    setTranslating(true);
    setTranslateError("");
    try {
      const res = await fetch("/api/interview/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: lang, evaluation }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      try {
        const next = { ...saved, translations: { ...saved.translations, [lang]: data.evaluation } };
        localStorage.setItem(storageKey(job.id), JSON.stringify(next));
        listeners.forEach((l) => l());
      } catch {
        // Could not cache it; still show this translation for now.
      }
      setShowTranslated(true);
    } catch (e) {
      setTranslateError((e as Error).message);
    } finally {
      setTranslating(false);
    }
  }

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
      {saved.candidate?.name && (
        <p className="mt-1 text-sm text-zinc-500">
          {saved.candidate.name} · {LANGUAGES[saved.candidate.language].label}
        </p>
      )}
      {canTranslate && lang && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={toggleTranslation}
            disabled={translating}
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm transition hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-700 active:scale-95 disabled:cursor-wait disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-indigo-950 dark:hover:text-indigo-200"
          >
            {translating ? "Translating..." : showTranslated ? "Show original (English)" : `Translate to ${LANGUAGES[lang].label}`}
          </button>
          {showTranslated && <span className="text-xs text-zinc-500">Translated for viewing. The saved evaluation is in English.</span>}
          {translateError && <span className="text-xs text-red-600">{translateError}</span>}
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
        <div className="flex items-baseline gap-2">
          <span className="text-6xl font-semibold">{evaluation.overall_score}</span>
          <span className="text-zinc-500">/ 10</span>
        </div>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">{shown?.summary}</p>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Strengths</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{shown?.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Concerns</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{shown?.concerns.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        </div>
        <details className="mt-6 text-sm">
          <summary className="cursor-pointer text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">Raw JSON (English, as saved)</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-100 p-4 dark:bg-zinc-900">{JSON.stringify(evaluation, null, 2)}</pre>
        </details>
      </section>

      <section className="mt-10 rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
        <DecisionPanel state={panelState(job, saved.turns, saved.lastAnswer)} mode="final" />
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
