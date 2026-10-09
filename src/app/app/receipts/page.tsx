import type { Metadata } from "next";
import { ReceiptsView } from "./receipts-view";

export const metadata: Metadata = {
  title: "Receipts",
  description: "Every Portaj carry with its explorer links, the memo as sent and the transit account's 0 XLM. Resume or return an unfinished carry.",
};

export default function Page() {
  return <ReceiptsView />;
}
