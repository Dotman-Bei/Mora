import { body, fail, json, limitIp } from "@/lib/server/http";
import { relayTransfer, type RelayPurpose } from "@/lib/server/sponsor";

// FR-4.1: tx2, the smart wallet's transfer into its exit account. The sponsor
// builds the envelope around the passkey-signed `{func, auth}` and pays the fee.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    await limitIp(req, "relay", 40, 3600);
    const b = await body<{ func?: string; auth?: string[]; purpose?: RelayPurpose }>(req);
    if (typeof b.func !== "string" || !Array.isArray(b.auth)) return json({ error: "Send { func, auth }." }, 400);
    return json(await relayTransfer(b.func, b.auth.map(String), b.purpose === "naive" ? "naive" : "exit"));
  } catch (e) {
    return fail(e);
  }
}
