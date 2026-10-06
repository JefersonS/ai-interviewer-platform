export const fmtDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

export const fmtPercent = (ratio: number) => `${Math.round(ratio * 100)}%`;

export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export const linkPill =
  "rounded-full border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 transition hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-700 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-indigo-950 dark:hover:text-indigo-200";
