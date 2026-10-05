import Link from "next/link";
import { JOBS } from "@/lib/jobs";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">AI Interviewer</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Pick a role and complete a short voice interview. You will need a
        microphone (Chrome or Edge work best).
      </p>
      <ul className="mt-10 grid gap-4">
        {JOBS.map((job) => (
          <li key={job.id}>
            <Link
              href={`/interview/${job.id}`}
              className="block rounded-xl border border-zinc-200 p-5 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
            >
              <h2 className="text-lg font-medium">{job.title}</h2>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                {job.description}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
