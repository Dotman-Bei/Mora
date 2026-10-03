"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "./ui";
import { useNetwork, useWallet } from "./providers";

type State =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; outcome: "delivered" | "waiting"; claimPath: string; txUrl: string }
  | { kind: "error"; message: string };

/**
 * "Get 100 TESTUSD". The faucet pays through Mora, so a new tester's first
 * experience is a payment waiting for them (PRD §6.7). Testnet only.
 */
export function FaucetButton({ address: given }: { address?: string }) {
  const { id } = useNetwork();
  const wallet = useWallet();
  const [state, setState] = useState<State>({ kind: "idle" });
  if (id !== "testnet") return null;

  async function request() {
    const address = given ?? wallet.address ?? (await wallet.connect());
    if (!address) return;
    setState({ kind: "busy" });
    try {
      const r = await fetch("/api/v1/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "The faucet couldn't pay right now.");
      setState({ kind: "done", outcome: j.outcome, claimPath: j.claimPath, txUrl: j.txUrl });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "The faucet couldn't pay right now." });
    }
  }

  if (state.kind === "done") {
    return state.outcome === "waiting" ? (
      <p className="text-sm text-foreground">
        100 TESTUSD is waiting for you.{" "}
        <Link href={state.claimPath} className="underline underline-offset-4">
          Claim it
        </Link>{" "}
        ·{" "}
        <a href={state.txUrl} target="_blank" rel="noreferrer" className="text-muted-foreground underline-offset-4 hover:underline">
          transaction
        </a>
      </p>
    ) : (
      <p className="text-sm text-foreground">
        100 TESTUSD delivered to your wallet ·{" "}
        <a href={state.txUrl} target="_blank" rel="noreferrer" className="text-muted-foreground underline-offset-4 hover:underline">
          transaction
        </a>
      </p>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button variant="outline" onClick={() => void request()} disabled={state.kind === "busy"}>
        {state.kind === "busy" ? "Sending through Mora…" : "Get 100 TESTUSD"}
      </Button>
      <p className="text-xs text-muted-foreground">
        {state.kind === "error" ? state.message : "Testnet only · TESTUSD is a test asset with no value"}
      </p>
    </div>
  );
}
