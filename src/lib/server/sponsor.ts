import "server-only";
import {
  Address,
  Asset,
  FeeBumpTransaction,
  Keypair,
  Memo,
  Operation,
  StrKey,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
import { NETWORK, SIMULATOR_DEPOSIT, SPONSOR, USDC, WALLET_WASM_HASH } from "../config";
import { getAccount } from "../horizon";

// The sponsor service (PRD §13): the only server key. It signs tx1 shapes,
// relays smart-wallet transfers into a G it sponsors, and fee-bumps inner
// transactions whose source is a G it sponsors. Everything else is refused.

export class Refusal extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

let kp: Keypair | null = null;
export function sponsorKeypair(): Keypair {
  if (kp) return kp;
  const s = process.env.SPONSOR_SECRET;
  if (!s) throw new Refusal("The sponsor isn't configured on this deployment.", 503);
  kp = Keypair.fromSecret(s);
  if (kp.publicKey() !== SPONSOR) throw new Refusal("SPONSOR_SECRET doesn't match src/lib/testnet.json.", 503);
  return kp;
}

export const server = () => new rpc.Server(NETWORK.rpcUrl);
const usdc = () => new Asset(USDC.code, USDC.issuer);

/** Refuse when the sponsor is close to empty (FR-3.4). */
const FLOOR_STROOPS = 200_000_000n; // 20 XLM
export async function assertSponsorFunded() {
  const s = await getAccount(SPONSOR);
  if (s.nativeStroops < FLOOR_STROOPS) throw new Refusal("Portaj's sponsor is low on testnet XLM. Try again later.", 503);
}

/** A G this sponsor created (its base reserve is ours). */
export async function assertSponsored(g: string) {
  if (!StrKey.isValidEd25519PublicKey(g)) throw new Refusal("Not a transit account address.");
  const a = await getAccount(g);
  if (!a.exists || a.sponsor !== SPONSOR) throw new Refusal("That account isn't a Portaj transit account.", 403);
  return a;
}

// ---------------------------------------------------------------------------
// tx1 · sponsored setup (§9.1)
// ---------------------------------------------------------------------------

export async function buildSetup(g: string): Promise<{ xdr: string | null; created: boolean }> {
  if (!StrKey.isValidEd25519PublicKey(g)) throw new Refusal("Not a valid G address.");
  const a = await getAccount(g);
  if (a.exists && a.usdc) return { xdr: null, created: false };
  if (a.exists && a.sponsor !== SPONSOR) throw new Refusal("That account already exists and isn't a Portaj transit account.", 403);
  await assertSponsorFunded();

  const sponsor = sponsorKeypair();
  const src = await server().getAccount(SPONSOR);
  const b = new TransactionBuilder(src, { fee: "1000", networkPassphrase: NETWORK.passphrase }).addOperation(
    Operation.beginSponsoringFutureReserves({ sponsoredId: g }),
  );
  if (!a.exists) b.addOperation(Operation.createAccount({ destination: g, startingBalance: "0" }));
  const tx = b
    .addOperation(Operation.changeTrust({ asset: usdc(), source: g }))
    .addOperation(Operation.endSponsoringFutureReserves({ source: g }))
    .setTimeout(300)
    .build();
  tx.sign(sponsor);
  return { xdr: tx.toXDR(), created: !a.exists };
}

/** Submit a tx1 the browser has co-signed. Our own signature pins its content. */
export async function submitSetup(envelope: string): Promise<{ hash: string; account: string }> {
  const tx = parse(envelope);
  if (tx instanceof FeeBumpTransaction || tx.source !== SPONSOR) throw new Refusal("Not a Portaj setup transaction.");
  const types = tx.operations.map((o) => o.type).join(",");
  if (!/^beginSponsoringFutureReserves,(createAccount,)?changeTrust,endSponsoringFutureReserves$/.test(types)) {
    throw new Refusal("Not a Portaj setup transaction.");
  }
  const account = (tx.operations[0] as Operation.BeginSponsoringFutureReserves).sponsoredId;
  return { hash: await send(tx), account };
}

// ---------------------------------------------------------------------------
// tx2 · relay a smart-wallet transfer (§9.2) and wallet deploys (FR-9.1)
// ---------------------------------------------------------------------------

export type RelayPurpose = "exit" | "naive";

/**
 * `{func, auth}`: a USDC SAC transfer(C → G). For "exit" G must be a Portaj
 * exit account; for "naive" (the before panel's memo-less attempt) it must be
 * the exchange simulator. No source-account auth, so nothing can spend as the
 * sponsor.
 */
export async function relayTransfer(funcB64: string, authB64: string[], purpose: RelayPurpose) {
  const func = decode(() => xdr.HostFunction.fromXDR(funcB64, "base64"));
  if (func.switch().name !== "hostFunctionTypeInvokeContract") throw new Refusal("Only token transfers are relayed.");
  const call = func.invokeContract();
  const contract = Address.fromScAddress(call.contractAddress()).toString();
  if (contract !== USDC.sac || call.functionName().toString() !== "transfer" || call.args().length !== 3) {
    throw new Refusal("Only USDC transfers are relayed.");
  }
  const [from, to] = call.args().map((v, i) => (i < 2 ? Address.fromScVal(v).toString() : ""));
  if (!from.startsWith("C")) throw new Refusal("The transfer must come from a smart wallet.");
  if (purpose === "exit") await assertSponsored(to);
  else if (to !== SIMULATOR_DEPOSIT) throw new Refusal("The before panel only sends to the exchange simulator.");

  const auth = decode(() => authB64.map((a) => xdr.SorobanAuthorizationEntry.fromXDR(a, "base64")));
  assertNoSourceAuth(auth);
  return { hash: await invokeAsSponsor(func, auth, 20_000_000n), from, to };
}

/** A passkey-kit wallet deployment (its carrier tx is built on a null account). */
export async function relayDeploy(envelope: string) {
  const tx = parse(envelope);
  if (tx instanceof FeeBumpTransaction || tx.operations.length !== 1 || tx.operations[0].type !== "invokeHostFunction") {
    throw new Refusal("Not a wallet deployment.");
  }
  const op = tx.operations[0] as Operation.InvokeHostFunction;
  const fn = op.func;
  if (fn.switch().name !== "hostFunctionTypeCreateContractV2") throw new Refusal("Not a wallet deployment.");
  const exec = fn.createContractV2().executable();
  if (exec.switch().name !== "contractExecutableWasm" || exec.wasmHash().toString("hex") !== WALLET_WASM_HASH) {
    throw new Refusal("Only the passkey-kit smart wallet can be deployed.");
  }
  assertNoSourceAuth(op.auth ?? []);
  return { hash: await invokeAsSponsor(fn, op.auth ?? [], 50_000_000n) };
}

function assertNoSourceAuth(auth: xdr.SorobanAuthorizationEntry[]) {
  if (auth.some((e) => e.credentials().switch().name === "sorobanCredentialsSourceAccount")) {
    throw new Refusal("Source-account authorization isn't accepted.");
  }
}

async function invokeAsSponsor(func: xdr.HostFunction, auth: xdr.SorobanAuthorizationEntry[], maxFee: bigint) {
  const sponsor = sponsorKeypair();
  const s = server();
  const raw = new TransactionBuilder(await s.getAccount(SPONSOR), { fee: "1000", networkPassphrase: NETWORK.passphrase })
    .addOperation(Operation.invokeHostFunction({ func, auth }))
    .setTimeout(120)
    .build();
  const sim = await s.simulateTransaction(raw);
  if (rpc.Api.isSimulationError(sim)) throw new Refusal(simError(sim.error));
  const tx = rpc.assembleTransaction(raw, sim).build();
  if (BigInt(tx.fee) > maxFee) throw new Refusal("That transaction would cost the sponsor too much.");
  tx.sign(sponsor);
  return send(tx);
}

// ---------------------------------------------------------------------------
// tx3 / tx4 · fee bump an exit account's own transaction (§9.3, §9.4)
// ---------------------------------------------------------------------------

export async function feeBump(envelope: string): Promise<{ hash: string; kind: "payment" | "return" }> {
  const inner = parse(envelope);
  if (inner instanceof FeeBumpTransaction) throw new Refusal("Send the inner transaction.");
  await assertSponsored(inner.source);
  if (inner.operations.length !== 1) throw new Refusal("One operation per transit transaction.");
  const op = inner.operations[0];
  if (op.source && op.source !== inner.source) throw new Refusal("The operation must come from the transit account.");

  let kind: "payment" | "return";
  if (op.type === "payment") {
    if (!op.asset.equals(usdc())) throw new Refusal("Only Circle USDC leaves a transit account.");
    kind = "payment";
  } else if (op.type === "invokeHostFunction") {
    const fn = op.func;
    if (fn.switch().name !== "hostFunctionTypeInvokeContract") throw new Refusal("Only USDC returns are fee-bumped.");
    const call = fn.invokeContract();
    const from = Address.fromScVal(call.args()[0]).toString();
    if (Address.fromScAddress(call.contractAddress()).toString() !== USDC.sac || call.functionName().toString() !== "transfer" || from !== inner.source) {
      throw new Refusal("Only USDC returns are fee-bumped.");
    }
    kind = "return";
  } else {
    throw new Refusal("That operation isn't part of a carry.");
  }
  if (BigInt(inner.fee) > 20_000_000n) throw new Refusal("That transaction would cost the sponsor too much.");

  const bump = TransactionBuilder.buildFeeBumpTransaction(sponsorKeypair(), "200", inner, NETWORK.passphrase);
  bump.sign(sponsorKeypair());
  return { hash: await send(bump), kind };
}

// ---------------------------------------------------------------------------
// Judge onboarding (FR-9.2) and the before panel (FR-7)
// ---------------------------------------------------------------------------

/** Send test USDC from the sponsor's stash to a new smart wallet. */
export async function grantTestUsdc(contractId: string, stroops: bigint) {
  if (!StrKey.isValidContract(contractId)) throw new Refusal("Test USDC goes to a smart wallet (C…) address.");
  const sponsor = sponsorKeypair();
  const s = server();
  const raw = new TransactionBuilder(await s.getAccount(SPONSOR), { fee: "1000", networkPassphrase: NETWORK.passphrase })
    .addOperation(
      Operation.invokeContractFunction({
        contract: USDC.sac,
        function: "transfer",
        args: [nativeToScVal(SPONSOR, { type: "address" }), nativeToScVal(contractId, { type: "address" }), nativeToScVal(stroops, { type: "i128" })],
      }),
    )
    .setTimeout(120)
    .build();
  const tx = await s.prepareTransaction(raw);
  tx.sign(sponsor);
  return send(tx);
}

/**
 * The naive path: the smart wallet's transfer to the exchange with the memo
 * attached. Simulated, then sent, so the screen shows the network's own
 * answers. No passkey signature is involved: the memo check runs before any
 * authorization is looked at, so nothing can move.
 */
export async function tryNaive(from: string, stroops: bigint, memo: { type: "id" | "text"; value: string }) {
  if (!StrKey.isValidContract(from)) throw new Refusal("The naive path starts from a smart wallet (C…).");
  const s = server();
  const raw = new TransactionBuilder(await s.getAccount(SPONSOR), {
    fee: "100000",
    networkPassphrase: NETWORK.passphrase,
    memo: memo.type === "id" ? Memo.id(memo.value) : Memo.text(memo.value),
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: USDC.sac,
        function: "transfer",
        args: [nativeToScVal(from, { type: "address" }), nativeToScVal(SIMULATOR_DEPOSIT, { type: "address" }), nativeToScVal(stroops, { type: "i128" })],
      }),
    )
    .setTimeout(60)
    .build();

  const sim = await s.simulateTransaction(raw);
  const simulate = rpc.Api.isSimulationError(sim) ? sim.error.split("\n")[0] : "Simulation passed";

  raw.sign(sponsorKeypair());
  const r = await s.sendTransaction(raw);
  const code = r.errorResult ? r.errorResult.result().switch().name : null;
  return { simulate, send: { status: r.status, code, xdrCode: r.errorResult ? r.errorResult.result().switch().value : null }, memo, hash: r.hash };
}

// ---------------------------------------------------------------------------

function decode<T>(fn: () => T): T {
  try {
    return fn();
  } catch {
    throw new Refusal("That isn't valid XDR.");
  }
}

function parse(envelope: string): Transaction | FeeBumpTransaction {
  try {
    return TransactionBuilder.fromXDR(envelope, NETWORK.passphrase);
  } catch {
    throw new Refusal("That isn't a transaction envelope.");
  }
}

function simError(e: string) {
  const first = e.split("\n")[0];
  if (/trustline|TrustlineMissing/i.test(e)) return "The receiving account has no USDC trustline.";
  if (/balance is not sufficient|BalanceError|insufficient/i.test(e)) return "The wallet doesn't hold that much USDC.";
  return `The network refused it in simulation: ${first.slice(0, 200)}`;
}

/** Send through RPC and wait for the ledger. Throws a Refusal with a plain reason on failure. */
export async function send(tx: Transaction | FeeBumpTransaction): Promise<string> {
  const s = server();
  const r = await s.sendTransaction(tx);
  if (r.status === "ERROR") throw new Refusal(explain(r.errorResult));
  if (r.status === "TRY_AGAIN_LATER") throw new Refusal("The network is busy. Try again in a few seconds.", 503);
  for (let i = 0; i < 40; i++) {
    await new Promise((res) => setTimeout(res, 1000));
    const g = await s.getTransaction(r.hash);
    if (g.status === "SUCCESS") return r.hash;
    if (g.status === "FAILED") throw new Refusal(explain(g.resultXdr), 422);
  }
  throw new Refusal(`Still waiting for ${r.hash.slice(0, 8)}… to land. Check the explorer.`, 504);
}

const OP_TEXT: Record<string, string> = {
  paymentNoTrust: "The exchange address has no USDC trustline, so it can't receive USDC.",
  paymentNoDestination: "The exchange address doesn't exist on this network.",
  paymentUnderfunded: "The transit account doesn't hold enough USDC.",
  paymentNotAuthorized: "The exchange address isn't authorized to hold USDC.",
  paymentLineFull: "The exchange's USDC trustline is full.",
  invokeHostFunctionTrapped: "The contract call failed.",
  invokeHostFunctionResourceLimitExceeded: "The contract call ran out of resources.",
};

export function explain(result: xdr.TransactionResult | undefined): string {
  if (!result) return "The network refused the transaction.";
  let r = result.result();
  if (r.switch().name === "txFeeBumpInnerFailed" || r.switch().name === "txFeeBumpInnerSuccess") {
    r = r.innerResultPair().result().result() as unknown as typeof r;
  }
  const name = r.switch().name;
  if (name === "txFailed") {
    const ops = r.results();
    for (const o of ops) {
      const tr = o.tr?.();
      const opName = tr ? (tr.value() as { switch(): { name: string } }).switch().name : o.switch().name;
      if (!/Success$/.test(opName)) return OP_TEXT[opName] ?? `The network refused it: ${opName}.`;
    }
  }
  if (name === "txBadSeq") return "The transit account's sequence moved. Try again.";
  if (name === "txTooLate") return "The transaction expired before it reached the network. Try again.";
  if (name === "txInsufficientFee") return "The network fee went up. Try again.";
  return `The network refused it: ${name}.`;
}
