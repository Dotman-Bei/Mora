import { fromDecimal } from "./amount";
import { NETWORK, USDC } from "./config";

// Plain-fetch Horizon reads, shared by the browser and the sponsor service.

export interface AccountState {
  id: string;
  exists: boolean;
  /** Who pays this account's base reserve (CAP-33), if anyone. */
  sponsor: string | null;
  nativeStroops: bigint;
  usdc: { stroops: bigint; sponsor: string | null } | null;
  /** SEP-29 config.memo_required = 1 */
  memoRequired: boolean;
  sequence: string;
}

interface HorizonBalance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
  sponsor?: string;
}

export async function getAccount(id: string, horizonUrl = NETWORK.horizonUrl): Promise<AccountState> {
  const r = await fetch(`${horizonUrl}/accounts/${id}`, { cache: "no-store" });
  if (r.status === 404) {
    return { id, exists: false, sponsor: null, nativeStroops: 0n, usdc: null, memoRequired: false, sequence: "0" };
  }
  if (!r.ok) throw new Error(`Horizon returned ${r.status} for ${id.slice(0, 6)}…`);
  const a = (await r.json()) as {
    sponsor?: string;
    sequence: string;
    balances: HorizonBalance[];
    data?: Record<string, string>;
  };
  const native = a.balances.find((b) => b.asset_type === "native");
  const usdc = a.balances.find((b) => b.asset_code === USDC.code && b.asset_issuer === USDC.issuer);
  return {
    id,
    exists: true,
    sponsor: a.sponsor ?? null,
    nativeStroops: native ? fromDecimal(native.balance) : 0n,
    usdc: usdc ? { stroops: fromDecimal(usdc.balance), sponsor: usdc.sponsor ?? null } : null,
    memoRequired: a.data?.["config.memo_required"] === "MQ==",
    sequence: a.sequence,
  };
}
