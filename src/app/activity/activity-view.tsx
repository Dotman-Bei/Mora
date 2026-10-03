"use client";

import {
  buildRefund,
  claimLink,
  formatAmount,
  getParcel,
  needsRestore,
  parseDoorResult,
  probeNetwork,
  scanForSender,
  sentHash,
  shortAddress,
  waitingReason,
  type MoraAsset,
  type MoraNetwork,
  type NetworkProbe,
} from "mora-sdk";
import { useEffect, useMemo, useState } from "react";
import { Amount, StatusMark, type Status } from "@/components/payment";
import { useNetwork, useWallet } from "@/components/providers";
import { CopyButton, TxLink } from "@/components/share";
import { Button, Skeleton } from "@/components/ui";
import { readHistory } from "@/lib/local-history";
import { ledgerDate, reportTx, walletErrorMessage } from "@/lib/tx";

// Everything the connected address has sent through Mora (PRD §6.5). Index
// first; if it's unavailable, network history plus this browser's own sends,
// every waiting payment re-checked against the contract.

type Row = {
  key: string;
  to: string;
  token: string;
  asset: MoraAsset;
  amount: bigint;
  status: "delivered" | "waiting" | "claimed" | "returned" | "unknown";
  reason?: number;
  refundAfter?: number;
  txHash?: string;
  resolvedTx?: string;
  ledger: number;
};

type Filter = "all" | "waiting" | "delivered" | "claimed" | "returned";
const FILTERS: Filter[] = ["all", "waiting", "delivered", "claimed", "returned"];
const PAGE = 20;

async function fromIndex(net: MoraNetwork, from: string): Promise<Omit<Row, "asset">[] | null> {
  await fetch(`/api/v1/sync?network=${net.id}`).catch(() => null);
  const out: Omit<Row, "asset">[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 10; i++) {
    const r = await fetch(`/api/v1/parcels?network=${net.id}&from=${from}${cursor ? `&cursor=${cursor}` : ""}`);
    if (r.status === 503) return null;
    if (!r.ok) throw new Error(`Index answered ${r.status}`);
    const j = (await r.json()) as {
      items: Array<{ txHash: string; ledger: number; to: string; token: string; amount: string; status: string; reason: number | null; refundAfter: number | null; resolvedTx: string | null }>;
      cursor: string | null;
    };
    for (const x of j.items) {
      out.push({
        key: `${x.txHash}:${x.to}`,
        to: x.to,
        token: x.token,
        amount: BigInt(x.amount),
        status: x.status === "moved" ? "delivered" : (x.status as Row["status"]),
        reason: x.reason ?? undefined,
        refundAfter: x.refundAfter ?? undefined,
        txHash: x.txHash,
        resolvedTx: x.resolvedTx ?? undefined,
        ledger: x.ledger,
      });
    }
    cursor = j.cursor;
    if (!cursor) break;
  }
  return out;
}

async function fromRpcAndBrowser(net: MoraNetwork, from: string): Promise<Omit<Row, "asset">[]> {
  const { events } = await scanForSender(net, from);
  const rows: Omit<Row, "asset">[] = [];
  const openByKey = new Map<string, Omit<Row, "asset">[]>();
  for (const e of events) {
    const k = `${e.to}|${e.token}`;
    if (e.type === "delivered" || e.type === "parked") {
      const row: Omit<Row, "asset"> = {
        key: `${e.txHash}:${e.to}`,
        to: e.to,
        token: e.token,
        amount: e.amount,
        status: e.type === "delivered" ? "delivered" : "waiting",
        reason: e.reason,
        refundAfter: e.refundAfter,
        txHash: e.txHash,
        ledger: e.ledger,
      };
      rows.push(row);
      if (e.type === "parked") openByKey.set(k, [...(openByKey.get(k) ?? []), row]);
    } else {
      for (const r of openByKey.get(k) ?? []) {
        r.status = e.type === "returned" ? "returned" : e.type === "claimed" ? "claimed" : "delivered";
        r.resolvedTx = e.txHash;
      }
      openByKey.delete(k);
    }
  }
  // This browser's sends older than the RPC window.
  const seen = new Set(rows.map((r) => r.txHash));
  for (const h of readHistory()) {
    if (h.network !== net.id || h.from !== from || (h.txHash && seen.has(h.txHash))) continue;
    rows.push({
      key: `${h.txHash ?? h.at}:${h.to}`,
      to: h.to,
      token: h.token,
      amount: BigInt(h.amount),
      // Older than the window: only the contract can say if it still waits.
      status: h.outcome === "delivered" ? "delivered" : "unknown",
      reason: h.reason,
      refundAfter: h.refundAfter,
      txHash: h.txHash,
      ledger: 0,
    });
  }
  return rows.sort((a, b) => b.ledger - a.ledger);
}

export function ActivityView() {
  const { net } = useNetwork();
  const wallet = useWallet();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [probe, setProbe] = useState<NetworkProbe | null>(null);
  const [source, setSource] = useState<"index" | "rpc">("index");
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const from = wallet.address;

  useEffect(() => {
    if (!from) return;
    let alive = true;
    setRows(null);
    setError(null);
    (async () => {
      try {
        const idx = await fromIndex(net, from).catch(() => null);
        const raw = idx ?? (await fromRpcAndBrowser(net, from));
        if (alive) setSource(idx ? "index" : "rpc");
        const supported = raw.filter((r) => net.assets.some((a) => a.sac === r.token));
        // Re-check every waiting (or unknown) key against the contract (PRD §4.3).
        const keys = [...new Set(supported.filter((r) => r.status === "waiting" || r.status === "unknown").map((r) => `${r.to}|${r.token}`))];
        const live = new Map<string, boolean>();
        for (let i = 0; i < keys.length; i += 5) {
          await Promise.all(
            keys.slice(i, i + 5).map(async (k) => {
              const [to, token] = k.split("|") as [string, string];
              live.set(k, !!(await getParcel(net, { from, to, token })));
            }),
          );
        }
        const confirmed = supported.map((r) => {
          const k = `${r.to}|${r.token}`;
          const asset = net.assets.find((a) => a.sac === r.token) as MoraAsset;
          if ((r.status === "waiting" || r.status === "unknown") && live.has(k)) {
            return { ...r, asset, status: live.get(k) ? ("waiting" as const) : ("unknown" as const) };
          }
          return { ...r, asset };
        });
        const p = await probeNetwork(net);
        if (alive) {
          setRows(confirmed);
          setProbe(p);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [from, net, nonce]);

  const visible = useMemo(() => (rows ?? []).filter((r) => filter === "all" || r.status === filter), [rows, filter]);

  function exportCsv() {
    const lines = [["recipient", "asset", "amount", "status", "reason", "return_ledger", "tx"].join(",")];
    for (const r of visible) {
      lines.push([r.to, r.asset.code, formatAmount(r.amount).replace(/,/g, ""), r.status, r.reason ?? "", r.refundAfter ?? "", r.txHash ?? ""].join(","));
    }
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `mora-${net.id}-activity.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 pb-24 pt-28 sm:pt-32">
      <header className="space-y-3">
        <h1 className="font-serif text-3xl sm:text-4xl">Activity</h1>
        <p className="text-sm text-muted-foreground">Everything this wallet has sent through Mora, and where each payment ended up.</p>
      </header>

      {!from ? (
        <div className="space-y-3 border border-border p-6">
          <p className="text-sm text-foreground">Connect the wallet you paid from.</p>
          <Button onClick={() => void wallet.connect()}>Connect wallet</Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap border border-border text-xs" role="tablist" aria-label="Filter">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={filter === f}
                  onClick={() => {
                    setFilter(f);
                    setPage(1);
                  }}
                  className={`h-8 px-3 capitalize ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {f}
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!visible.length}>
              Export CSV
            </Button>
          </div>

          {error ? (
            <div className="border border-border p-6">
              <StatusMark status="unknown" />
              <p className="mt-3 text-sm text-muted-foreground">We couldn&apos;t read the network.</p>
              <Button className="mt-4" variant="outline" onClick={() => setNonce((n) => n + 1)}>
                Try again
              </Button>
            </div>
          ) : !rows || !probe ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <p className="border border-border p-6 text-sm text-muted-foreground">
              {filter === "all" ? "Nothing sent through Mora from this wallet yet." : `No ${filter} payments.`}
            </p>
          ) : (
            <ul className="border border-border">
              {visible.slice(0, page * PAGE).map((r) => (
                <ActivityRow key={r.key} r={r} probe={probe} from={from} onChanged={() => setNonce((n) => n + 1)} />
              ))}
            </ul>
          )}
          {rows && visible.length > page * PAGE ? (
            <Button variant="outline" onClick={() => setPage(page + 1)}>
              Show more
            </Button>
          ) : null}
          {probe ? (
            <p className="text-xs text-muted-foreground">
              Checked at ledger <span className="font-mono tabular">{probe.ledger.toLocaleString()}</span>
              {source === "rpc" ? " · from network history and this browser (index unavailable)" : ""}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

function ActivityRow({ r, probe, from, onChanged }: { r: Row; probe: NetworkProbe; from: string; onChanged: () => void }) {
  const { net } = useNetwork();
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const returnable = r.status === "waiting" && r.refundAfter !== undefined && probe.ledger > r.refundAfter;
  const status: Status = r.status === "waiting" && returnable ? "ready-to-return" : r.status;
  const link = claimLink({ network: net.id, from, to: r.to, asset: r.token }, typeof window !== "undefined" ? window.location.origin : undefined);

  async function doReturn() {
    setBusy(true);
    setErr(null);
    try {
      const caller = { publicKey: from, signTransaction: wallet.signTransaction };
      let tx = await buildRefund(net, caller, { from, to: r.to, token: r.token });
      if (needsRestore(tx)) tx = await buildRefund(net, caller, { from, to: r.to, token: r.token }, { restore: true });
      const sent = await tx.signAndSend();
      reportTx(net.id, sentHash(sent));
      const out = parseDoorResult(sent.result);
      if (out.status === "moved") onChanged();
      else setErr(out.status === "still-blocked" ? `Couldn't return it yet (code ${out.code}).` : "Nothing is waiting any more.");
    } catch (e) {
      setErr(walletErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="grid gap-3 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-[1fr_auto] md:items-center">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-mono text-sm" title={r.to}>
            {shortAddress(r.to, 6, 6)}
          </span>
          <Amount value={r.amount} code={r.asset.code} className="text-sm" />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <StatusMark status={status} reason={r.status === "waiting" && r.reason !== undefined && !returnable ? waitingReason(r.reason, r.asset.code) : undefined} className="text-xs" />
          {r.status === "waiting" && r.refundAfter !== undefined && !returnable ? <span>Returns after {ledgerDate(probe, r.refundAfter)}</span> : null}
          {r.txHash ? <TxLink href={net.explorer.tx(r.txHash)} label="Sent" /> : null}
          {r.resolvedTx ? <TxLink href={net.explorer.tx(r.resolvedTx)} label={r.status === "returned" ? "Returned" : "Claimed"} /> : null}
        </div>
        {err ? <p className="text-xs text-destructive">{err}</p> : null}
      </div>
      {r.status === "waiting" ? (
        <div className="flex flex-wrap gap-2">
          <CopyButton text={link} />
          {returnable ? (
            <Button size="sm" onClick={() => void doReturn()} disabled={busy}>
              {busy ? "Signing…" : "Return"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
