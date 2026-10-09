import { body, fail, json, limitIp } from "@/lib/server/http";
import { relayDeploy } from "@/lib/server/sponsor";

// FR-9.1: deploy a new passkey-kit smart wallet, fee paid by the sponsor.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    await limitIp(req, "deploy", 6, 3600);
    const { xdr } = await body<{ xdr?: string }>(req);
    return json(await relayDeploy(String(xdr ?? "")));
  } catch (e) {
    return fail(e);
  }
}
