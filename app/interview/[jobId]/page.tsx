import { notFound } from "next/navigation";
import { getJob } from "@/lib/jobs";
import InterviewRoom from "./InterviewRoom";

export default async function InterviewPage({
  params,
}: PageProps<"/interview/[jobId]">) {
  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) notFound();

  return <InterviewRoom job={job} />;
}
