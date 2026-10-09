// Testnet setup for Portaj (PRD §12, §19). Idempotent: re-running reuses the
// keys in .env.local and only does what is missing.
//
//   1. Sponsor account: funded by friendbot, USDC trustline, a USDC stash bought
//      on the testnet DEX (strict-send path payment) for judge onboarding.
//   2. Exchange simulator deposit account: USDC trustline and the SEP-29 data
//      entry config.memo_required = 1.
//   3. Writes the public addresses to src/lib/testnet.json and the secrets to
//      .env.local (never committed).
//
// Usage: node scripts/setup-testnet.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { Asset, Horizon, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

const HORIZON = "https://horizon-testnet.stellar.org";
const PASSPHRASE = Networks.TESTNET;
const USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");
const STASH_TARGET = 3000; // USDC the sponsor should hold for "Get test USDC"
const horizon = new Horizon.Server(HORIZON);

const ENV_FILE = ".env.local";
const env = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
const read = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();

const sponsor = read("SPONSOR_SECRET") ? Keypair.fromSecret(read("SPONSOR_SECRET")) : Keypair.random();
const deposit = read("SIMULATOR_SECRET") ? Keypair.fromSecret(read("SIMULATOR_SECRET")) : Keypair.random();

async function load(pk) {
  try {
    return await horizon.loadAccount(pk);
  } catch (e) {
    if (e?.response?.status === 404) return null;
    throw e;
  }
}

async function ensureFunded(kp, label) {
  if (await load(kp.publicKey())) return;
  const r = await fetch(`https://friendbot.stellar.org/?addr=${kp.publicKey()}`);
  if (!r.ok) throw new Error(`friendbot failed for ${label}: ${r.status}`);
  console.log(`funded ${label} ${kp.publicKey()}`);
}

async function submit(kp, ops) {
  const acct = await horizon.loadAccount(kp.publicKey());
  const b = new TransactionBuilder(acct, { fee: "1000", networkPassphrase: PASSPHRASE });
  ops.forEach((op) => b.addOperation(op));
  const tx = b.setTimeout(60).build();
  tx.sign(kp);
  const r = await horizon.submitTransaction(tx);
  return r.hash;
}

const usdcBalance = (acct) => acct?.balances.find((b) => b.asset_code === "USDC" && b.asset_issuer === USDC.getIssuer());

await ensureFunded(sponsor, "sponsor");
await ensureFunded(deposit, "simulator deposit");

// Sponsor: trustline, then top the stash up from the DEX.
let s = await load(sponsor.publicKey());
if (!usdcBalance(s)) {
  await submit(sponsor, [Operation.changeTrust({ asset: USDC })]);
  console.log("sponsor: USDC trustline");
  s = await load(sponsor.publicKey());
}
const held = Number(usdcBalance(s).balance);
if (held < STASH_TARGET) {
  const xlm = Math.min(5000, Math.ceil((STASH_TARGET - held) * 1.2));
  const hash = await submit(sponsor, [
    Operation.pathPaymentStrictSend({
      sendAsset: Asset.native(),
      sendAmount: String(xlm),
      destination: sponsor.publicKey(),
      destAsset: USDC,
      destMin: "1",
      path: [],
    }),
  ]);
  s = await load(sponsor.publicKey());
  console.log(`sponsor: swapped ${xlm} XLM, now holds ${usdcBalance(s).balance} USDC (${hash})`);
}

// Simulator deposit account: trustline + SEP-29 memo_required.
let d = await load(deposit.publicKey());
const ops = [];
if (!usdcBalance(d)) ops.push(Operation.changeTrust({ asset: USDC }));
if (d.data_attr?.["config.memo_required"] !== Buffer.from("1").toString("base64")) {
  ops.push(Operation.manageData({ name: "config.memo_required", value: "1" }));
}
if (ops.length) {
  await submit(deposit, ops);
  console.log("simulator: trustline and config.memo_required = 1");
}

const out = {
  network: "testnet",
  sponsor: sponsor.publicKey(),
  simulatorDeposit: deposit.publicKey(),
  usdcIssuer: USDC.getIssuer(),
  usdcSac: USDC.contractId(PASSPHRASE),
};
writeFileSync("src/lib/testnet.json", JSON.stringify(out, null, 2) + "\n");

const kept = env
  .split(/\r?\n/)
  .filter((l) => l && !/^(SPONSOR_SECRET|SIMULATOR_SECRET|MORA_FAUCET_SECRET)=/.test(l));
kept.push(`SPONSOR_SECRET=${sponsor.secret()}`, `SIMULATOR_SECRET=${deposit.secret()}`);
writeFileSync(ENV_FILE, kept.join("\n") + "\n");

console.log(JSON.stringify(out, null, 2));
