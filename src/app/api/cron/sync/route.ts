import { NETWORKS } from "@/lib/networks";
import { fail, json } from "@/lib/server/http";
import { syncNetwork } from "@/lib/server/indexer";

export const maxDuration = 60;

// Daily Vercel cron (PRD §10.4.3): runs far inside the RPC retention window so
// no event is missed even if nobody visits, and keeps the database awake.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "Unauthorized" }, 401);
  try {
    const out: Record<string, unknown> = {};
    for (const net of Object.values(NETWORKS)) if (net) out[net.id] = await syncNetwork(net, 60);
    return json(out);
  } catch (e) {
    return fail(e);
  }
}
