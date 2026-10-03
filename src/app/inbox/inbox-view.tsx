"use client";

import {
  addressKind,
  buildClaimMany,
  claimLink,
  confirmParcels,
  parseClaimResult,
  probeNetwork,
  sentHash,
  shortAddress,
  waitingCandidatesFromRpc,
  type MoraAsset,
  type NetworkProbe,
  type WaitingCandidate,
} from "mora-sdk";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PaymentCard, StatusMark } from "@/components/payment";
import { useNetwork, useWallet } from "@/components/providers";
import { TxLink } from "@/components/share";
import { Button, Skeleton } from "@/components/ui";
import { ledgerDate, reportTx, walletErrorMessage } from "@/lib/tx";

// Everything waiting for an address, from every sender and every app that
// uses Mora, each confirmed against the contract before it's listed (PRD §6.4).

type Item = WaitingCandidate & { amount: bigint; refundAfter: number; asset: MoraAsset };
type Load =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "unknown"; why: string }
  | { kind: "ready"; items: Item[]; probe: NetworkProbe; source: "index" | "rpc" };

const PAGE = 10;

async function indexCandidates(network: string, to: string): Promise<WaitingCandidate[] | null> {
  // Sync first so the index is current, then page through candidates.
  await fetch(`/api/v1/sync?network=${network}`).catch(() => null);
  const out: WaitingCandidate[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`/api/v1/parcels?network=${network}&to=${to}${cursor ? `&cursor=${cursor}` : ""}`);
    if (r.status === 503) return null; // index not configured: fall back to RPC
    if (!r.ok) throw new Error(`Index answered ${r.status}`);
    const j = (await r.json()) as { items: Array<{ from: string; token: string }>; cursor: string | null };
    out.push(...j.items.map((x) => ({ from: x.from, token: x.token })));
    cursor = j.cursor;
    if (!cursor) break;
  }
  return out;
}

export function InboxView() {
  const { net } = useNetwork();
  const wallet = useWallet();
  const [pasted, setPasted] = useState("");
  const [address, setAddress] = useState<string | null>(null);
  const [load, setLoad] = useState<Load>({ kind: "idle" });
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (wallet.address && !address) setAddress(wallet.address);
  }, [wallet.address, address]);

  useEffect(() => {
    if (!address) return;
    let alive = true;
    setLoad({ kind: "loading" });
    setPage(1);
    (async () => {
      try {
        const fromIndex = await indexCandidates(net.id, address).catch(() => null);
        const source = fromIndex ? "index" : "rpc";
        const candidates = (fromIndex ?? (await waitingCandidatesFromRpc(net, address))).filter((c) =>
          net.assets.some((a) => a.sac === c.token),
        ); // only supported assets, by exact SAC (PRD §15)
        const [probe, confirmed] = await Promise.all([probeNetwork(net), confirmParcels(net, address, candidates)]);
        const items = confirmed.map((c) => ({ ...c, asset: net.assets.find((a) => a.sac === c.token) as MoraAsset }));
        if (alive) setLoad({ kind: "ready", items, probe, source });
      } catch (e) {
        if (alive) setLoad({ kind: "unknown", why: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [address, net, nonce]);

  const isOwner = !!wallet.address && wallet.address === address;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 pb-24 pt-28 sm:pt-32">
      <header className="space-y-3">
        <h1 className="font-serif text-3xl sm:text-4xl">Check for payments</h1>
        <p className="text-sm text-muted-foreground">Everything waiting for an address, from every sender and every app that uses Mora.</p>
      </header>

      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const a = pasted.trim();
          if (addressKind(a) === "account" || addressKind(a) === "contract") setAddress(a);
        }}
      >
        <input
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="Paste any G… or C… address"
          spellCheck={false}
          aria-label="Address to check"
          className="h-11 w-full border border-border bg-background px-3 font-mono text-sm outline-none focus:border-foreground sm:flex-1"
        />
        <Button type="submit" variant="outline" size="lg">
          Check
        </Button>
        {!wallet.address ? (
          <Button type="button" size="lg" onClick={() => void wallet.connect()}>
            Connect wallet
          </Button>
        ) : null}
      </form>

      {address ? (
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-mono text-foreground">{shortAddress(address, 6, 6)}</span>
          {isOwner ? "" : " · read-only"}
        </p>
      ) : null}

      {load.kind === "loading" ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : load.kind === "unknown" ? (
        <div className="border border-border p-6">
          <StatusMark status="unknown" />
          <p className="mt-3 text-sm text-muted-foreground">We couldn&apos;t read the network, so we can&apos;t say what&apos;s waiting.</p>
          <Button className="mt-4" variant="outline" onClick={() => setNonce((n) => n + 1)}>
            Try again
          </Button>
        </div>
      ) : load.kind === "ready" && address ? (
        <Ready
          items={load.items}
          probe={load.probe}
          address={address}
          isOwner={isOwner}
          source={load.source}
          page={page}
          setPage={setPage}
          onClaimed={() => setNonce((n) => n + 1)}
        />
      ) : null}
    </div>
  );
}

function Ready({
  items,
  probe,
  address,
  isOwner,
  source,
  page,
  setPage,
  onClaimed,
}: {
  items: Item[];
  probe: NetworkProbe;
  address: string;
  isOwner: boolean;
  source: "index" | "rpc";
  page: number;
  setPage: (n: number) => void;
  onClaimed: () => void;
}) {
  const { net } = useNetwork();
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; hashes: string[] } | null>(null);
  const shown = items.slice(0, page * PAGE);

  /** Claim all: one signature per max_items, simulate first (PRD §6.4). */
  const claimAll = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    const hashes: string[] = [];
    let claimed = 0;
    let blocked = 0;
    try {
      for (let i = 0; i < items.length; i += net.maxItems) {
        const chunk = items.slice(i, i + net.maxItems);
        const tx = await buildClaimMany(
          net,
          { publicKey: address, signTransaction: wallet.signTransaction },
          { to: address, items: chunk.map((c) => ({ from: c.from, token: c.token })) },
        );
        const sim = tx.result.map(parseClaimResult);
        if (!sim.some((r) => r.status === "claimed")) {
          blocked += sim.length;
          continue; // nothing claimable here: don't ask for a signature
        }
        const sent = await tx.signAndSend();
        const h = sentHash(sent);
        if (h) hashes.push(h);
        reportTx(net.id, h);
        for (const r of sent.result.map(parseClaimResult)) {
          if (r.status === "claimed") claimed++;
          else blocked++;
        }
      }
      setMsg({ text: `${claimed} claimed${blocked ? `, ${blocked} still waiting (open each for the reason)` : ""}.`, hashes });
      onClaimed();
    } catch (e) {
      setMsg({ text: walletErrorMessage(e), hashes });
    } finally {
      setBusy(false);
    }
  }, [items, net, address, wallet.signTransaction, onClaimed]);

  return (
    <div className="space-y-6">
      {items.length === 0 ? (
        <div className="border border-border p-6">
          <p className="text-base text-foreground">Nothing is waiting for this address.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {source === "rpc" ? "Checked the last 7 days of network history. Older payments still open from their links." : "Checked every payment Mora has seen."}
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-foreground">
              {items.length} waiting payment{items.length > 1 ? "s" : ""}
            </p>
            {isOwner ? (
              <Button onClick={() => void claimAll()} disabled={busy}>
                {busy ? "Waiting for your wallet…" : items.length > net.maxItems ? `Claim all (${Math.ceil(items.length / net.maxItems)} signatures)` : "Claim all"}
              </Button>
            ) : null}
          </div>
          {msg ? (
            <div className="space-y-2 border border-border p-4 text-sm">
              <p>{msg.text}</p>
              <div className="flex flex-wrap gap-4">
                {msg.hashes.map((h) => (
                  <TxLink key={h} href={net.explorer.tx(h)} />
                ))}
              </div>
            </div>
          ) : null}
          <div className="space-y-4">
            {shown.map((it) => {
              const returnable = probe.ledger > it.refundAfter;
              const link = claimLink({ network: net.id, from: it.from, to: address, asset: it.token }, window.location.origin);
              return (
                <PaymentCard
                  key={`${it.from}|${it.token}`}
                  status={returnable ? "ready-to-return" : "waiting"}
                  amount={it.amount}
                  asset={it.asset}
                  from={it.from}
                  to={address}
                  returnDate={`${returnable ? "Since" : "After"} ${ledgerDate(probe, it.refundAfter)}`}
                >
                  <Link href={new URL(link).pathname + new URL(link).search} className="text-sm text-foreground underline-offset-4 hover:underline">
                    Open this payment →
                  </Link>
                </PaymentCard>
              );
            })}
          </div>
          {shown.length < items.length ? (
            <Button variant="outline" onClick={() => setPage(page + 1)}>
              Show more
            </Button>
          ) : null}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Checked at ledger <span className="font-mono tabular">{probe.ledger.toLocaleString()}</span>
        {source === "rpc" ? " · from network history (index unavailable)" : ""}
      </p>
    </div>
  );
}
