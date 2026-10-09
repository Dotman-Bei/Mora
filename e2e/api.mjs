// Live check of the sponsor API with a plain keypair standing in for the
// passkey-derived transit account. Run from the repo root.
import { readFileSync } from "node:fs";
import { Account, Asset, Keypair, Memo, Networks, Operation, TransactionBuilder, Horizon, StrKey } from "@stellar/stellar-sdk";

const BASE = "http://localhost:3000";
const cfg = JSON.parse(readFileSync("src/lib/testnet.json", "utf8"));
const env = readFileSync(".env.local", "utf8");
const sponsor = Keypair.fromSecret(env.match(/^SPONSOR_SECRET=(.+)$/m)[1].trim());
const USDC = new Asset("USDC", cfg.usdcIssuer);
const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");
const post = async (p, b) => {
  const r = await fetch(BASE + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
  const j = await r.json();
  console.log(p, r.status, JSON.stringify(j).slice(0, 400));
  return j;
};

const g = Keypair.random();
console.log("transit account", g.publicKey());

// tx1
const s = await post("/api/setup", { account: g.publicKey() });
const tx1 = TransactionBuilder.fromXDR(s.xdr, Networks.TESTNET);
tx1.sign(g);
await post("/api/submit", { xdr: tx1.toXDR(), credentialId: "check-" + Date.now() });
let a = await horizon.loadAccount(g.publicKey());
console.log("G sponsor:", a.sponsor, "native:", a.balances.find((b) => b.asset_type === "native")?.balance, "usdc:", a.balances.find((b) => b.asset_code === "USDC"));

// stand-in for tx2: sponsor pays 1 USDC into G (classic, outside the API)
{
  const src = await horizon.loadAccount(sponsor.publicKey());
  const t = new TransactionBuilder(src, { fee: "1000", networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination: g.publicKey(), asset: USDC, amount: "1.5" }))
    .setTimeout(60)
    .build();
  t.sign(sponsor);
  await horizon.submitTransaction(t);
}

// tx3: G → simulator, memo id
a = await horizon.loadAccount(g.publicKey());
const tx3 = new TransactionBuilder(new Account(g.publicKey(), a.sequence), { fee: "100", networkPassphrase: Networks.TESTNET, memo: Memo.id("4417") })
  .addOperation(Operation.payment({ destination: cfg.simulatorDeposit, asset: USDC, amount: "1" }))
  .setTimeout(180)
  .build();
tx3.sign(g);
await post("/api/feebump", { xdr: tx3.toXDR() });

// tx4-like return to a G (the sponsor here), no memo
a = await horizon.loadAccount(g.publicKey());
const tx4 = new TransactionBuilder(new Account(g.publicKey(), a.sequence), { fee: "100", networkPassphrase: Networks.TESTNET })
  .addOperation(Operation.payment({ destination: sponsor.publicKey(), asset: USDC, amount: "0.5" }))
  .setTimeout(180)
  .build();
tx4.sign(g);
await post("/api/feebump", { xdr: tx4.toXDR() });

a = await horizon.loadAccount(g.publicKey());
console.log("after: native", a.balances.find((b) => b.asset_type === "native")?.balance, "usdc", a.balances.find((b) => b.asset_code === "USDC")?.balance);

// refusals
const rogue = Keypair.random();
const bad = new TransactionBuilder(new Account(rogue.publicKey(), "1"), { fee: "100", networkPassphrase: Networks.TESTNET })
  .addOperation(Operation.payment({ destination: cfg.simulatorDeposit, asset: USDC, amount: "1" }))
  .setTimeout(180)
  .build();
bad.sign(rogue);
await post("/api/feebump", { xdr: bad.toXDR() });
await post("/api/relay", { func: "AAAA", auth: [] });

// before panel: memo on a contract transfer
await post("/api/before", { from: StrKey.encodeContract(Buffer.alloc(32, 9)), amount: "20", memoType: "id", memo: "4417" });
