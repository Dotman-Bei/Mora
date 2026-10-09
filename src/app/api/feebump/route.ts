import { body, fail, json, limitIp } from "@/lib/server/http";
import { feeBump } from "@/lib/server/sponsor";

// FR-5.2 / FR-8.1: wrap the exit account's own signed transaction (tx3 or tx4)
// in a fee bump paid by the sponsor.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    await limitIp(req, "feebump", 40, 3600);
    const { xdr } = await body<{ xdr?: string }>(req);
    return json(await feeBump(String(xdr ?? "")));
  } catch (e) {
    return fail(e);
  }
}
