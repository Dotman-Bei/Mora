"use client";

import type { NetworkId } from "mora-sdk/network";
import { useEffect, useState } from "react";
import { getNetwork } from "@/lib/networks";

/** Confirms the listed parameters against the deployed contract's config(). */
export function LiveConfig({ network }: { network: NetworkId }) {
  const [state, setState] = useState<"checking" | "match" | "mismatch" | "unknown">("checking");
  useEffect(() => {
    const net = getNetwork(network);
    if (!net) return setState("unknown");
    // Load the SDK after the page is up: this check is the only chain call here.
    import("mora-sdk")
      .then(({ getConfig }) => getConfig(net))
      .then((c) => setState(c.grace_ledgers === net.graceLedgers && c.max_items === net.maxItems ? "match" : "mismatch"))
      .catch(() => setState("unknown"));
  }, [network]);
  const text = {
    checking: "Checking on chain…",
    match: "Confirmed on chain",
    mismatch: "On-chain config differs",
    unknown: "UNKNOWN",
  }[state];
  return (
    <span className="flex items-center gap-2 text-xs text-muted-foreground">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${state === "match" ? "bg-delivered" : state === "mismatch" ? "bg-destructive" : "bg-muted-foreground"}`} />
      {text}
    </span>
  );
}
