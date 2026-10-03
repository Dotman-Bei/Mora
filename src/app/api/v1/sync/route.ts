import { requireDb } from "@/lib/server/db";
import { fail, json, networkParam } from "@/lib/server/http";
import { syncNetwork } from "@/lib/server/indexer";
import { allow, clientIp } from "@/lib/server/rate-limit";

export const maxDuration = 30;

// GET ?network=: pull new events since the cursor (PRD §10.4.2). Called by
// Inbox, Activity and the landing numbers before they read. Rate limited.
export async function GET(req: Request) {
  const net = networkParam(new URL(req.url).searchParams.get("network"));
  if (!net) return json({ error: "Unknown network" }, 400);
  try {
    const c = requireDb();
    const { data } = await c.from("mora_sync").select("updated_at,last_ledger").eq("network", net.id).maybeSingle();
    if (data && Date.now() - new Date(data.updated_at as string).getTime() < 15_000) {
      return json({ indexed: 0, lastLedger: data.last_ledger, fresh: true });
    }
    if (!(await allow(`sync:${clientIp(req)}`, 20, 60))) return json({ error: "Too many requests" }, 429);
    return json(await syncNetwork(net));
  } catch (e) {
    return fail(e);
  }
}
