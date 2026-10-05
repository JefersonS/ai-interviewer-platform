import { notFound } from "next/navigation";
import { getJob } from "@/lib/jobs";
import Summary from "./Summary";

export default async function SummaryPage({
  params,
}: PageProps<"/interview/[jobId]/summary">) {
  const { jobId } = await params;
  const job = getJob(jobId);
  if (!job) notFound();

  return <Summary job={job} />;
}
