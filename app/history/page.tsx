import type { Metadata } from "next";
import History from "./History";

export const metadata: Metadata = { title: "Interview history" };

export default function HistoryPage() {
  return <History />;
}
