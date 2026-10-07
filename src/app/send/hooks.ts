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
import { useEffect, useRef, useState } from "react";
import { FEDERATION_NAME, type NameLookup, type ParsedRow } from "@/lib/recipients";

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

/**
 * Resolve federation names (name*domain, SEP-2) found in the recipients text.
 * Each name is looked up once; names that need a memo are refused, because
 * Soroban payments can't carry one.
 */
export function useFederation(text: string) {
  const [lookups, setLookups] = useState<Map<string, NameLookup>>(() => new Map());
  // Names already requested; read only inside the effect.
  const requested = useRef(new Set<string>());
  const names = [...new Set(text.split(/[\s,;]+/).filter((t) => FEDERATION_NAME.test(t)).map((t) => t.toLowerCase()))];
  const key = names.join("|");

  useEffect(() => {
    const todo = names.filter((n) => !requested.current.has(n));
    if (!todo.length) return;
    const set = (n: string, v: NameLookup) => setLookups((prev) => new Map(prev).set(n, v));
    const t = setTimeout(async () => {
      for (const n of todo) {
        requested.current.add(n);
        set(n, { status: "pending" });
      }
      const { Federation } = await import("@stellar/stellar-sdk");
      await Promise.all(
        todo.map(async (n) => {
          try {
            const r = await Federation.Server.resolve(n);
            set(
              n,
              r.memo
                ? { status: "error", message: "This name needs a memo (usually an exchange), and Soroban payments can't carry one." }
                : { status: "ok", account: r.account_id },
            );
          } catch {
            set(n, { status: "error", message: "Couldn't find this name. Check the spelling, or use the G-address." });
          }
        }),
      );
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return lookups;
}
