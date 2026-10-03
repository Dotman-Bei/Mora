import { db } from "@/lib/server/db";
import { fail, json, networkParam } from "@/lib/server/http";
import { ingestTx } from "@/lib/server/indexer";
import { allow, clientIp } from "@/lib/server/rate-limit";

export const maxDuration = 30;

// POST { network, txHash }: index a confirmed transaction. Idempotent
// (PRD §12). Reads the transaction from RPC; never trusts the caller's data.
export async function POST(req: Request) {
  let body: { network?: string; txHash?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Expected JSON { network, txHash }" }, 400);
  }
  const net = networkParam(body.network);
  if (!net) return json({ error: "Unknown network" }, 400);
  if (!body.txHash || !/^[0-9a-f]{64}$/i.test(body.txHash)) return json({ error: "txHash must be 64 hex characters" }, 400);
  if (!db()) return json({ indexed: 0, note: "Index not configured" }, 202);
  if (!(await allow(`ingest:${clientIp(req)}`, 60, 60))) return json({ error: "Too many requests" }, 429);
  try {
    // The transaction may still be closing; give it a few tries.
    for (let i = 0; i < 6; i++) {
      const r = await ingestTx(net, body.txHash.toLowerCase());
      if (r.status !== "NOT_FOUND") return json(r);
      await new Promise((res) => setTimeout(res, 1500));
    }
    return json({ indexed: 0, status: "NOT_FOUND" }, 404);
  } catch (e) {
    return fail(e);
  }
}
