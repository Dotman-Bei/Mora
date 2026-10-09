import { parseUsdc } from "@/lib/amount";
import { TEST_USDC_GRANT } from "@/lib/config";
import { body, fail, json, limitIp, limitKey } from "@/lib/server/http";
import { grantTestUsdc } from "@/lib/server/sponsor";

// FR-9.2: test USDC for a new judge wallet, from the sponsor's testnet stash.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { contractId } = await body<{ contractId?: string }>(req);
    await limitIp(req, "fund", 6, 86_400);
    await limitKey(`fund:${String(contractId).slice(0, 60)}`, 3, 86_400, "This wallet already got test USDC today.");
    const amount = parseUsdc(TEST_USDC_GRANT);
    if (!amount.ok) throw new Error("bad grant");
    const hash = await grantTestUsdc(String(contractId ?? ""), amount.value);
    return json({ hash, amount: TEST_USDC_GRANT });
  } catch (e) {
    return fail(e);
  }
}
