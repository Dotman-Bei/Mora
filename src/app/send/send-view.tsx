"use client";

import {
  buildSend,
  buildSendMany,
  claimLink,
  estimatedFee,
  formatAmount,
  ledgerAfter,
  maxReturnWindowSeconds,
  parseOutcome,
  probeNetwork,
  readinessGroup,
  sentHash,
  shortAddress,
  simulationError,
  waitingReason,
  type MoraAsset,
  type Outcome,
  type Readiness,
} from "mora-sdk";
import type { contract } from "@stellar/stellar-sdk";
import { useEffect, useMemo, useState } from "react";
import { Amount, StatusMark } from "@/components/payment";
import { useNetwork, useWallet } from "@/components/providers";
import { MEMO_HELP, ReadinessChip } from "@/components/readiness-chip";
import { ShareActions, TxLink } from "@/components/share";
import { Button, Eyebrow } from "@/components/ui";
import { addHistory, type SentRecord } from "@/lib/local-history";
import { BETA_CAPS } from "@/lib/networks";
import { parseRecipients, type ParsedRow } from "@/lib/recipients";
import { ledgerDate, reportTx, walletErrorMessage, xlm } from "@/lib/tx";
import { useBalances, useProbe, useReadiness } from "./hooks";

const WINDOWS = [
  { label: "5 minutes", seconds: 5 * 60, testnetOnly: true },
  { label: "7 days", seconds: 7 * 86400 },
  { label: "14 days", seconds: 14 * 86400 },
  { label: "30 days", seconds: 30 * 86400 },
];

type Payee = { to: string; amount: bigint };
type Chunk = { payees: Payee[]; tx: contract.AssembledTransaction<Outcome | Outcome[]> };
type Review = { chunks: Chunk[]; refundAfter: number; fee: bigint; expected: { delivered: number; waiting: number } };
type ResultRow = Payee & { outcome: "delivered" | "waiting" | "not-sent"; code?: number; hash?: string };

export function SendView() {
  const { net, id } = useNetwork();
  const wallet = useWallet();
  const { probe, error: probeError } = useProbe(net);
  const [balNonce, setBalNonce] = useState(0);
  const { balances, error: balError } = useBalances(net, wallet.address, probe, balNonce);

  const [assetSac, setAssetSac] = useState(net.assets[0]?.sac ?? "");
  useEffect(() => setAssetSac((s) => (net.assets.some((a) => a.sac === s) ? s : (net.assets[0]?.sac ?? ""))), [net]);
  const asset = net.assets.find((a) => a.sac === assetSac) as MoraAsset;

  const [mode, setMode] = useState<"one" | "list">("one");
  const [oneTo, setOneTo] = useState("");
  const [oneAmount, setOneAmount] = useState("");
  const [listText, setListText] = useState("");
  const [same, setSame] = useState(false);
  const [sameAmount, setSameAmount] = useState("");
  const [windowSec, setWindowSec] = useState(7 * 86400);

  const parsed = useMemo(() => {
    if (mode === "one") return oneTo.trim() ? parseRecipients(`${oneTo.trim()} ${oneAmount.trim() || "?"}`) : { rows: [], notices: [] };
    return parseRecipients(listText, same ? sameAmount : undefined);
  }, [mode, oneTo, oneAmount, listText, same, sameAmount]);

  const ready = useReadiness(net, asset, parsed.rows, probe);
  const chipFor = (r: ParsedRow): Readiness | "checking" | "unknown" => {
    if (r.error) return r.error.startsWith("M-addresses") ? "invalid-muxed" : "invalid";
    if (ready === "unknown") return "unknown";
    return ready?.get(r.address) ?? "checking";
  };

  const sendable: Payee[] = parsed.rows
    .filter((r) => !r.error && r.amount !== null && ready instanceof Map && readinessGroup(ready.get(r.address) ?? "invalid") !== "blocked")
    .map((r) => ({ to: r.address, amount: r.amount as bigint }));
  const skipped = parsed.rows.length - sendable.length;
  const total = sendable.reduce((s, p) => s + p.amount, 0n);
  const balance = balances?.get(asset?.sac ?? "");
  const cap = id === "mainnet" ? BETA_CAPS[asset?.code ?? ""] : undefined;

  const maxWindow = probe ? maxReturnWindowSeconds(probe, net.graceLedgers) : 0;
  const windows = WINDOWS.filter((w) => (!w.testnetOnly || id === "testnet") && w.seconds <= maxWindow);
  useEffect(() => {
    if (windows.length && !windows.some((w) => w.seconds === windowSec)) setWindowSec(windows[windows.length > 1 ? 1 : 0]!.seconds);
  }, [windows, windowSec]);

  const problems: string[] = [];
  if (balance !== undefined && total > balance)
    problems.push(`Not enough ${asset.code}: you have ${formatAmount(balance)}${asset.issuer ? "" : " spendable"}, this needs ${formatAmount(total)}.`);
  if (cap !== undefined && total > cap) problems.push(`Beta cap: at most ${formatAmount(cap)} ${asset.code} per batch on mainnet while the contract is unaudited.`);

  const [stage, setStage] = useState<"compose" | "reviewing" | "review" | "sending" | "done">("compose");
  const [review, setReview] = useState<Review | null>(null);
  const [progress, setProgress] = useState({ done: 0, of: 0 });
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultRow[]>([]);

  // Editing anything invalidates a prepared review.
  useEffect(() => {
    if (stage === "review") {
      setStage("compose");
      setReview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, assetSac, windowSec, net]);

  const chunksOf = (ps: Payee[]) => {
    const out: Payee[][] = [];
    for (let i = 0; i < ps.length; i += net.maxItems) out.push(ps.slice(i, i + net.maxItems));
    return out;
  };

  async function build(from: string, payees: Payee[], refundAfter: number) {
    const caller = { publicKey: from, signTransaction: wallet.signTransaction };
    if (payees.length === 1 && mode === "one") {
      return (await buildSend(net, caller, { from, token: asset.sac, to: payees[0]!.to, amount: payees[0]!.amount, refundAfter })) as Chunk["tx"];
    }
    return (await buildSendMany(net, caller, { from, token: asset.sac, payees, refundAfter })) as Chunk["tx"];
  }

  async function prepare() {
    if (!wallet.address) return;
    setError(null);
    setStage("reviewing");
    try {
      const p = await probeNetwork(net);
      const refundAfter = ledgerAfter(p, windowSec);
      const chunks: Chunk[] = [];
      let fee = 0n;
      const expected = { delivered: 0, waiting: 0 };
      for (const payees of chunksOf(sendable)) {
        const tx = await build(wallet.address, payees, refundAfter);
        const err = simulationError(tx);
        if (err) throw new Error(err.name ? `The contract refused: ${err.name}` : err.message);
        const outs = Array.isArray(tx.result) ? tx.result : [tx.result];
        for (const o of outs) {
          if (parseOutcome(o).status === "delivered") expected.delivered++;
          else expected.waiting++;
        }
        fee += estimatedFee(tx);
        chunks.push({ payees, tx });
      }
      setReview({ chunks, refundAfter, fee, expected });
      setStage("review");
    } catch (e) {
      setError(walletErrorMessage(e));
      setStage("compose");
    }
  }

  async function send() {
    if (!review || !wallet.address) return;
    setStage("sending");
    setError(null);
    setProgress({ done: 0, of: review.chunks.length });
    const rows: ResultRow[] = [];
    const history: SentRecord[] = [];
    for (let i = 0; i < review.chunks.length; i++) {
      const chunk = review.chunks[i]!;
      try {
        // Later chunks are rebuilt so their sequence number is fresh.
        const tx = i === 0 ? chunk.tx : await build(wallet.address, chunk.payees, review.refundAfter);
        const sent = await tx.signAndSend();
        const hash = sentHash(sent);
        reportTx(net.id, hash);
        const outs = Array.isArray(sent.result) ? sent.result : [sent.result];
        chunk.payees.forEach((p, j) => {
          const o = outs[j] ? parseOutcome(outs[j]!) : null;
          const outcome = o?.status === "delivered" ? "delivered" : "waiting";
          const code = o && o.status === "waiting" ? o.code : undefined;
          rows.push({ ...p, outcome, code, hash });
          history.push({
            network: net.id,
            from: wallet.address!,
            to: p.to,
            token: asset.sac,
            assetCode: asset.code,
            amount: p.amount.toString(),
            outcome,
            reason: code,
            refundAfter: review.refundAfter,
            txHash: hash,
            at: Date.now(),
          });
        });
        setProgress({ done: i + 1, of: review.chunks.length });
      } catch (e) {
        for (const c of review.chunks.slice(i)) for (const p of c.payees) rows.push({ ...p, outcome: "not-sent" });
        setError(i === 0 ? walletErrorMessage(e) : `${walletErrorMessage(e)} Signatures before this one went through; nothing after it was sent.`);
        break;
      }
    }
    addHistory(history);
    setResults(rows);
    setBalNonce((n) => n + 1);
    setStage(rows.some((r) => r.outcome !== "not-sent") ? "done" : "compose");
  }

  function reset() {
    setStage("compose");
    setReview(null);
    setResults([]);
    setOneTo("");
    setOneAmount("");
    setListText("");
  }

  if (stage === "done" && wallet.address) {
    return (
      <Results
        rows={results}
        asset={asset}
        from={wallet.address}
        error={error}
        onAgain={reset}
        refundAfter={review?.refundAfter}
        readiness={ready instanceof Map ? ready : undefined}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 pb-24 pt-28 sm:pt-32">
      <header className="space-y-3">
        <h1 className="font-serif text-3xl sm:text-4xl">Send a payment</h1>
        <p className="text-sm text-muted-foreground">
          One person or a whole list, one signature. Whoever can&apos;t receive it yet gets a link, and it comes back to you if they never take it.
        </p>
      </header>

      {!wallet.address ? (
        <div className="space-y-3 border border-border p-6">
          <p className="text-sm text-foreground">Connect the wallet you&apos;re paying from.</p>
          <Button onClick={() => void wallet.connect()} disabled={wallet.connecting}>
            {wallet.connecting ? "Connecting…" : "Connect wallet"}
          </Button>
        </div>
      ) : null}

      {/* Asset */}
      <section className="space-y-3">
        <Eyebrow>Asset</Eyebrow>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Asset">
          {net.assets.map((a) => {
            const b = balances?.get(a.sac);
            return (
              <button
                key={a.sac}
                type="button"
                role="radio"
                aria-checked={a.sac === assetSac}
                onClick={() => setAssetSac(a.sac)}
                className={`min-w-32 border px-4 py-2 text-left transition-colors ${a.sac === assetSac ? "border-foreground" : "border-border hover:border-muted-foreground"}`}
              >
                <span className="block text-sm text-foreground">
                  {a.code}
                  {a.test ? <span className="text-muted-foreground"> · test</span> : null}
                </span>
                <span className="block font-mono tabular text-xs text-muted-foreground">
                  {!wallet.address ? "—" : balError ? "UNKNOWN" : b === undefined ? "…" : `${formatAmount(b)}${a.issuer ? "" : " spendable"}`}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Recipients */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <Eyebrow>Recipients</Eyebrow>
          <div className="inline-flex border border-border text-xs" role="tablist">
            {(["one", "list"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`h-10 px-3 sm:h-7 ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {m === "one" ? "One person" : "A list"}
              </button>
            ))}
          </div>
        </div>

        {mode === "one" ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <label className="space-y-1.5">
              <span className="text-xs text-muted-foreground">Stellar address (G… or C…)</span>
              <input
                value={oneTo}
                onChange={(e) => setOneTo(e.target.value)}
                placeholder="G…"
                spellCheck={false}
                autoComplete="off"
                className="h-11 w-full border border-border bg-background px-3 font-mono text-sm outline-none focus:border-foreground"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs text-muted-foreground">Amount ({asset?.code})</span>
              <input
                value={oneAmount}
                onChange={(e) => setOneAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="h-11 w-full border border-border bg-background px-3 font-mono tabular text-sm outline-none focus:border-foreground"
              />
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              value={listText}
              onChange={(e) => setListText(e.target.value)}
              rows={7}
              spellCheck={false}
              placeholder={same ? "One address per line" : "GABC…, 50\nGDEF…, 12.5"}
              className="w-full border border-border bg-background p-3 font-mono text-sm leading-6 outline-none focus:border-foreground"
              aria-label="Recipients, one per line"
            />
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} className="h-4 w-4 accent-current" />
                Same amount for all
              </label>
              {same ? (
                <input
                  value={sameAmount}
                  onChange={(e) => setSameAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder={`Amount (${asset?.code})`}
                  className="h-9 w-40 border border-border bg-background px-3 font-mono tabular text-sm outline-none focus:border-foreground"
                />
              ) : null}
              <span className="text-xs text-muted-foreground">
                {net.maxItems} per signature{sendable.length > net.maxItems ? ` · this list needs ${Math.ceil(sendable.length / net.maxItems)}` : ""}
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Readiness preview */}
      {parsed.rows.length ? (
        <section className="space-y-3">
          <Eyebrow>Preview</Eyebrow>
          <div className="border border-border">
            <ul>
              {parsed.rows.map((r, i) => (
                <li key={`${r.address}-${i}`} className="grid gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4">
                  <span className="min-w-0 truncate font-mono text-sm" title={r.address}>
                    {r.address.length > 20 ? shortAddress(r.address, 6, 6) : r.address || "—"}
                  </span>
                  <span className="text-sm sm:text-right">
                    {r.amount !== null ? <Amount value={r.amount} code={asset?.code} /> : <span className="text-muted-foreground">—</span>}
                  </span>
                  <span className="sm:text-right">
                    <ReadinessChip r={chipFor(r)} code={asset?.code ?? ""} />
                  </span>
                  {r.error && !r.error.startsWith("Not a Stellar") ? <span className="text-xs text-muted-foreground sm:col-span-3">{r.error}</span> : null}
                  {chipFor(r) === "blocked-memo" ? <span className="text-xs text-muted-foreground sm:col-span-3">{MEMO_HELP}</span> : null}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">Preview. The network decides when you send.</p>
          {parsed.notices.map((n) => (
            <p key={n} className="text-xs text-muted-foreground">
              {n}
            </p>
          ))}
          {ready === "unknown" ? <p className="text-xs text-destructive">The network couldn&apos;t be read, so readiness is UNKNOWN. Try again in a moment.</p> : null}
        </section>
      ) : null}

      {/* Return window */}
      <section id="return" className="space-y-3">
        <Eyebrow>If they don&apos;t claim, it comes back after</Eyebrow>
        <div className="flex flex-wrap gap-2">
          {windows.map((w) => (
            <button
              key={w.seconds}
              type="button"
              onClick={() => setWindowSec(w.seconds)}
              className={`h-9 border px-3 text-sm transition-colors ${w.seconds === windowSec ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:border-muted-foreground"}`}
            >
              {w.label}
              {w.testnetOnly ? " · demo" : ""}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {probe ? `About ${ledgerDate(probe, ledgerAfter(probe, windowSec))}. ` : probeError ? "Network UNKNOWN. " : ""}
          Sending again to someone already waiting adds to that payment and moves its return date to the later one.
        </p>
      </section>

      {/* Review */}
      <section className="space-y-4 border-t border-border pt-8">
        {stage === "review" && review ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
              <Fact label="Total">
                <Amount value={total} code={asset.code} />
              </Fact>
              <Fact label="Expected">
                {review.expected.delivered} delivered · {review.expected.waiting} waiting
              </Fact>
              <Fact label="Network fee">≈ {xlm(review.fee)}</Fact>
              <Fact label="Signatures">{review.chunks.length}</Fact>
            </dl>
            {skipped ? <p className="text-xs text-muted-foreground">{skipped} row{skipped > 1 ? "s" : ""} won&apos;t be sent (invalid or needs a memo).</p> : null}
            <Button size="lg" onClick={() => void send()}>
              {review.chunks.length > 1 ? `Sign ${review.chunks.length} times and send` : "Sign and send"}
            </Button>
          </div>
        ) : stage === "sending" ? (
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              {progress.of > 1 ? `Signature ${Math.min(progress.done + 1, progress.of)} of ${progress.of}…` : "Waiting for your wallet…"}
            </p>
            {progress.of > 1 ? (
              <div className="h-0.5 w-full bg-border">
                <div className="h-full bg-primary transition-all" style={{ width: `${(progress.done / progress.of) * 100}%` }} />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {problems.map((p) => (
              <p key={p} className="text-sm text-destructive">
                {p}
              </p>
            ))}
            <Button
              size="lg"
              onClick={() => void prepare()}
              disabled={!wallet.address || sendable.length === 0 || problems.length > 0 || stage === "reviewing" || !(ready instanceof Map)}
            >
              {stage === "reviewing" ? "Checking with the network…" : "Review"}
            </Button>
          </div>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </section>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-background p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
    </div>
  );
}

function Results({
  rows,
  asset,
  from,
  error,
  onAgain,
  refundAfter,
  readiness,
}: {
  rows: ResultRow[];
  asset: MoraAsset;
  from: string;
  error: string | null;
  onAgain: () => void;
  refundAfter?: number;
  readiness?: Map<string, Readiness>;
}) {
  const { net } = useNetwork();
  const delivered = rows.filter((r) => r.outcome === "delivered").length;
  const waiting = rows.filter((r) => r.outcome === "waiting").length;
  const notSent = rows.filter((r) => r.outcome === "not-sent").length;
  const hashes = [...new Set(rows.map((r) => r.hash).filter(Boolean))] as string[];
  const origin = typeof window !== "undefined" ? window.location.origin : undefined;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 pb-24 pt-28 sm:pt-32">
      <header className="space-y-3">
        <h1 className="font-serif text-3xl sm:text-4xl">Sent.</h1>
        <p className="text-base text-foreground">
          {delivered} delivered, {waiting} waiting, 0 failed.
          {notSent ? <span className="text-muted-foreground"> {notSent} not sent.</span> : null}
        </p>
        <div className="flex flex-wrap gap-4">
          {hashes.map((h, i) => (
            <TxLink key={h} href={net.explorer.tx(h)} label={hashes.length > 1 ? `Transaction ${i + 1}` : "Transaction"} />
          ))}
        </div>
      </header>
      {waiting ? (
        <p className="text-sm text-muted-foreground">
          Share each waiting payment&apos;s link with its recipient. They open it, sign once, and it&apos;s theirs.
        </p>
      ) : null}
      <ul className="border border-border">
        {rows.map((r, i) => {
          const link = claimLink({ network: net.id, from, to: r.to, asset: asset.sac }, origin);
          return (
            <li key={`${r.to}-${i}`} className="space-y-3 border-b border-border p-4 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-mono text-sm" title={r.to}>
                  {shortAddress(r.to, 6, 6)}
                </span>
                <Amount value={r.amount} code={asset.code} className="text-sm" />
              </div>
              {r.outcome === "not-sent" ? (
                <p className="text-sm text-muted-foreground">Not sent</p>
              ) : (
                <StatusMark status={r.outcome} reason={r.outcome === "waiting" ? reasonFor(r.code, readiness?.get(r.to), asset.code) : undefined} />
              )}
              {r.outcome === "waiting" ? <ShareActions url={link} message={`A ${asset.code} payment is waiting for you on Mora.`} /> : null}
            </li>
          );
        })}
      </ul>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {refundAfter ? (
        <p className="text-xs text-muted-foreground">Waiting payments come back to you if they aren&apos;t claimed. You can follow them in Activity.</p>
      ) : null}
      <Button variant="outline" onClick={onAgain}>
        Send another
      </Button>
    </div>
  );
}

/**
 * For credit assets the contract reports a missing account as a missing
 * trustline (DECISIONS D-002), so prefer what the preview read from the
 * recipient's account.
 */
function reasonFor(code: number | undefined, r: Readiness | undefined, assetCode: string): string | undefined {
  if (r === "wait-not-active") return "account not active";
  if (r === "wait-needs-approval") return "needs issuer approval";
  if (r === "wait-limit") return `${assetCode} limit too low`;
  return code !== undefined ? waitingReason(code, assetCode) : undefined;
}
