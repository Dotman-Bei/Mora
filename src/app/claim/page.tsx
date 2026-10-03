import type { Metadata } from "next";
import { parseClaimLink } from "mora-sdk";
import { ClaimView } from "./claim-view";

export const metadata: Metadata = {
  title: "A payment is waiting for you",
  description: "Open the link, sign once. The asset and the money arrive in your own wallet together.",
  robots: { index: false },
};

export default async function ClaimPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseClaimLink(await searchParams);
  return <ClaimView params={params} />;
}
