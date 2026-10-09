import { parseUsdc } from "@/lib/amount";
import { parseMemo } from "@/lib/destination";
import { body, fail, json, limitIp } from "@/lib/server/http";
import { tryNaive } from "@/lib/server/sponsor";

// FR-7: the naive path, sent to the network so the rejection is its own.
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    await limitIp(req, "before", 30, 3600);
    const b = await body<{ from?: string; amount?: string; memoType?: "id" | "text"; memo?: string }>(req);
    const amount = parseUsdc(String(b.amount ?? ""));
    if (!amount.ok) return json({ error: amount.error }, 400);
    const memo = parseMemo(b.memoType === "id" ? "id" : "text", String(b.memo ?? ""));
    if (!memo.ok || memo.value.type === "none") return json({ error: memo.ok ? "Enter a memo." : memo.error }, 400);
    return json(await tryNaive(String(b.from ?? ""), amount.value, memo.value));
  } catch (e) {
    return fail(e);
  }
}
