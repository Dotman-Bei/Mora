import { addressKind } from "mora-sdk";
import { requireDb } from "@/lib/server/db";
import { fail, json, networkParam } from "@/lib/server/http";
import { allow, clientIp } from "@/lib/server/rate-limit";

const PAGE = 50;
const STATUSES = ["delivered", "waiting", "claimed", "moved", "returned"];

type Cursor = { l: number; t: string; i: number };
const enc = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");
function dec(s: string | null): Cursor | null {
  if (!s) return null;
  try {
    const c = JSON.parse(Buffer.from(s, "base64url").toString()) as Cursor;
    return Number.isInteger(c.l) && /^[0-9a-f]{64}$/.test(c.t) && Number.isInteger(c.i) ? c : null;
  } catch {
    return null;
  }
}

// GET ?network=&to=&cursor=    waiting payments for a recipient
// GET ?network=&from=&cursor=  payments sent by an address (optional &status=)
// Responses are index candidates; callers confirm with parcel() (PRD §12).
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const net = networkParam(q.get("network"));
  if (!net) return json({ error: "Unknown network" }, 400);
  const to = q.get("to");
  const from = q.get("from");
  const addr = to ?? from;
  const kind = addr ? addressKind(addr) : "invalid";
  if (!addr || (to && from) || (kind !== "account" && kind !== "contract")) {
    return json({ error: "Pass exactly one of to= or from= with a G- or C-address" }, 400);
  }
  const status = q.get("status");
  if (status && !STATUSES.includes(status)) return json({ error: `status must be one of ${STATUSES.join(", ")}` }, 400);
  const cursor = dec(q.get("cursor"));

  try {
    if (!(await allow(`parcels:${clientIp(req)}`, 120, 60))) return json({ error: "Too many requests" }, 429);
    let query = requireDb()
      .from("mora_parcels")
      .select("tx_hash,event_index,ledger,closed_at,from_addr,to_addr,token,amount,outcome,status,reason,refund_after,resolved_tx")
      .eq("network", net.id)
      .eq(to ? "to_addr" : "from_addr", addr)
      .order("ledger", { ascending: false })
      .order("tx_hash", { ascending: false })
      .order("event_index", { ascending: false })
      .limit(PAGE + 1);
    if (to) query = query.eq("status", status ?? "waiting");
    else if (status) query = query.eq("status", status);
    if (cursor) {
      query = query.or(
        `ledger.lt.${cursor.l},and(ledger.eq.${cursor.l},tx_hash.lt.${cursor.t}),and(ledger.eq.${cursor.l},tx_hash.eq.${cursor.t},event_index.lt.${cursor.i})`,
      );
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const page = rows.slice(0, PAGE);
    const last = page[page.length - 1];
    return json({
      network: net.id,
      note: "Index candidates. Confirm each with the contract's parcel(from, to, token) before showing an amount.",
      items: page.map((r) => ({
        txHash: r.tx_hash,
        ledger: r.ledger,
        at: r.closed_at,
        from: r.from_addr,
        to: r.to_addr,
        token: r.token,
        amount: String(r.amount),
        outcome: r.outcome,
        status: r.status,
        reason: r.reason,
        refundAfter: r.refund_after,
        resolvedTx: r.resolved_tx,
      })),
      cursor: rows.length > PAGE && last ? enc({ l: last.ledger, t: last.tx_hash, i: last.event_index }) : null,
    });
  } catch (e) {
    return fail(e);
  }
}
