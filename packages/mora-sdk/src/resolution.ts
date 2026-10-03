import { Address, xdr } from "@stellar/stellar-sdk";
import { parseMoraEvent, type MoraEvent } from "./events";
import type { MoraNetwork } from "./network";
import { RpcPool } from "./rpc";

export interface Resolution {
  /** claimed by the recipient, moved by `deliver`, or returned to the sender. */
  type: "claimed" | "moved" | "returned";
  amount: bigint;
  txHash: string;
  ledger: number;
  closedAt: string;
  trustlineCreated?: boolean;
}

const sym = (s: string) => xdr.ScVal.scvSymbol(s).toXDR("base64");
const addr = (a: string) => Address.fromString(a).toScVal().toXDR("base64");

/**
 * How did the payment under (from, to, token) end? Reads Mora's own events
 * straight from RPC (no Mora server involved), within the RPC's retention
 * window. Returns the most recent exit, or null if none is found in the window.
 */
export async function findResolution(
  net: MoraNetwork,
  key: { from: string; to: string; token: string },
): Promise<Resolution | null> {
  const pool = RpcPool.for(net);
  return pool.call(async (s) => {
    const health = await s.getHealth();
    const filters = [
      {
        type: "contract" as const,
        contractIds: [net.moraContractId],
        // RPC topic filters allow at most 4 segments and Mora events carry 5,
        // so match on `mora, *, from, **` and check to/token here.
        topics: [[sym("mora"), "*", addr(key.from), "**"]],
      },
    ];
    let found: Resolution | null = null;
    let cursor: string | undefined;
    // Each page scans a slice of the retention window; follow the cursor
    // until it stops moving.
    for (let page = 0; page < 60; page++) {
      const res = cursor
        ? await s.getEvents({ filters, cursor, limit: 100 })
        : await s.getEvents({ filters, startLedger: health.oldestLedger, limit: 100 });
      for (const e of res.events) {
        const ev: MoraEvent | null = parseMoraEvent(e.topic, e.value);
        if (!ev || ev.to !== key.to || ev.token !== key.token) continue;
        if (ev.type !== "claimed" && ev.type !== "moved" && ev.type !== "returned") continue;
        found = {
          type: ev.type,
          amount: ev.amount,
          txHash: e.txHash,
          ledger: e.ledger,
          closedAt: e.ledgerClosedAt,
          trustlineCreated: ev.trustlineCreated,
        };
      }
      if (!res.cursor || res.cursor === cursor) break;
      cursor = res.cursor;
      if (res.events.length < 100 && res.latestLedger && cursorLedger(res.cursor) >= res.latestLedger) break;
    }
    return found;
  });
}

/** RPC event cursors start with the TOID; the ledger is its top 32 bits. */
function cursorLedger(cursor: string): number {
  const toid = cursor.split("-")[0] ?? "0";
  try {
    return Number(BigInt(toid) >> 32n);
  } catch {
    return 0;
  }
}
