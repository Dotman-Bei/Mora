import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import {
  addressKind,
  buildSend,
  claimLink,
  getParcel,
  ledgerAfter,
  parseOutcome,
  probeNetwork,
  readEntries,
  sentHash,
  simulationError,
  trustlineKey,
} from "mora-sdk";
import { deployments, testnetExtras } from "../../../../../deployments";
import { getNetwork } from "@/lib/networks";
import { db } from "@/lib/server/db";
import { json } from "@/lib/server/http";
import { ingestTx } from "@/lib/server/indexer";
import { allow, clientIp } from "@/lib/server/rate-limit";

export const maxDuration = 30;

const FAUCET_DAYS = 7;

// POST { address }: testnet only. Pays 100 TESTUSD *through Mora*, so a new
// tester's first experience is a payment waiting for them (PRD §6.7). The
// testnet faucet key is the only key on any server (PRD §14).
export async function POST(req: Request) {
  const net = getNetwork("testnet");
  const secret = process.env.MORA_FAUCET_SECRET;
  if (!net || !secret) return json({ error: "The faucet isn't configured." }, 503);

  let address: string | undefined;
  try {
    address = ((await req.json()) as { address?: string }).address?.trim();
  } catch {}
  if (!address || (addressKind(address) !== "account" && addressKind(address) !== "contract")) {
    return json({ error: "Send a testnet G- or C-address." }, 400);
  }

  const kp = Keypair.fromSecret(secret);
  const faucet = testnetExtras.faucet.account;
  if (kp.publicKey() !== faucet) return json({ error: "Faucet key doesn't match the deployment record." }, 500);
  const testusd = net.assets.find((a) => a.code === "TESTUSD" && a.test);
  if (!testusd) return json({ error: "TESTUSD isn't in the testnet deployment." }, 500);
  const amount = BigInt(testnetExtras.faucet.amount);
  const claimPath = new URL(claimLink({ network: "testnet", from: faucet, to: address, asset: testusd.sac })).search;

  // Per-address limits read from the chain, so they hold with no database.
  const waiting = await getParcel(net, { from: faucet, to: address, token: testusd.sac }).catch(() => null);
  if (waiting) return json({ error: "100 TESTUSD is already waiting for you.", outcome: "waiting", claimPath: `/claim${claimPath}` }, 429);
  if (address.startsWith("G")) {
    const tl = (await readEntries(net, [trustlineKey(address, testusd)]).catch(() => new Map())).get(
      trustlineKey(address, testusd).toXDR("base64"),
    ) as unknown as { trustLine: { balance: bigint } } | undefined;
    if (tl && BigInt(tl.trustLine.balance) >= amount) return json({ error: "You already have TESTUSD. Send some through Mora!" }, 429);
  }
  if (!(await allow(`faucet:ip:${clientIp(req)}`, 5, 3600))) return json({ error: "The faucet is resting. Try again in an hour." }, 429);
  if (!(await allow(`faucet:addr:${address}`, 3, 86400))) return json({ error: "This address has had enough TESTUSD today." }, 429);

  try {
    const probe = await probeNetwork(net);
    const { signTransaction } = basicNodeSigner(kp, net.passphrase);
    const tx = await buildSend(
      net,
      { publicKey: faucet, signTransaction },
      { from: faucet, token: testusd.sac, to: address, amount, refundAfter: ledgerAfter(probe, FAUCET_DAYS * 86400) },
    );
    const simErr = simulationError(tx);
    if (simErr) return json({ error: `The faucet's payment was refused: ${simErr.name ?? simErr.message}` }, 502);
    const sent = await tx.signAndSend();
    const hash = sentHash(sent);
    const outcome = parseOutcome(sent.result).status;
    if (hash && db()) await ingestTx(net, hash).catch(() => {});
    return json({
      outcome,
      txHash: hash,
      txUrl: hash ? net.explorer.tx(hash) : null,
      claimPath: `/claim${claimPath}`,
      deployment: deployments.testnet.mora.contractId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: /bad_?seq/i.test(msg) ? "The faucet is busy. Try again in a few seconds." : "The faucet couldn't pay right now." }, 502);
  }
}
