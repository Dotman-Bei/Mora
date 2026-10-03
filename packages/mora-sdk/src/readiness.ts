import { Asset, Keypair, xdr } from "@stellar/stellar-sdk";
import { addressKind } from "./address";
import type { MoraAsset, MoraNetwork } from "./network";
import { RpcPool } from "./rpc";

/** The preview chips (PRD §6.2). A preview only; the network decides when you send. */
export type Readiness =
  | "ready"
  | "will-activate"
  | "wait-no-trustline"
  | "wait-not-active"
  | "wait-needs-approval"
  | "wait-limit"
  | "blocked-memo"
  | "invalid"
  | "invalid-muxed";

export interface ReadinessRow {
  address: string;
  /** Stroops. Needed for "will activate" (XLM) and trustline-limit checks. */
  amount?: bigint;
}

export interface ReadinessResult extends ReadinessRow {
  readiness: Readiness;
}

/** Will the row move money now, wait, or not be sent at all? */
export function readinessGroup(r: Readiness): "delivered" | "waiting" | "blocked" {
  if (r === "ready" || r === "will-activate") return "delivered";
  if (r.startsWith("wait-")) return "waiting";
  return "blocked";
}

const AUTHORIZED = 1; // TrustLineFlags.AUTHORIZED_FLAG
const AUTH_REQUIRED = 1; // AccountFlags.AUTH_REQUIRED_FLAG
const MEMO_REQUIRED = "config.memo_required"; // SEP-29
const MAX_KEYS = 200; // getLedgerEntries limit

export interface AccountState {
  exists: boolean;
  /** Stroops. */
  balance: bigint;
  /** Minimum balance the network requires right now, stroops. */
  minBalance: bigint;
  /** Spendable XLM: balance − minimum balance − selling liabilities. */
  free: bigint;
  flags: number;
}

/** Decode an account entry into what Mora needs. */
export function accountState(entry: xdr.LedgerEntryData | undefined, baseReserve: bigint): AccountState {
  if (!entry || entry.type !== "account") {
    return { exists: false, balance: 0n, minBalance: 0n, free: 0n, flags: 0 };
  }
  const a = (entry as unknown as { account: { toXdrObject(): AccountWire } }).account.toXdrObject();
  const v1 = a.ext.v === 1 ? a.ext.v1 : undefined;
  const v2 = v1 && v1.ext.v === 2 ? v1.ext.v2 : undefined;
  const sub = BigInt(a.numSubEntries);
  const sponsoring = BigInt(v2?.numSponsoring ?? 0);
  const sponsored = BigInt(v2?.numSponsored ?? 0);
  const minBalance = (2n + sub + sponsoring - sponsored) * baseReserve;
  const selling = BigInt(v1?.liabilities.selling ?? 0);
  const balance = BigInt(a.balance);
  const free = balance - minBalance - selling;
  return { exists: true, balance, minBalance, free: free > 0n ? free : 0n, flags: a.flags };
}

interface AccountWire {
  balance: bigint | string;
  numSubEntries: number;
  flags: number;
  ext:
    | { v: 0 }
    | {
        v: 1;
        v1: {
          liabilities: { buying: bigint | string; selling: bigint | string };
          ext: { v: 0 } | { v: 2; v2: { numSponsored: number; numSponsoring: number } } | { v: number; v2?: never };
        };
      };
}

function accountId(g: string) {
  return Keypair.fromPublicKey(g).xdrAccountId();
}

export function accountKey(g: string): xdr.LedgerKey {
  return xdr.LedgerKey.account(new xdr.LedgerKeyAccount({ accountId: accountId(g) }));
}

export function trustlineKey(g: string, asset: MoraAsset): xdr.LedgerKey {
  const a = new Asset(asset.code, asset.issuer as string);
  return xdr.LedgerKey.trustline(new xdr.LedgerKeyTrustLine({ accountId: accountId(g), asset: a.toTrustLineXDRObject() }));
}

function memoKey(g: string): xdr.LedgerKey {
  return xdr.LedgerKey.data(new xdr.LedgerKeyData({ accountId: accountId(g), dataName: MEMO_REQUIRED }));
}

/** Read ledger entries in as few calls as the RPC allows, keyed by key XDR. */
export async function readEntries(net: MoraNetwork, keys: xdr.LedgerKey[]): Promise<Map<string, xdr.LedgerEntryData>> {
  const pool = RpcPool.for(net);
  const out = new Map<string, xdr.LedgerEntryData>();
  const unique = [...new Map(keys.map((k) => [k.toXDR("base64"), k])).values()];
  for (let i = 0; i < unique.length; i += MAX_KEYS) {
    const chunk = unique.slice(i, i + MAX_KEYS);
    const res = await pool.call((s) => s.getLedgerEntries(...chunk));
    for (const e of res.entries) out.set(e.key.toXDR("base64"), e.val);
  }
  return out;
}

/**
 * The readiness preview: one RPC read for every recipient's account,
 * trustline and SEP-29 flag (PRD §7 A.2). Throws NetworkUnreadableError when
 * the network can't be read; never guesses.
 */
export async function readiness(
  net: MoraNetwork,
  asset: MoraAsset,
  rows: ReadinessRow[],
  baseReserve: bigint,
): Promise<ReadinessResult[]> {
  const native = asset.issuer === null;
  const keys: xdr.LedgerKey[] = [];
  const accounts = rows.filter((r) => addressKind(r.address) === "account").map((r) => r.address.trim());
  for (const g of accounts) {
    keys.push(accountKey(g), memoKey(g));
    if (!native) keys.push(trustlineKey(g, asset));
  }
  if (!native) keys.push(accountKey(asset.issuer as string));
  const entries = keys.length ? await readEntries(net, keys) : new Map<string, xdr.LedgerEntryData>();
  const get = (k: xdr.LedgerKey) => entries.get(k.toXDR("base64"));

  const issuerAuthRequired = !native && (accountState(get(accountKey(asset.issuer as string)), baseReserve).flags & AUTH_REQUIRED) !== 0;

  return rows.map((row) => {
    const kind = addressKind(row.address);
    if (kind === "invalid") return { ...row, readiness: "invalid" };
    if (kind === "muxed") return { ...row, readiness: "invalid-muxed" };
    // Contracts (smart wallets, apps) hold SAC balances without trustlines.
    if (kind === "contract") return { ...row, readiness: "ready" };

    const g = row.address.trim();
    if (get(memoKey(g))) return { ...row, readiness: "blocked-memo" };
    const acct = accountState(get(accountKey(g)), baseReserve);
    const amount = row.amount ?? 0n;

    if (native) {
      if (acct.exists) return { ...row, readiness: "ready" };
      // Protocol 26: XLM through the SAC creates the account when it covers
      // the 2-reserve minimum (F3). Smaller amounts wait (DECISIONS D-001).
      return { ...row, readiness: amount >= 2n * baseReserve ? "will-activate" : "wait-not-active" };
    }

    if (!acct.exists) return { ...row, readiness: "wait-not-active" };
    const tl = get(trustlineKey(g, asset)) as unknown as
      | { type: "trustline"; trustLine: { balance: bigint; limit: bigint; flags: number } }
      | undefined;
    if (!tl) return { ...row, readiness: issuerAuthRequired ? "wait-needs-approval" : "wait-no-trustline" };
    if ((tl.trustLine.flags & AUTHORIZED) === 0) return { ...row, readiness: "wait-needs-approval" };
    if (BigInt(tl.trustLine.balance) + amount > BigInt(tl.trustLine.limit)) return { ...row, readiness: "wait-limit" };
    return { ...row, readiness: "ready" };
  });
}
