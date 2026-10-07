"use client";

import { formatAmount, type NetworkProbe } from "mora-sdk";

/**
 * Tell the index about a transaction we just submitted (PRD §10.4 "after
 * write"). Fire and forget, or await it when the next read depends on it.
 */
export function reportTx(network: string, txHash: string | undefined): Promise<void> {
  if (!txHash) return Promise.resolve();
  return fetch("/api/v1/ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ network, txHash }),
    keepalive: true,
  })
    .then(() => undefined)
    .catch(() => undefined);
}

/** A wallet error in plain words. Rejection always says nothing moved (PRD §6.2). */
export function walletErrorMessage(e: unknown): string {
  const raw =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e && "message" in e
        ? String((e as { message: unknown }).message)
        : String(e);
  if (/reject|denied|declin|cancel|closed/i.test(raw)) return "Nothing was sent. Nothing left your wallet.";
  if (/Error\(Contract, #5\)/.test(raw)) return "The return date hasn't passed yet.";
  if (/txBadSeq|bad_seq/i.test(raw)) return "Your wallet's account changed while signing. Try again.";
  if (/insufficient|underfunded|txInsufficientBalance/i.test(raw)) return "Not enough XLM to cover the network fee.";
  return raw.length > 220 ? raw.slice(0, 220) + "…" : raw;
}

export function xlm(stroops: bigint): string {
  return `${formatAmount(stroops)} XLM`;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

/** A ledger as an estimated local date (PRD §11.7: dates are converted from probed close times). */
export function ledgerDate(p: NetworkProbe, ledger: number): string {
  const t = (p.closeTime + (ledger - p.ledger) * p.secondsPerLedger) * 1000;
  return dateFmt.format(new Date(t));
}
