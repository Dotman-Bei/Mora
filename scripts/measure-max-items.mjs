// F6 (PRD §19 M0): find how many payees one send_many can carry on this
// network, worst case (every payee parks, so every payee creates a parcel).
// Usage: node scripts/measure-max-items.mjs <moraId> <tokenId> <sourceG>
import { Keypair, Contract, TransactionBuilder, BASE_FEE, nativeToScVal, Address, rpc, xdr } from "@stellar/stellar-sdk";

const [moraId, tokenId, source] = process.argv.slice(2);
const server = new rpc.Server(process.env.RPC_URL ?? "https://soroban-testnet.stellar.org");
const passphrase = "Test SDF Network ; September 2015";
const mora = new Contract(moraId);
const latest = await server.getLatestLedger();
const refundAfter = latest.sequence + 120; // ~10 minutes
const account = await server.getAccount(source);

function payees(n) {
  return xdr.ScVal.scvVec(
    Array.from({ length: n }, () =>
      nativeToScVal(
        { amount: nativeToScVal(10_000n, { type: "i128" }), to: Address.fromString(Keypair.random().publicKey()) },
        { type: { amount: ["symbol", null], to: ["symbol", null] } },
      ),
    ),
  );
}

async function sim(n) {
  const op = mora.call("send_many", Address.fromString(source).toScVal(), Address.fromString(tokenId).toScVal(), payees(n), nativeToScVal(refundAfter, { type: "u32" }));
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: passphrase }).addOperation(op).setTimeout(60).build();
  const r = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(r)) return { ok: false, err: r.error.split("\n")[0].slice(0, 160) };
  // stellar-sdk 17: XDR structs expose readonly fields, not accessors.
  const res = r.transactionData.build().resources;
  return {
    ok: true,
    fee: Number(r.minResourceFee),
    instr: res.instructions,
    read: res.diskReadBytes,
    write: res.writeBytes,
    ro: res.footprint.readOnly.length,
    rw: res.footprint.readWrite.length,
  };
}

let lo = 1, hi = 400, best = null;
for (const n of [1, 5, 10, 20]) console.log(n, JSON.stringify(await sim(n)));
while (lo <= hi) {
  const mid = (lo + hi) >> 1;
  const r = await sim(mid);
  console.log(mid, JSON.stringify(r));
  if (r.ok) { best = { n: mid, ...r }; lo = mid + 1; } else hi = mid - 1;
}
console.log("MAX_OK", JSON.stringify(best));
