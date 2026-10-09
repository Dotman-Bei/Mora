import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { IS_TESTNET } from "@/lib/config";
import { ExchangeView } from "./exchange-view";

export const metadata: Metadata = {
  title: "Exchange simulator",
  description: "A testnet exchange deposit account that credits classic USDC payments with a memo, the way real exchanges do.",
};

// A labelled stand-in for a real exchange. It doesn't exist on mainnet.
export default function Page() {
  if (!IS_TESTNET) notFound();
  return <ExchangeView />;
}
