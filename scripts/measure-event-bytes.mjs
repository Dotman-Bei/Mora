// F6: contract-event bytes per payee for send_many (network cap:
// tx_max_contract_events_size_bytes). Simulation doesn't enforce the cap, so
// we read event sizes from it and compute the limit ourselves.
import { Keypair, Contract, TransactionBuilder, BASE_FEE, nativeToScVal, Address, rpc, xdr } from "@stellar/stellar-sdk";
const [moraId, tokenId, source, readyAddr] = process.argv.slice(2);
const server = new rpc.Server("https://soroban-testnet.stellar.org");
const passphrase = "Test SDF Network ; September 2015";
const latest = await server.getLatestLedger();
const acct = await server.getAccount(source);
async function eventBytes(n, ready) {
  const payees = xdr.ScVal.scvVec(Array.from({ length: n }, () =>
    nativeToScVal({ amount: nativeToScVal(10_000n, { type: "i128" }), to: Address.fromString(ready ? readyAddr : Keypair.random().publicKey()) },
      { type: { amount: ["symbol", null], to: ["symbol", null] } })));
  const op = new Contract(moraId).call("send_many", Address.fromString(source).toScVal(), Address.fromString(tokenId).toScVal(), payees, nativeToScVal(latest.sequence + 120, { type: "u32" }));
  const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: passphrase }).addOperation(op).setTimeout(60).build();
  const r = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(r)) return r.error.slice(0, 100);
  const contractEvents = r.events.filter((d) => d.event.type.name ? d.event.type.name === "contract" : String(d.event.type).includes("ontract"));
  return contractEvents.reduce((s, d) => s + d.event.toXDR().length, 0);
}
for (const ready of [false, true]) {
  const a = await eventBytes(1, ready), b = await eventBytes(11, ready);
  const per = (b - a) / 10, base = a - per;
  console.log(ready ? "delivered" : "parked", { base, per, maxN: Math.floor((16384 - base) / per) });
}
