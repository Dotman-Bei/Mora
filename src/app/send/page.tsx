import type { Metadata } from "next";
import { SendView } from "./send-view";

export const metadata: Metadata = {
  title: "Send a payment",
  description: "Pay one person or a list with one signature. Whoever can't receive it yet gets a link.",
};

export default function SendPage() {
  return <SendView />;
}
