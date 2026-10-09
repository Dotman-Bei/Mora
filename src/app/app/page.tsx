import type { Metadata } from "next";
import { WalletView } from "./wallet-view";

export const metadata: Metadata = {
  title: "Wallet",
  description: "Your passkey smart wallet: USDC balance and address. On testnet, create a test wallet and get test USDC.",
};

export default function Page() {
  return <WalletView />;
}
