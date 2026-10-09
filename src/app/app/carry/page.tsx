import type { Metadata } from "next";
import { CarryView } from "./carry-view";

export const metadata: Metadata = {
  title: "Carry to an exchange",
  description: "Send USDC from your passkey smart wallet to an exchange deposit address with its memo. No XLM, no seed phrase.",
};

export default function Page() {
  return <CarryView />;
}
