import { fromDecimal } from "./amount";
import { NETWORK, SIMULATOR_DEPOSIT, USDC } from "./config";

// The testnet exchange simulator (PRD §12). It credits what real exchanges
// credit: classic USDC payments carrying a memo. Contract transfers and
// memo-less payments land on chain but aren't credited.

export interface HorizonRecord {
  id: string;
  type: string;
  created_at: string;
  transaction_hash: string;
  from?: string;
  to?: string;
  to_muxed_id?: string;
  amount?: string;
  asset_code?: string;
  asset_issuer?: string;
  asset_balance_changes?: { type: string; from?: string; to?: string; amount: string; asset_code?: string; asset_issuer?: string }[];
  transaction?: { memo_type?: string; memo?: string };
}

export interface Deposit {
  id: string;
  hash: string;
  at: string;
  from: string;
  stroops: bigint;
  kind: "payment" | "contract";
  /** "ID 4417", "Text abc", "Muxed ID 9" or null */
  memo: string | null;
  credited: boolean;
  reason: string;
}

const isUsdc = (code?: string, issuer?: string) => code === USDC.code && issuer === USDC.issuer;

export function classify(r: HorizonRecord, deposit = SIMULATOR_DEPOSIT): Deposit | null {
  if ((r.type === "payment" || r.type.startsWith("path_payment")) && r.to === deposit && isUsdc(r.asset_code, r.asset_issuer)) {
    const memo = r.to_muxed_id
      ? `Muxed ID ${r.to_muxed_id}`
      : r.transaction?.memo_type && r.transaction.memo_type !== "none" && r.transaction.memo !== undefined
        ? `${r.transaction.memo_type === "id" ? "ID" : r.transaction.memo_type === "text" ? "Text" : r.transaction.memo_type} ${r.transaction.memo}`
        : null;
    return {
      id: r.id,
      hash: r.transaction_hash,
      at: r.created_at,
      from: r.from ?? "",
      stroops: fromDecimal(r.amount ?? "0"),
      kind: "payment",
      memo,
      credited: !!memo,
      reason: memo ? "Classic payment with a memo" : "No memo: the exchange can't tell whose deposit it is",
    };
  }
  if (r.type === "invoke_host_function") {
    const c = r.asset_balance_changes?.find((x) => x.to === deposit && isUsdc(x.asset_code, x.asset_issuer));
    if (!c) return null;
    return {
      id: r.id,
      hash: r.transaction_hash,
      at: r.created_at,
      from: c.from ?? "",
      stroops: fromDecimal(c.amount),
      kind: "contract",
      memo: null,
      credited: false,
      reason: "Contract transfer: exchanges don't credit these",
    };
  }
  return null;
}

export async function loadDeposits(limit = 100): Promise<Deposit[]> {
  const r = await fetch(`${NETWORK.horizonUrl}/accounts/${SIMULATOR_DEPOSIT}/payments?order=desc&limit=${limit}&join=transactions`, { cache: "no-store" });
  if (!r.ok) throw new Error(`Horizon returned ${r.status}`);
  const j = (await r.json()) as { _embedded: { records: HorizonRecord[] } };
  return j._embedded.records.map((x) => classify(x)).filter((d): d is Deposit => !!d);
}

/** Credited balance per memo. */
export function balances(deposits: Deposit[]): { memo: string; stroops: bigint; count: number }[] {
  const m = new Map<string, { stroops: bigint; count: number }>();
  for (const d of deposits) {
    if (!d.credited || !d.memo) continue;
    const v = m.get(d.memo) ?? { stroops: 0n, count: 0 };
    v.stroops += d.stroops;
    v.count++;
    m.set(d.memo, v);
  }
  return [...m.entries()].map(([memo, v]) => ({ memo, ...v })).sort((a, b) => (b.stroops > a.stroops ? 1 : -1));
}

/** This browser's deposit memo at the simulator, like an exchange account's memo. */
export function simulatorMemo(): string {
  try {
    const k = "portaj:simulator-memo";
    let v = window.localStorage.getItem(k);
    if (!v) {
      v = String(100000 + Math.floor(Math.random() * 900000));
      window.localStorage.setItem(k, v);
    }
    return v;
  } catch {
    return "4417";
  }
}
