import type { Metadata } from "next";
import Replay from "./Replay";

export const metadata: Metadata = { title: "Interview replay" };

export default async function ReplayPage({ params }: PageProps<"/history/[id]">) {
  const { id } = await params;
  return <Replay id={id} />;
}
