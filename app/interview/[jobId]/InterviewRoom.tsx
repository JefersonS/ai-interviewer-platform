"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Job } from "@/lib/jobs";
import { TOTAL_QUESTIONS, type Evaluation, type NextQuestion, type Turn } from "@/lib/interview";

type Status = "loading" | "ready" | "thinking" | "speaking" | "answering" | "evaluating" | "done" | "error";

type Saved = { id: string; startedAt: number; turns: Turn[]; evaluation: Evaluation | null };

// Minimal typing: SpeechRecognition is not in TypeScript's DOM lib.
type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
};

const storageKey = (jobId: string) => `interview:${jobId}`;

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export default function InterviewRoom({ job }: { job: Job }) {
  const [status, setStatus] = useState<Status>("loading");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const canListen = useSyncExternalStore(
    () => () => {},
    () => "SpeechRecognition" in window || "webkitSpeechRecognition" in window,
    () => true,
  );
  const [hasSaved, setHasSaved] = useState(false);

  const session = useRef<Saved | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const finalText = useRef("");

  const persist = useCallback(
    (nextTurns: Turn[], nextEval: Evaluation | null) => {
      if (!session.current) return;
      session.current = { ...session.current, turns: nextTurns, evaluation: nextEval };
      try {
        localStorage.setItem(storageKey(job.id), JSON.stringify(session.current));
      } catch {
        // Storage can be unavailable (private mode); the interview still works.
      }
    },
    [job.id],
  );

  const speak = useCallback((text: string, then: () => void) => {
    setStatus("speaking");
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return then();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      then();
    };
    const u = new SpeechSynthesisUtterance(text);
    u.onend = finish;
    u.onerror = finish;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    // Chrome sometimes never fires onend; do not leave the candidate stuck.
    setTimeout(finish, text.length * 90 + 4000);
  }, []);

  const askNext = useCallback(
    async (history: Turn[]) => {
      setStatus("thinking");
      setError("");
      try {
        const data = await post<{ done: boolean; question?: NextQuestion }>("/api/interview/next", {
          jobId: job.id,
          history,
        });
        if (data.done || !data.question) return;
        const q = data.question;
        const withQ: Turn[] = [
          ...history,
          { role: "interviewer", text: q.question, kind: q.kind, topic: q.topic, reasoning: q.reasoning, references: q.references },
        ];
        setTurns(withQ);
        persist(withQ, null);
        speak(q.question, () => setStatus("answering"));
      } catch (e) {
        setError((e as Error).message);
        setStatus("error");
      }
    },
    [job.id, persist, speak],
  );

  const evaluate = useCallback(
    async (history: Turn[]) => {
      setStatus("evaluating");
      setError("");
      try {
        const data = await post<{ evaluation: Evaluation }>("/api/interview/evaluate", { jobId: job.id, history });
        setEvaluation(data.evaluation);
        persist(history, data.evaluation);
        setStatus("done");
      } catch (e) {
        setError((e as Error).message);
        setStatus("error");
      }
    },
    [job.id, persist],
  );

  // Decide what to do next from whatever history we have (fresh or resumed).
  const advance = useCallback(
    (history: Turn[]) => {
      const last = history[history.length - 1];
      if (history.length >= TOTAL_QUESTIONS * 2) return void evaluate(history);
      if (last?.role === "interviewer") return speak(last.text, () => setStatus("answering"));
      void askNext(history);
    },
    [askNext, evaluate, speak],
  );

  // One-time restore from localStorage (browser-only, so it cannot run during render).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(job.id));
      if (raw) {
        const saved = JSON.parse(raw) as Saved;
        if (saved.turns?.length) {
          session.current = saved;
          setTurns(saved.turns);
          setEvaluation(saved.evaluation);
          setHasSaved(true);
          setStatus(saved.evaluation ? "done" : "ready");
          return;
        }
      }
    } catch {
      // Corrupt saved data: start fresh.
    }
    setStatus("ready");
  }, [job.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    return () => {
      recognition.current?.stop();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  function start(resume: boolean) {
    if (!resume || !session.current) {
      session.current = { id: crypto.randomUUID(), startedAt: Date.now(), turns: [], evaluation: null };
      setTurns([]);
      setEvaluation(null);
      persist([], null);
    }
    advance(session.current.turns);
  }

  function toggleMic() {
    if (listening) return recognition.current?.stop();
    const Ctor = (window as unknown as Record<string, new () => Recognition>).SpeechRecognition ??
      (window as unknown as Record<string, new () => Recognition>).webkitSpeechRecognition;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    finalText.current = draft ? draft.trim() + " " : "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText.current += res[0].transcript.trim() + " ";
        else interim += res[0].transcript;
      }
      setDraft((finalText.current + interim).trim());
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setListening(false);
      if (e.error === "not-allowed") setError("Microphone access was blocked. Allow it in your browser, or type your answer.");
    };
    recognition.current = r;
    setError("");
    r.start();
    setListening(true);
  }

  function submitAnswer() {
    const text = draft.trim();
    if (!text) return;
    recognition.current?.stop();
    const next: Turn[] = [...turns, { role: "candidate", text }];
    setTurns(next);
    setDraft("");
    persist(next, null);
    advance(next);
  }

  const answered = turns.filter((t) => t.role === "candidate").length;

  return (
    <div className="mt-6">
      {status === "loading" && <p className="text-zinc-500">Loading...</p>}

      {status === "ready" && (
        <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
          <p>
            {TOTAL_QUESTIONS} questions, about 10 minutes. The interviewer speaks each question; answer with your
            microphone, then review the text and submit.
          </p>
          <div className="mt-4 flex gap-3">
            {hasSaved && (
              <button onClick={() => start(true)} className="rounded-lg bg-foreground px-4 py-2 text-background">
                Resume interview
              </button>
            )}
            <button
              onClick={() => start(false)}
              className={`rounded-lg px-4 py-2 ${hasSaved ? "border border-zinc-300 dark:border-zinc-700" : "bg-foreground text-background"}`}
            >
              {hasSaved ? "Start over" : "Start interview"}
            </button>
          </div>
        </div>
      )}

      {status !== "ready" && status !== "loading" && status !== "done" && (
        <p className="text-sm text-zinc-500">
          Question {Math.min(answered + 1, TOTAL_QUESTIONS)} of {TOTAL_QUESTIONS}
        </p>
      )}

      {turns.length > 0 && status !== "done" && (
        <ul className="mt-3 space-y-3">
          {turns.map((t, i) => (
            <li
              key={i}
              className={t.role === "interviewer" ? "rounded-lg bg-zinc-100 p-3 dark:bg-zinc-900" : "ml-8 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"}
            >
              <span className="text-xs uppercase text-zinc-500">{t.role === "interviewer" ? "Interviewer" : "You"}</span>
              <p>{t.text}</p>
            </li>
          ))}
        </ul>
      )}

      {status === "thinking" && <p className="mt-4 text-zinc-500">Interviewer is thinking...</p>}
      {status === "speaking" && <p className="mt-4 text-zinc-500">Interviewer is speaking...</p>}
      {status === "evaluating" && <p className="mt-4 text-zinc-500">Writing your evaluation...</p>}

      {status === "answering" && (
        <div className="mt-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder={canListen ? "Press the mic and speak. You can edit the text before submitting." : "Voice input is not supported in this browser. Type your answer."}
            className="w-full rounded-lg border border-zinc-300 bg-transparent p-3 dark:border-zinc-700"
          />
          <div className="mt-2 flex gap-3">
            {canListen && (
              <button onClick={toggleMic} className={`rounded-lg px-4 py-2 ${listening ? "bg-red-600 text-white" : "border border-zinc-300 dark:border-zinc-700"}`}>
                {listening ? "Stop recording" : "Start speaking"}
              </button>
            )}
            <button onClick={submitAnswer} disabled={!draft.trim()} className="rounded-lg bg-foreground px-4 py-2 text-background disabled:opacity-40">
              Submit answer
            </button>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="mt-4 rounded-lg border border-red-300 p-4 text-red-700 dark:text-red-400">
          <p>{error}</p>
          <button onClick={() => advance(turns)} className="mt-2 rounded-lg border border-current px-3 py-1">
            Retry
          </button>
        </div>
      )}
      {status === "answering" && error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {status === "done" && evaluation && (
        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-semibold">Evaluation</h2>
            <p className="mt-1 text-3xl font-semibold">{evaluation.overall_score}/10</p>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">{evaluation.summary}</p>
            <pre className="mt-4 overflow-x-auto rounded-lg bg-zinc-100 p-4 text-sm dark:bg-zinc-900">
              {JSON.stringify(evaluation, null, 2)}
            </pre>
          </section>
          <section>
            <h2 className="text-xl font-semibold">Transcript</h2>
            <ul className="mt-3 space-y-3">
              {turns.map((t, i) => (
                <li key={i}>
                  <span className="text-xs uppercase text-zinc-500">{t.role === "interviewer" ? "Interviewer" : "You"}</span>
                  <p>{t.text}</p>
                </li>
              ))}
            </ul>
          </section>
          <button onClick={() => setStatus("ready")} className="rounded-lg border border-zinc-300 px-4 py-2 dark:border-zinc-700">
            Back
          </button>
        </div>
      )}
    </div>
  );
}
