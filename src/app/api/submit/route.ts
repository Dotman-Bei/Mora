import { body, fail, json, limitIp, limitKey } from "@/lib/server/http";
import { submitSetup } from "@/lib/server/sponsor";

// FR-3.2 / FR-3.4: submit a co-signed tx1. One sponsored setup per passkey
// credential per day, and a per-IP window.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { xdr, credentialId } = await body<{ xdr?: string; credentialId?: string }>(req);
    await limitIp(req, "submit", 10, 86_400);
    if (credentialId) {
      await limitKey(`setup:cred:${String(credentialId).slice(0, 200)}`, 2, 86_400, "This passkey already had its transit account set up today.");
    }
    return json(await submitSetup(String(xdr ?? "")));
  } catch (e) {
    return fail(e);
  }
}
