import { requireDb } from "@/lib/server/db";
import { fail, json, networkParam } from "@/lib/server/http";

// GET ?network=: counts for the landing page (PRD §12), from the index.
export async function GET(req: Request) {
  const net = networkParam(new URL(req.url).searchParams.get("network"));
  if (!net) return json({ error: "Unknown network" }, 400);
  try {
    const { data, error } = await requireDb().rpc("mora_stats", { p_network: net.id });
    if (error) throw new Error(error.message);
    const r = ((data as Array<Record<string, number>>) ?? [])[0] ?? {};
    return json(
      {
        network: net.id,
        stats: {
          delivered: Number(r.delivered ?? 0),
          waited: Number(r.waited ?? 0),
          claimed: Number(r.claimed ?? 0),
          returned: Number(r.returned ?? 0),
        },
      },
      200,
      { "cache-control": "public, s-maxage=30" },
    );
  } catch (e) {
    return fail(e);
  }
}
