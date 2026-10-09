import type { Metadata } from "next";
import { ExitView } from "./exit-view";

export const metadata: Metadata = {
  title: "Exit to an exchange",
  description: "Send USDC from your passkey smart wallet to an exchange deposit address with its memo. No XLM, no seed phrase.",
};

export default function ExitPage() {
  return <ExitView />;
}
