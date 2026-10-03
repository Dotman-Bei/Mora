import { Address, xdr } from "@stellar/stellar-sdk";
import { getParcel } from "./build";
import { parseMoraEvent, type MoraEvent } from "./events";
import type { MoraNetwork } from "./network";
import { RpcPool } from "./rpc";

export interface ScannedEvent extends MoraEvent {
  txHash: string;
  ledger: number;
  closedAt: string;
}

const sym = (s: string) => xdr.ScVal.scvSymbol(s).toXDR("base64");
const addr = (a: string) => Address.fromString(a).toScVal().toXDR("base64");

/**
 * Every Mora event matching `topics` within the RPC's retention window, oldest
 * first. Follows the cursor until it stops moving. Used when the index isn't
 * available; RPC keeps about 7 days of events.
 */
export async function scanMoraEvents(net: MoraNetwork, topics: string[], maxPages = 80): Promise<{ events: ScannedEvent[]; oldestLedger: number; latestLedger: number }> {
  const pool = RpcPool.for(net);
  return pool.call(async (s) => {
    const health = await s.getHealth();
    const filters = [{ type: "contract" as const, contractIds: [net.moraContractId], topics: [topics] }];
    const out: ScannedEvent[] = [];
    let cursor: string | undefined;
    let latest = health.latestLedger;
    for (let page = 0; page < maxPages; page++) {
      const res = cursor
        ? await s.getEvents({ filters, cursor, limit: 200 })
        : await s.getEvents({ filters, startLedger: health.oldestLedger, limit: 200 });
      for (const e of res.events) {
        if (!e.inSuccessfulContractCall) continue;
        const ev = parseMoraEvent(e.topic, e.value);
        if (ev) out.push({ ...ev, txHash: e.txHash, ledger: e.ledger, closedAt: e.ledgerClosedAt });
      }
      latest = res.latestLedger ?? latest;
      if (!res.cursor || res.cursor === cursor) break;
      cursor = res.cursor;
      if (res.events.length < 200 && cursorLedger(res.cursor) >= latest) break;
    }
    return { events: out, oldestLedger: health.oldestLedger, latestLedger: latest };
  });
}

/** Mora events with `to` as recipient. A trailing `**` keeps the filter within RPC limits (D-013). */
export function scanForRecipient(net: MoraNetwork, to: string) {
  return scanMoraEvents(net, [sym("mora"), "*", "*", addr(to), "**"]);
}

/** Mora events sent by `from`. */
export function scanForSender(net: MoraNetwork, from: string) {
  return scanMoraEvents(net, [sym("mora"), "*", addr(from), "**"]);
}

export interface WaitingCandidate {
  from: string;
  token: string;
}

/**
 * Keys (from, token) that may hold a parcel for `to`, from RPC history. These
 * are candidates only: confirm each with getParcel() before showing it.
 */
export async function waitingCandidatesFromRpc(net: MoraNetwork, to: string): Promise<WaitingCandidate[]> {
  const { events } = await scanForRecipient(net, to);
  const open = new Map<string, WaitingCandidate>();
  for (const e of events) {
    const k = `${e.from}|${e.token}`;
    if (e.type === "parked") open.set(k, { from: e.from, token: e.token });
    else if (e.type === "claimed" || e.type === "moved" || e.type === "returned") open.delete(k);
  }
  return [...open.values()];
}

/** Confirm candidates against the contract; returns only parcels that exist now. */
export async function confirmParcels(net: MoraNetwork, to: string, candidates: WaitingCandidate[]) {
  const unique = [...new Map(candidates.map((c) => [`${c.from}|${c.token}`, c])).values()];
  const out: Array<WaitingCandidate & { amount: bigint; refundAfter: number }> = [];
  // A few at a time keeps public RPC providers happy.
  for (let i = 0; i < unique.length; i += 5) {
    const batch = await Promise.all(
      unique.slice(i, i + 5).map(async (c) => ({ c, p: await getParcel(net, { from: c.from, to, token: c.token }) })),
    );
    for (const { c, p } of batch) if (p) out.push({ ...c, amount: BigInt(p.amount), refundAfter: p.refund_after });
  }
  return out;
}

function cursorLedger(cursor: string): number {
  try {
    return Number(BigInt(cursor.split("-")[0] ?? "0") >> 32n);
  } catch {
    return 0;
  }
}
