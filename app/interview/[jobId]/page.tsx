import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob } from "@/lib/jobs";

export default async function InterviewPage({
  params,
}: PageProps<"/interview/[jobId]">) {
  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        &larr; All roles
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">{job.title} interview</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Interview room coming next.
      </p>
    </main>
  );
}
