import type { Metadata } from "next";
import { InboxView } from "./inbox-view";

export const metadata: Metadata = {
  title: "Check for payments",
  description: "Everything waiting for your Stellar address, from every sender and every app that uses Mora.",
};

export default function InboxPage() {
  return <InboxView />;
}
