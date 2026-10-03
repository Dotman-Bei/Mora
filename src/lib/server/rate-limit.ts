import "server-only";
import { db } from "./db";

/**
 * Fixed-window limit backed by the index, so functions stay stateless (PRD
 * §10.3). Returns true if allowed. With no index configured, it allows: the
 * faucet still has its on-chain per-address checks.
 */
export async function allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const c = db();
  if (!c) return true;
  const now = new Date();
  const { data } = await c.from("mora_rate").select("window_start,count").eq("key", key).maybeSingle();
  const start = data ? new Date(data.window_start as string) : null;
  if (!start || now.getTime() - start.getTime() > windowSeconds * 1000) {
    await c.from("mora_rate").upsert({ key, window_start: now.toISOString(), count: 1 });
    return true;
  }
  if ((data!.count as number) >= limit) return false;
  await c.from("mora_rate").update({ count: (data!.count as number) + 1 }).eq("key", key);
  return true;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}
