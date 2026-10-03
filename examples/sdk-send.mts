// The /integrate app snippet, runnable (PRD §19 M6):
//   MORA_SECRET=S... npx tsx examples/sdk-send.mts <recipient G or C address> [amount]
// Testnet only. The secret is read from the environment and never printed.
import { Keypair } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import {
  buildSend,
  claimLink,
  ledgerAfter,
  networkFromDeployment,
  parseAmount,
  parseOutcome,
  probeNetwork,
  sentHash,
  type DeploymentFile,
} from "mora-sdk";
import deployment from "../deployments/testnet.json" with { type: "json" };

const net = networkFromDeployment(deployment as DeploymentFile, ["https://soroban-testnet.stellar.org"]);
const token = net.assets.find((a) => a.code === "TESTUSD")!.sac;
const kp = Keypair.fromSecret(process.env.MORA_SECRET!);
const from = kp.publicKey();
const to = process.argv[2]!;

const probe = await probeNetwork(net);
const tx = await buildSend(
  net,
  { publicKey: from, signTransaction: basicNodeSigner(kp, net.passphrase).signTransaction },
  { from, token, to, amount: parseAmount(process.argv[3] ?? "1"), refundAfter: ledgerAfter(probe, 7 * 86400) },
);
console.log("simulated:", parseOutcome(tx.result));

const sent = await tx.signAndSend();
const outcome = parseOutcome(sent.result);
console.log("sent:", outcome, sentHash(sent));
if (outcome.status === "waiting") {
  console.log("share:", claimLink({ network: net.id, from, to, asset: token }));
}
