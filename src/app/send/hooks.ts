"use client";

import {
  accountKey,
  accountState,
  probeNetwork,
  readEntries,
  readiness,
  trustlineKey,
  type MoraAsset,
  type MoraNetwork,
  type NetworkProbe,
  type Readiness,
} from "mora-sdk";
import { useEffect, useState } from "react";
import type { ParsedRow } from "@/lib/recipients";

export function useProbe(net: MoraNetwork) {
  const [probe, setProbe] = useState<NetworkProbe | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    setProbe(null);
    setError(false);
    probeNetwork(net)
      .then((p) => alive && setProbe(p))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [net]);
  return { probe, error };
}

/** Spendable balance per supported asset; null where the network couldn't be read. */
export function useBalances(net: MoraNetwork, address: string | null, probe: NetworkProbe | null, nonce = 0) {
  const [balances, setBalances] = useState<Map<string, bigint> | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!address || !probe || !address.startsWith("G")) {
      setBalances(null);
      return;
    }
    let alive = true;
    setError(false);
    (async () => {
      try {
        const keys = [accountKey(address), ...net.assets.filter((a) => a.issuer).map((a) => trustlineKey(address, a))];
        const entries = await readEntries(net, keys);
        const out = new Map<string, bigint>();
        for (const a of net.assets) {
          if (!a.issuer) {
            out.set(a.sac, accountState(entries.get(accountKey(address).toXDR("base64")), probe.baseReserve).free);
          } else {
            const tl = entries.get(trustlineKey(address, a).toXDR("base64")) as unknown as
              | { trustLine: { balance: bigint } }
              | undefined;
            out.set(a.sac, tl ? BigInt(tl.trustLine.balance) : 0n);
          }
        }
        if (alive) setBalances(out);
      } catch {
        if (alive) setError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [net, address, probe, nonce]);
  return { balances, error };
}

export type ReadinessState = Map<string, Readiness> | "unknown" | null;

/** Live readiness chips for the valid rows, debounced while the sender types. */
export function useReadiness(net: MoraNetwork, asset: MoraAsset | undefined, rows: ParsedRow[], probe: NetworkProbe | null) {
  const [state, setState] = useState<ReadinessState>(null);
  const valid = rows.filter((r) => !r.error && r.amount !== null);
  const key = asset ? `${asset.sac}|${valid.map((r) => `${r.address}:${r.amount}`).join(",")}` : "";
  useEffect(() => {
    if (!asset || !probe || valid.length === 0) {
      setState(null);
      return;
    }
    let alive = true;
    setState(null);
    const t = setTimeout(async () => {
      try {
        const res = await readiness(
          net,
          asset,
          valid.map((r) => ({ address: r.address, amount: r.amount ?? 0n })),
          probe.baseReserve,
        );
        if (alive) setState(new Map(res.map((r) => [r.address, r.readiness])));
      } catch {
        if (alive) setState("unknown");
      }
    }, 450);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [net, key, probe]);
  return state;
}
