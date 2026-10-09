"use client";

import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { api } from "./api";
import { NETWORK, USDC } from "./config";
import { deriveExitKeypair } from "./derive";
import type { Destination, MemoInput } from "./destination";
import { getAccount } from "./horizon";
import { buildPaymentOut, buildReturn } from "./txs";
import { prfGet, prfCreate, type PrfCapture } from "./webauthn";

// The exit steps the screens share (PRD §5, §9, §11).

export interface Unlocked {
  keypair: Keypair | null;
  credentialId: string;
}

async function fromCapture(c: PrfCapture): Promise<Unlocked> {
  return { keypair: c.first ? await deriveExitKeypair(c.first, NETWORK.passphrase) : null, credentialId: c.credentialId };
}

/** One passkey prompt → the exit account key, or null when PRF isn't available (FR-2.4). */
export async function unlock(credentialId?: string): Promise<Unlocked> {
  return fromCapture(await prfGet(credentialId));
}

/** Mode B first run: a passkey on Portaj's domain that only derives the exit account. */
export async function createPasskey(): Promise<Unlocked> {
  return fromCapture(await prfCreate(`Portaj exit · ${new Date().toISOString().slice(0, 10)}`));
}

/** §10.4: no PRF, so a random key held in memory for this session only. */
export function oneTimeKey(): Keypair {
  return Keypair.random();
}

/** tx1 when needed (FR-3). Returns the setup hash, or undefined if the account is ready. */
export async function ensureSetup(kp: Keypair, credentialId?: string): Promise<string | undefined> {
  const { xdr } = await api.setup(kp.publicKey());
  if (!xdr) return undefined;
  const tx = TransactionBuilder.fromXDR(xdr, NETWORK.passphrase);
  tx.sign(kp);
  return (await api.submit(tx.toXDR(), credentialId)).hash;
}

/** tx3 (FR-5). */
export async function payOut(kp: Keypair, dest: Destination, memo: MemoInput, stroops: bigint): Promise<string> {
  const a = await getAccount(kp.publicKey());
  return (await api.feebump(buildPaymentOut(kp, a.sequence, dest, memo, stroops))).hash;
}

/** tx4 (FR-8.1): everything in the exit account back to a wallet. */
export async function returnAll(kp: Keypair, to: string): Promise<{ hash: string; stroops: bigint }> {
  const a = await getAccount(kp.publicKey());
  const stroops = a.usdc?.stroops ?? 0n;
  if (stroops <= 0n) throw new Error("The exit account holds no USDC.");
  return { hash: (await api.feebump(await buildReturn(kp, a.sequence, to, stroops))).hash, stroops };
}

/** Mode B: the latest USDC that arrived in the exit account, for the receipt's transfer-in link. */
export async function findIncoming(account: string): Promise<string | undefined> {
  try {
    const r = await fetch(`${NETWORK.horizonUrl}/accounts/${account}/payments?order=desc&limit=10`);
    const j = (await r.json()) as {
      _embedded: { records: { type: string; to?: string; asset_code?: string; asset_issuer?: string; transaction_hash: string; asset_balance_changes?: { to: string; asset_code?: string; asset_issuer?: string }[] }[] };
    };
    const hit = j._embedded.records.find(
      (p) =>
        (p.type === "payment" && p.to === account && p.asset_code === USDC.code && p.asset_issuer === USDC.issuer) ||
        (p.type === "invoke_host_function" && p.asset_balance_changes?.some((c) => c.to === account && c.asset_code === USDC.code && c.asset_issuer === USDC.issuer)),
    );
    return hit?.transaction_hash;
  } catch {
    return undefined;
  }
}

/** §10.4: the one-time key, saved by the user before any money moves. */
export function downloadRecoveryFile(kp: Keypair, details: Record<string, string>) {
  const body = JSON.stringify(
    {
      portaj: "one-time exit account",
      warning: "This file holds a secret key. Anyone with it can move what's in this account. Delete it once your exit is done.",
      network: NETWORK.id,
      account: kp.publicKey(),
      secret: kp.secret(),
      ...details,
      createdAt: new Date().toISOString(),
    },
    null,
    2,
  );
  const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `portaj-recovery-${kp.publicKey().slice(0, 6)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
