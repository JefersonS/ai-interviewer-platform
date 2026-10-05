"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Job } from "@/lib/jobs";
import { MAX_CLARIFICATIONS, TOTAL_QUESTIONS, type Evaluation, type NextQuestion, type Turn } from "@/lib/interview";
import { CLOSING_LINE, parseSaved, storageKey, type Saved } from "@/lib/session";
import { fixTechTerms } from "@/lib/glossary";
import { pickEnglishVoice } from "@/lib/voice";

type Status = "loading" | "ready" | "thinking" | "speaking" | "answering" | "evaluating" | "error";

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
  abort(): void;
};

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

const btn =
  "transition active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-40";
const primaryBtn = `${btn} rounded-full bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-500`;
const chip =
  "rounded-full border border-zinc-300 px-3 py-1 text-xs transition hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-700 active:scale-95 focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-zinc-700 dark:hover:bg-indigo-950 dark:hover:text-indigo-200";
const ghostBtn = `${btn} rounded-full border border-zinc-300 px-5 py-2.5 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800`;

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={d} />
    </svg>
  );
}
const ICONS = {
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3",
  stop: "M6 6h12v12H6z",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
  volume: "M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14",
  mute: "M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6",
};

function Bubble({ turn, onReplay }: { turn: { role: Turn["role"]; text: string }; onReplay?: () => void }) {
  if (turn.role === "candidate") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-white">{turn.text}</p>
      </div>
    );
  }
  return (
    <div className="group flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">AI</div>
      <div className="flex max-w-[80%] items-center gap-2">
        <p className="rounded-2xl rounded-tl-md bg-zinc-100 px-4 py-2.5 dark:bg-zinc-800">{turn.text}</p>
        {onReplay && (
          <button onClick={onReplay} title="Replay question" aria-label="Replay question" className={`${btn} rounded-full p-1.5 text-zinc-400 opacity-0 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:opacity-100 group-hover:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-200`}>
            <Icon d={ICONS.volume} className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function Typing({ label }: { label: string }) {
  return (
    <div className="flex items-start gap-3" aria-live="polite">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">AI</div>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-zinc-100 px-4 py-3.5 dark:bg-zinc-800" title={label}>
        {[0, 150, 300].map((d) => (
          <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: `${d}ms` }} />
        ))}
        <span className="sr-only">{label}</span>
      </div>
    </div>
  );
}

export default function InterviewRoom({ job }: { job: Job }) {
  const [status, setStatus] = useState<Status>("loading");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [draft, setDraft] = useState("");
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [closing, setClosing] = useState(false);
  const [clarifyMode, setClarifyMode] = useState(false);
  const [pendingAsk, setPendingAsk] = useState<string | null>(null);
  const router = useRouter();
  const [hasSaved, setHasSaved] = useState(false);
  const canListen = useSyncExternalStore(
    () => () => {},
    () => "SpeechRecognition" in window || "webkitSpeechRecognition" in window,
    () => true,
  );

  const session = useRef<Saved | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const finalText = useRef("");
  const mutedRef = useRef(false);
  const closingSpoken = useRef(false);
  const closingDone = useRef<Promise<void>>(Promise.resolve());
  const bottom = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

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
    if (mutedRef.current || !("speechSynthesis" in window)) return then();
    setStatus("speaking");
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      then();
    };
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    const voice = pickEnglishVoice(window.speechSynthesis.getVoices());
    if (voice) u.voice = voice;
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
          { role: "interviewer", text: q.question, kind: q.kind, topic: q.topic, reasoning: q.reasoning, references: q.references, difficulty: q.difficulty, assessment: q.assessment },
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
        // Leaving the page cancels speech, so let the closing line finish first.
        await closingDone.current;
        router.push(`/interview/${job.id}/summary`);
      } catch (e) {
        setError((e as Error).message);
        setStatus("error");
      }
    },
    [job.id, persist, router],
  );

  // Decide what to do next from whatever history we have (fresh or resumed).
  const advance = useCallback(
    (history: Turn[]) => {
      const last = history[history.length - 1];
      if (history.length >= TOTAL_QUESTIONS * 2) {
        if (!closingSpoken.current) {
          closingDone.current = new Promise<void>((resolve) => speak(CLOSING_LINE, resolve));
        }
        closingSpoken.current = true;
        setClosing(true);
        return void evaluate(history);
      }
      if (last?.role === "interviewer") return speak(last.text, () => setStatus("answering"));
      void askNext(history);
    },
    [askNext, evaluate, speak],
  );

  // One-time restore from localStorage (browser-only, so it cannot run during render).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices(); // warm up async voice list
    try {
      const saved = parseSaved(localStorage.getItem(storageKey(job.id)));
      if (saved?.turns.length) {
        session.current = saved;
        setTurns(saved.turns);
        setEvaluation(saved.evaluation);
        setHasSaved(true);
      }
    } catch {
      // Storage unavailable: start fresh.
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

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, status]);

  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  function start(resume: boolean) {
    if (!resume || !session.current) {
      session.current = { id: crypto.randomUUID(), startedAt: Date.now(), turns: [], evaluation: null };
      setTurns([]);
      setEvaluation(null);
      persist([], null);
    }
    setClosing(false);
    closingSpoken.current = false;
    advance(session.current.turns);
  }

  function toggleMute() {
    mutedRef.current = !muted;
    setMuted(!muted);
    if (!muted && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function toggleMic() {
    if (listening) return recognition.current?.stop();
    window.speechSynthesis?.cancel();
    const w = window as unknown as Record<string, new () => Recognition>;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
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
      setDraft(fixTechTerms((finalText.current + interim).trim()));
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

  // stop() delivers late results after the box is cleared, which re-filled it with
  // the previous answer. Detach the handlers and drop the buffer instead.
  function discardRecognition() {
    const r = recognition.current;
    if (r) {
      r.onresult = null;
      r.onend = null;
      r.onerror = null;
      r.abort();
    }
    recognition.current = null;
    finalText.current = "";
    setListening(false);
  }

  function submitAnswer() {
    const text = draft.trim();
    if (!text || status !== "answering") return;
    discardRecognition();
    window.speechSynthesis?.cancel();
    const next: Turn[] = [...turns, { role: "candidate", text }];
    setTurns(next);
    setDraft("");
    persist(next, null);
    advance(next);
  }

  async function clarify(message: string) {
    const last = turns[turns.length - 1];
    if (!message || last?.role !== "interviewer" || status !== "answering") return;
    discardRecognition();
    window.speechSynthesis?.cancel();
    setClarifyMode(false);
    setDraft("");
    setError("");
    setPendingAsk(message);
    setStatus("thinking");
    try {
      const data = await post<{ reply: string }>("/api/interview/clarify", { jobId: job.id, history: turns, message });
      const updated: Turn[] = turns.map((t, i) =>
        i === turns.length - 1 && t.role === "interviewer"
          ? { ...t, clarifications: [...(t.clarifications ?? []), { ask: message, reply: data.reply }] }
          : t,
      );
      setTurns(updated);
      persist(updated, null);
      setPendingAsk(null);
      speak(data.reply, () => setStatus("answering"));
    } catch (e) {
      setPendingAsk(null);
      setDraft(message); // give the text back so nothing is lost
      setError((e as Error).message);
      setStatus("answering");
    }
  }

  function submit() {
    if (clarifyMode) void clarify(draft.trim());
    else submitAnswer();
  }

  const lastTurn = turns[turns.length - 1];
  const clarificationsUsed = lastTurn?.role === "interviewer" ? (lastTurn.clarifications?.length ?? 0) : 0;
  const canClarify = status === "answering" && lastTurn?.role === "interviewer" && clarificationsUsed < MAX_CLARIFICATIONS;

  const answered = turns.filter((t) => t.role === "candidate").length;
  const inProgress = status !== "ready" && status !== "loading";
  const lastIdx = turns.length - 1;
  const stateLabel: Partial<Record<Status, string>> = {
    thinking: "Thinking...",
    speaking: "Speaking...",
    answering: listening ? "Listening..." : "Your turn",
    evaluating: "Writing your evaluation...",
  };

  const header = (
    <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <div className="flex items-center gap-3">
        <Link href="/" className="rounded-full px-2 py-1 text-sm text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">
          &larr; Roles
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{job.title} interview</h1>
          {inProgress && <p className="text-xs text-zinc-500">{stateLabel[status] ?? ""}</p>}
        </div>
        <button onClick={toggleMute} title={muted ? "Unmute interviewer" : "Mute interviewer"} aria-label={muted ? "Unmute interviewer" : "Mute interviewer"} className={`${btn} rounded-full p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100`}>
          <Icon d={muted ? ICONS.mute : ICONS.volume} />
        </button>
      </div>
      {inProgress && (
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div className="h-full rounded-full bg-indigo-600 transition-all duration-500" style={{ width: `${(answered / TOTAL_QUESTIONS) * 100}%` }} />
          </div>
          <span className="text-xs text-zinc-500">
            {Math.min(answered + 1, TOTAL_QUESTIONS)} / {TOTAL_QUESTIONS}
          </span>
        </div>
      )}
    </header>
  );

  return (
    <div className="mx-auto flex h-dvh w-full max-w-3xl flex-col">
      {header}

      <div className="flex-1 overflow-y-auto px-4 py-6">
        {status === "loading" && <p className="text-center text-zinc-500">Loading...</p>}

        {status === "ready" && (
          <div className="mx-auto mt-10 max-w-md rounded-2xl border border-zinc-200 p-6 text-center dark:border-zinc-800">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white">
              <Icon d={ICONS.mic} className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">Ready when you are</h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              {TOTAL_QUESTIONS} questions, about 10 minutes. The interviewer speaks each question. Answer with your
              microphone, check the text, then send.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              {hasSaved && evaluation && (
                <Link href={`/interview/${job.id}/summary`} className={`${primaryBtn} inline-block`}>
                  View results
                </Link>
              )}
              {hasSaved && !evaluation && (
                <button onClick={() => start(true)} className={primaryBtn}>
                  Resume interview
                </button>
              )}
              <button onClick={() => start(false)} className={hasSaved ? ghostBtn : primaryBtn}>
                {hasSaved ? "Start over" : "Start interview"}
              </button>
            </div>
          </div>
        )}

        {inProgress && (
          <div className="space-y-4">
            {turns.map((t, i) => (
              <Fragment key={i}>
                <Bubble
                  turn={t}
                  onReplay={t.role === "interviewer" && i === lastIdx && status === "answering" ? () => speak(t.text, () => setStatus("answering")) : undefined}
                />
                {t.role === "interviewer" &&
                  (t.clarifications ?? []).map((c, j) => (
                    <Fragment key={j}>
                      <Bubble turn={{ role: "candidate", text: c.ask }} />
                      <Bubble turn={{ role: "interviewer", text: c.reply }} />
                    </Fragment>
                  ))}
              </Fragment>
            ))}
            {pendingAsk && <Bubble turn={{ role: "candidate", text: pendingAsk }} />}
            {closing && <Bubble turn={{ role: "interviewer", text: CLOSING_LINE }} />}
            {(status === "thinking" || status === "evaluating") && <Typing label={stateLabel[status] ?? ""} />}
            {status === "error" && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
                <span>{error}</span>
                <button onClick={() => advance(turns)} className={`${btn} shrink-0 rounded-full border border-current px-4 py-1.5 hover:bg-red-100 dark:hover:bg-red-900`}>
                  Retry
                </button>
              </div>
            )}
          </div>
        )}

        <div ref={bottom} />
      </div>

      {inProgress && status !== "error" && (
        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          {canClarify && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500">Not sure what&apos;s being asked?</span>
              {clarifyMode ? (
                <button onClick={() => setClarifyMode(false)} className={chip}>
                  Cancel
                </button>
              ) : (
                <>
                  <button onClick={() => void clarify("Could you rephrase that?")} className={chip}>
                    Rephrase it
                  </button>
                  <button onClick={() => void clarify("Can you give me an example?")} className={chip}>
                    Give an example
                  </button>
                  <button
                    onClick={() => {
                      setClarifyMode(true);
                      textarea.current?.focus();
                    }}
                    className={chip}
                  >
                    Ask something else
                  </button>
                </>
              )}
            </div>
          )}
          <div className={`flex items-end gap-2 rounded-3xl border bg-white p-2 transition dark:bg-zinc-900 ${listening ? "border-red-400 ring-2 ring-red-200 dark:ring-red-900" : "border-zinc-300 focus-within:border-indigo-500 dark:border-zinc-700"}`}>
            {canListen && (
              <button
                onClick={toggleMic}
                disabled={status !== "answering"}
                aria-label={listening ? "Stop recording" : "Start recording"}
                title={listening ? "Stop recording" : "Start recording"}
                className={`${btn} relative shrink-0 rounded-full p-3 ${listening ? "bg-red-600 text-white hover:bg-red-500" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"}`}
              >
                {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-40" />}
                <Icon d={listening ? ICONS.stop : ICONS.mic} className="relative h-5 w-5" />
              </button>
            )}
            <textarea
              ref={textarea}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              disabled={status !== "answering"}
              placeholder={status !== "answering" ? "Wait for the interviewer..." : clarifyMode ? "What would you like clarified?" : canListen ? "Tap the mic and speak, or type your answer" : "Type your answer"}
              className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 outline-none placeholder:text-zinc-400 disabled:opacity-50"
            />
            <button onClick={submit} disabled={!draft.trim() || status !== "answering"} aria-label={clarifyMode ? "Send question" : "Send answer"} title="Send (Enter)" className={`${btn} shrink-0 rounded-full bg-indigo-600 p-3 text-white hover:bg-indigo-500`}>
              <Icon d={ICONS.send} />
            </button>
          </div>
          <p className="mt-2 text-center text-xs text-zinc-400">Enter to send, Shift+Enter for a new line. You can edit the transcribed text first.</p>
        </div>
      )}
    </div>
  );
}
