import "server-only";
import { db } from "./db";

const TABLE = "portaj_rate";
// Fallback when Supabase isn't configured: per-instance memory. Weaker (each
// serverless instance counts on its own) but never unlimited.
const memory = new Map<string, { start: number; count: number }>();

/** Fixed-window limit (FR-3.4, §13 abuse limits). Returns true if allowed. */
export async function allow(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const now = Date.now();
  const c = db();
  if (c) {
    const { data, error } = await c.from(TABLE).select("window_start,count").eq("key", key).maybeSingle();
    if (!error) {
      const start = data ? new Date(data.window_start as string).getTime() : null;
      if (start === null || now - start > windowSeconds * 1000) {
        await c.from(TABLE).upsert({ key, window_start: new Date(now).toISOString(), count: 1 });
        return true;
      }
      if ((data!.count as number) >= limit) return false;
      await c.from(TABLE).update({ count: (data!.count as number) + 1 }).eq("key", key);
      return true;
    }
  }
  const m = memory.get(key);
  if (!m || now - m.start > windowSeconds * 1000) {
    memory.set(key, { start: now, count: 1 });
    return true;
  }
  if (m.count >= limit) return false;
  m.count++;
  return true;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "unknown").trim();
}
