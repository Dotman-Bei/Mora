import "server-only";
import { parseMoraEvent, RpcPool, type MoraEvent, type MoraNetwork } from "mora-sdk";
import { xdr } from "@stellar/stellar-sdk";
import { requireDb } from "./db";

// Keeping the index current (PRD §10.4): after-write ingest of one
// transaction, and a cursor-based sync of every Mora event. Both are
// idempotent: events are unique on (network, tx hash, event index), and
// payment statuses are recomputed from events for each key touched.

interface Row {
  network: string;
  tx_hash: string;
  event_index: number;
  ledger: number;
  closed_at: string;
  ev: MoraEvent;
}

const MORA_FILTER = (net: MoraNetwork) => [
  {
    type: "contract" as const,
    contractIds: [net.moraContractId],
    // At most 4 topic segments (DECISIONS D-013).
    topics: [[xdr.ScVal.scvSymbol("mora").toXDR("base64"), "**"]],
  },
];

type RpcEvent = { id: string; txHash: string; ledger: number; ledgerClosedAt: string; topic: xdr.ScVal[]; value: xdr.ScVal; inSuccessfulContractCall: boolean };

function toRows(net: MoraNetwork, events: RpcEvent[]): Row[] {
  const rows: Row[] = [];
  for (const e of events) {
    if (!e.inSuccessfulContractCall) continue;
    const ev = parseMoraEvent(e.topic, e.value);
    if (!ev) continue;
    rows.push({
      network: net.id,
      tx_hash: e.txHash,
      event_index: Number(e.id.split("-")[1] ?? 0),
      ledger: e.ledger,
      closed_at: e.ledgerClosedAt,
      ev,
    });
  }
  return rows;
}

async function store(rows: Row[]): Promise<number> {
  if (rows.length === 0) return 0;
  const c = requireDb();
  const events = rows.map((r) => ({
    network: r.network,
    tx_hash: r.tx_hash,
    event_index: r.event_index,
    ledger: r.ledger,
    closed_at: r.closed_at,
    type: r.ev.type,
    from_addr: r.ev.from,
    to_addr: r.ev.to,
    token: r.ev.token,
    amount: r.ev.amount.toString(),
    reason: r.ev.reason ?? null,
    refund_after: r.ev.refundAfter ?? null,
    parcel_total: r.ev.parcelTotal?.toString() ?? null,
    trustline_created: r.ev.trustlineCreated ?? null,
  }));
  const e1 = await c.from("mora_events").upsert(events, { onConflict: "network,tx_hash,event_index", ignoreDuplicates: true });
  if (e1.error) throw new Error(e1.error.message);

  const payments = rows
    .filter((r) => r.ev.type === "delivered" || r.ev.type === "parked")
    .map((r) => ({
      network: r.network,
      tx_hash: r.tx_hash,
      event_index: r.event_index,
      ledger: r.ledger,
      closed_at: r.closed_at,
      from_addr: r.ev.from,
      to_addr: r.ev.to,
      token: r.ev.token,
      amount: r.ev.amount.toString(),
      outcome: r.ev.type === "delivered" ? "delivered" : "waiting",
      status: r.ev.type === "delivered" ? "delivered" : "waiting",
      reason: r.ev.reason ?? null,
      refund_after: r.ev.refundAfter ?? null,
    }));
  if (payments.length) {
    const e2 = await c.from("mora_parcels").upsert(payments, { onConflict: "network,tx_hash,event_index", ignoreDuplicates: true });
    if (e2.error) throw new Error(e2.error.message);
  }

  // Recompute waiting payments for every key this batch touched, from the
  // full event history, so arrival order never matters.
  const keys = new Map<string, Row>();
  for (const r of rows) keys.set(`${r.network}|${r.ev.from}|${r.ev.to}|${r.ev.token}`, r);
  for (const r of keys.values()) await reconcile(r.network, r.ev.from, r.ev.to, r.ev.token);
  return rows.length;
}

async function reconcile(network: string, from: string, to: string, token: string) {
  const c = requireDb();
  const { data, error } = await c
    .from("mora_events")
    .select("tx_hash,event_index,ledger,type")
    .eq("network", network)
    .eq("from_addr", from)
    .eq("to_addr", to)
    .eq("token", token)
    .order("ledger", { ascending: true })
    .order("event_index", { ascending: true });
  if (error) throw new Error(error.message);
  // Walk the key's history: parked payments accumulate until an exit closes them.
  let open: Array<{ tx_hash: string; event_index: number }> = [];
  const closes: Array<{ ids: typeof open; status: string; tx: string; ledger: number }> = [];
  for (const e of data ?? []) {
    if (e.type === "parked") open.push({ tx_hash: e.tx_hash, event_index: e.event_index });
    else if (e.type === "claimed" || e.type === "moved" || e.type === "returned") {
      if (open.length) closes.push({ ids: open, status: e.type, tx: e.tx_hash, ledger: e.ledger });
      open = [];
    }
  }
  for (const cl of closes) {
    for (const id of cl.ids) {
      await c
        .from("mora_parcels")
        .update({ status: cl.status, resolved_tx: cl.tx, resolved_ledger: cl.ledger })
        .eq("network", network)
        .eq("tx_hash", id.tx_hash)
        .eq("event_index", id.event_index);
    }
  }
}

/** After write: index one confirmed transaction (PRD §10.4.1). */
export async function ingestTx(net: MoraNetwork, txHash: string): Promise<{ indexed: number; status: string }> {
  const pool = RpcPool.for(net);
  const tx = await pool.call((s) => s.getTransaction(txHash));
  if (tx.status !== "SUCCESS") return { indexed: 0, status: tx.status };
  const res = await pool.call((s) =>
    s.getEvents({ startLedger: tx.ledger, endLedger: tx.ledger + 1, filters: MORA_FILTER(net), limit: 1000 }),
  );
  const rows = toRows(net, (res.events as unknown as RpcEvent[]).filter((e) => e.txHash === txHash));
  return { indexed: await store(rows), status: tx.status };
}

/**
 * Pull every Mora event since the stored cursor (PRD §10.4.2-3). Bounded per
 * call so it fits a serverless time limit; the next call continues.
 */
export async function syncNetwork(net: MoraNetwork, maxPages = 25): Promise<{ indexed: number; lastLedger: number | null }> {
  const c = requireDb();
  const pool = RpcPool.for(net);
  const { data: state } = await c.from("mora_sync").select("cursor,last_ledger").eq("network", net.id).maybeSingle();
  let cursor = (state?.cursor as string | null) ?? undefined;
  let lastLedger = (state?.last_ledger as number | null) ?? null;
  let indexed = 0;

  if (!cursor) {
    const health = await pool.call((s) => s.getHealth());
    lastLedger = health.oldestLedger;
  }
  for (let page = 0; page < maxPages; page++) {
    const res = await pool.call((s) =>
      cursor
        ? s.getEvents({ cursor, filters: MORA_FILTER(net), limit: 200 })
        : s.getEvents({ startLedger: lastLedger as number, filters: MORA_FILTER(net), limit: 200 }),
    );
    indexed += await store(toRows(net, res.events as unknown as RpcEvent[]));
    const moved = res.cursor && res.cursor !== cursor;
    if (res.cursor) cursor = res.cursor;
    lastLedger = res.latestLedger ?? lastLedger;
    if (!moved || (res.events.length < 200 && cursorLedger(res.cursor) >= (res.latestLedger ?? 0))) break;
  }
  await c.from("mora_sync").upsert({ network: net.id, cursor: cursor ?? null, last_ledger: lastLedger, updated_at: new Date().toISOString() });
  return { indexed, lastLedger };
}

function cursorLedger(cursor: string | undefined): number {
  try {
    return Number(BigInt((cursor ?? "0").split("-")[0] ?? "0") >> 32n);
  } catch {
    return 0;
  }
}
