"use client";

import { useEffect, useMemo, useState } from "react";
import { AddressLine, Notice, Page } from "@/components/portaj";
import { CopyButton, TxLink } from "@/components/share";
import { ButtonLink, Chip, Eyebrow, Skeleton } from "@/components/ui";
import { formatUsdc } from "@/lib/amount";
import { SIMULATOR_DEPOSIT, txUrl } from "@/lib/config";
import { short } from "@/lib/format";
import { balances, loadDeposits, simulatorMemo, type Deposit } from "@/lib/simulator";

// PRD §12: reads Horizon payments to the deposit account and credits by memo.

export function ExchangeView() {
  const [deposits, setDeposits] = useState<Deposit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    setMemo(simulatorMemo());
    setHighlight(new URLSearchParams(window.location.search).get("memo"));
    let alive = true;
    const load = () =>
      loadDeposits()
        .then((d) => alive && (setDeposits(d), setError(null)))
        .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    void load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const credited = useMemo(() => (deposits ? balances(deposits) : []), [deposits]);
  const uncredited = useMemo(() => (deposits ?? []).filter((d) => !d.credited), [deposits]);
  const mine = highlight ?? memo;

  return (
    <Page
      title={
        <>
          Exchange <em className="not-italic text-muted-foreground">simulator</em>
        </>
      }
      intro="A stand-in for a real exchange, because none runs on testnet. Real exchanges behave this way per SDF documentation: a deposit is credited when it's a classic USDC payment carrying your memo."
      aside={
        <Chip>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-waiting" aria-hidden />
          Testnet only · not a real exchange
        </Chip>
      }
    >
      <div className="grid gap-6 border border-border p-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="space-y-4">
          <AddressLine label="Deposit address (Stellar USDC)" address={SIMULATOR_DEPOSIT} />
          <div className="space-y-1.5">
            <Eyebrow>Your memo (ID)</Eyebrow>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-foreground" data-testid="sim-memo">
                {memo || "…"}
              </span>
              {memo ? <CopyButton text={memo} label="Copy" /> : null}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">This account sets config.memo_required = 1 (SEP-29), like real exchange deposit accounts.</p>
        </div>
        <ButtonLink href={`/app/carry?to=${SIMULATOR_DEPOSIT}&memoType=id&memo=${memo}`} size="lg">
          Carry here with Portaj
        </ButtonLink>
      </div>

      {error ? <Notice tone="error">Couldn&apos;t read Horizon: {error}</Notice> : null}

      <section className="space-y-3">
        <Eyebrow>Credited balances, by memo</Eyebrow>
        {deposits === null ? (
          <Skeleton className="h-24 w-full" />
        ) : credited.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing credited yet.</p>
        ) : (
          <table className="w-full border border-border text-sm" data-testid="credited">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-normal">Memo</th>
                <th className="px-4 py-2 text-right font-normal">Deposits</th>
                <th className="px-4 py-2 text-right font-normal">Credited (USDC)</th>
              </tr>
            </thead>
            <tbody>
              {credited.map((c) => {
                const isMine = c.memo === `ID ${mine}`;
                return (
                  <tr key={c.memo} className={`border-b border-border last:border-b-0 ${isMine ? "bg-secondary" : ""}`}>
                    <td className="px-4 py-2.5 font-mono text-foreground">
                      {c.memo}
                      {isMine ? <span className="ml-2 font-sans text-xs text-delivered">yours</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular text-muted-foreground">{c.count}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular text-foreground">+{formatUsdc(c.stroops)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-3">
        <Eyebrow>Landed on chain, not credited</Eyebrow>
        {deposits === null ? (
          <Skeleton className="h-16 w-full" />
        ) : uncredited.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <ul className="border border-border" data-testid="uncredited">
            {uncredited.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-sm last:border-b-0">
                <span className="space-y-0.5">
                  <span className="block font-mono tabular text-foreground">
                    {formatUsdc(d.stroops)} USDC <span className="text-muted-foreground">from {short(d.from)}</span>
                  </span>
                  <span className="block text-xs text-waiting">{d.reason}</span>
                </span>
                <TxLink href={txUrl(d.hash)} label="Explorer" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <Eyebrow>All deposits</Eyebrow>
        {deposits?.length ? (
          <ul className="border border-border">
            {deposits.slice(0, 25).map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-sm last:border-b-0">
                <span className="flex items-center gap-2.5">
                  <span className={`inline-block h-2 w-2 rounded-full ${d.credited ? "bg-delivered" : "bg-waiting"}`} aria-hidden />
                  <span className="font-mono tabular text-foreground">{formatUsdc(d.stroops)}</span>
                  <span className="text-xs text-muted-foreground">{d.memo ?? (d.kind === "contract" ? "contract transfer" : "no memo")}</span>
                </span>
                <span className="flex items-center gap-3 text-xs text-muted-foreground">
                  {new Date(d.at).toLocaleString()}
                  <TxLink href={txUrl(d.hash)} label="Explorer" />
                </span>
              </li>
            ))}
          </ul>
        ) : deposits ? (
          <p className="text-sm text-muted-foreground">No deposits yet.</p>
        ) : null}
      </section>
    </Page>
  );
}
