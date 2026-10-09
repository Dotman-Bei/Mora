import type { Metadata } from "next";
import { RecoverView } from "./recover-view";

export const metadata: Metadata = {
  title: "Recover",
  description: "Resume an interrupted exit or return USDC from your exit account to your wallet.",
};

export default function Page() {
  return <RecoverView />;
}
