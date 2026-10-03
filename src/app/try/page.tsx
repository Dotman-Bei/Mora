import type { Metadata } from "next";
import { TryView } from "./try-view";

export const metadata: Metadata = {
  title: "Try it",
  description: "A testnet walkthrough without a wallet: delivered, waiting, claimed and returned, with real transactions.",
};

export default function TryPage() {
  return <TryView />;
}
