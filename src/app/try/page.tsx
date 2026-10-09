import type { Metadata } from "next";
import { TryView } from "./try-view";

export const metadata: Metadata = {
  title: "Try it on testnet",
  description: "Create a test passkey wallet, get test USDC, watch the normal way fail, then exit with Portaj.",
};

export default function Page() {
  return <TryView />;
}
