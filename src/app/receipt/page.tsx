import type { Metadata } from "next";
import { ReceiptView } from "./receipt-view";

export const metadata: Metadata = {
  title: "Receipt",
  description: "Three explorer links for each Portaj exit.",
};

export default function Page() {
  return <ReceiptView />;
}
