import { body, fail, json, limitIp } from "@/lib/server/http";
import { buildSetup } from "@/lib/server/sponsor";

// FR-3.1 to FR-3.3: build tx1 for an exit account, signed by the sponsor.
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    await limitIp(req, "setup", 20, 3600);
    const { account } = await body<{ account?: string }>(req);
    return json(await buildSetup(String(account ?? "")));
  } catch (e) {
    return fail(e);
  }
}
