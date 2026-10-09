import type { Metadata } from "next";
import { ExchangeView } from "./exchange-view";

export const metadata: Metadata = {
  title: "Exchange simulator",
  description: "A testnet exchange deposit account that credits classic USDC payments with a memo, the way real exchanges do.",
};

export default function Page() {
  return <ExchangeView />;
}
