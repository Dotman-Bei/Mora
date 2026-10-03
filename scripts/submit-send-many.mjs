// F6 check: submit a real worst-case send_many of N payees on testnet.
// Secret comes from MORA_SECRET in the environment only (PRD §22.5).
import { Keypair, Contract, TransactionBuilder, BASE_FEE, nativeToScVal, Address, rpc, xdr } from "@stellar/stellar-sdk";
const [moraId, tokenId, nStr] = process.argv.slice(2);
const n = Number(nStr);
const kp = Keypair.fromSecret(process.env.MORA_SECRET);
const server = new rpc.Server("https://soroban-testnet.stellar.org");
const passphrase = "Test SDF Network ; September 2015";
const latest = await server.getLatestLedger();
const payees = xdr.ScVal.scvVec(Array.from({ length: n }, () =>
  nativeToScVal({ amount: nativeToScVal(10_000n, { type: "i128" }), to: Address.fromString(process.env.READY ?? Keypair.random().publicKey()) },
    { type: { amount: ["symbol", null], to: ["symbol", null] } })));
const op = new Contract(moraId).call("send_many", Address.fromString(kp.publicKey()).toScVal(), Address.fromString(tokenId).toScVal(), payees, nativeToScVal(latest.sequence + 120, { type: "u32" }));
const acct = await server.getAccount(kp.publicKey());
let tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: passphrase }).addOperation(op).setTimeout(120).build();
tx = await server.prepareTransaction(tx);
tx.sign(kp);
const sent = await server.sendTransaction(tx);
console.log("send", sent.status, sent.hash, sent.errorResult ? JSON.stringify(sent.errorResult.toXdrObject?.() ?? sent.errorResult, (k, v) => typeof v === "bigint" ? v.toString() : v).slice(0, 400) : "");
if (sent.status !== "PENDING") process.exit(1);
const res = await server.pollTransaction(sent.hash, { attempts: 30 });
console.log("final", res.status, "fee", res.feeCharged ?? "", "ledger", res.ledger);
