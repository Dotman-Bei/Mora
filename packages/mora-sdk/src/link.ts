import type { NetworkId } from "./network";

export interface ClaimLinkParams {
  network: NetworkId;
  from: string;
  to: string;
  /** The asset's SAC contract ID. */
  asset: string;
}

/**
 * The link senders share: `/claim?network=&from=&to=&asset=` (PRD §6.3).
 * Everything needed to find the payment on chain is in the link, so it works
 * even when every Mora server is down.
 */
export function claimLink(p: ClaimLinkParams, base = "https://mora.vercel.app"): string {
  const q = new URLSearchParams({ network: p.network, from: p.from, to: p.to, asset: p.asset });
  return `${base.replace(/\/$/, "")}/claim?${q.toString()}`;
}

export function parseClaimLink(search: URLSearchParams | Record<string, string | string[] | undefined>): Partial<ClaimLinkParams> {
  const get = (k: string) => {
    const v = search instanceof URLSearchParams ? search.get(k) : search[k];
    return (Array.isArray(v) ? v[0] : v) ?? undefined;
  };
  const network = get("network");
  return {
    network: network === "mainnet" || network === "testnet" ? network : undefined,
    from: get("from"),
    to: get("to"),
    asset: get("asset"),
  };
}
