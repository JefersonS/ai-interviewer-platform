import Link from "next/link";
import { JOBS } from "@/lib/jobs";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">AI Interviewer</h1>
        <Link
          href="/history"
          className="shrink-0 rounded-full border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 transition hover:border-indigo-500 hover:bg-indigo-50 hover:text-indigo-700 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-indigo-950 dark:hover:text-indigo-200"
        >
          History
        </Link>
      </div>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Pick a role and complete a short voice interview. You will need a
        microphone (Chrome or Edge work best).
      </p>
      <ul className="mt-10 grid gap-4">
        {JOBS.map((job) => (
          <li key={job.id}>
            <Link
              href={`/interview/${job.id}`}
              className="group flex items-center justify-between gap-4 rounded-xl border border-zinc-200 p-5 transition hover:-translate-y-0.5 hover:border-indigo-500 hover:shadow-md focus-visible:outline-2 focus-visible:outline-indigo-500 dark:border-zinc-800 dark:hover:border-indigo-400"
            >
              <div>
                <h2 className="text-lg font-medium">{job.title}</h2>
                <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                  {job.description}
                </p>
              </div>
              <span className="text-xl text-zinc-400 transition group-hover:translate-x-1 group-hover:text-indigo-500" aria-hidden>
                &rarr;
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
