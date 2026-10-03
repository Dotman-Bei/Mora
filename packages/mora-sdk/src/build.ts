import type { contract } from "@stellar/stellar-sdk";
import { Client, Errors, type ClaimResult, type DoorResult, type Outcome, type Parcel } from "./generated/mora-client";
import type { MoraNetwork } from "./network";
import { RpcPool } from "./rpc";

type AT<T> = contract.AssembledTransaction<T>;
export type SignTransaction = contract.SignTransaction;

export interface Caller {
  /** The account that pays the fee and signs. */
  publicKey?: string;
  signTransaction?: SignTransaction;
}

function client(net: MoraNetwork, url: string, caller: Caller = {}): Client {
  return new Client({
    contractId: net.moraContractId,
    networkPassphrase: net.passphrase,
    rpcUrl: url,
    allowHttp: url.startsWith("http://"),
    publicKey: caller.publicKey,
    signTransaction: caller.signTransaction,
    errorTypes: Errors,
  });
}

/** Run a contract call through the RPC pool so a dead provider falls back (PRD §10.3). */
function viaPool<T>(net: MoraNetwork, caller: Caller, f: (c: Client) => Promise<AT<T>>): Promise<AT<T>> {
  return RpcPool.for(net).call((_s, url) => f(client(net, url, caller)));
}

// Every builder returns a simulated transaction: `tx.result` is the expected
// outcome, `tx.simulation` carries fees. Nothing is signed here.

export function buildSend(
  net: MoraNetwork,
  caller: Caller,
  a: { from: string; token: string; to: string; amount: bigint; refundAfter: number },
): Promise<AT<Outcome>> {
  return viaPool(net, caller, (c) =>
    c.send({ from: a.from, token: a.token, to: a.to, amount: a.amount, refund_after: a.refundAfter }),
  );
}

export function buildSendMany(
  net: MoraNetwork,
  caller: Caller,
  a: { from: string; token: string; payees: Array<{ to: string; amount: bigint }>; refundAfter: number },
): Promise<AT<Outcome[]>> {
  if (a.payees.length > net.maxItems) {
    throw new Error(`At most ${net.maxItems} recipients per signature on ${net.id}`);
  }
  return viaPool(net, caller, (c) =>
    c.send_many({ from: a.from, token: a.token, payees: a.payees, refund_after: a.refundAfter }),
  );
}

/**
 * `restore: true` lets the SDK restore archived storage first, which asks the
 * wallet for an extra signature. Callers pass it only after telling the user
 * (PRD §15); by default an archived parcel shows up via needsRestore().
 */
export interface BuildOptions {
  restore?: boolean;
}

export function buildClaim(
  net: MoraNetwork,
  caller: Caller,
  a: { from: string; to: string; token: string },
  o: BuildOptions = {},
): Promise<AT<ClaimResult>> {
  return viaPool(net, caller, (c) => c.claim(a, { restore: o.restore ?? false }));
}

export function buildClaimMany(
  net: MoraNetwork,
  caller: Caller,
  a: { to: string; items: Array<{ from: string; token: string }> },
): Promise<AT<ClaimResult[]>> {
  return viaPool(net, caller, (c) => c.claim_many(a, { restore: false }));
}

export function buildDeliver(
  net: MoraNetwork,
  caller: Caller,
  a: { from: string; to: string; token: string },
  o: BuildOptions = {},
): Promise<AT<DoorResult>> {
  return viaPool(net, caller, (c) => c.deliver(a, { restore: o.restore ?? false }));
}

export function buildRefund(
  net: MoraNetwork,
  caller: Caller,
  a: { from: string; to: string; token: string },
  o: BuildOptions = {},
): Promise<AT<DoorResult>> {
  return viaPool(net, caller, (c) => c.refund(a, { restore: o.restore ?? false }));
}

/**
 * Read a waiting payment straight from the contract. `null` means nothing is
 * waiting under this key. Throws NetworkUnreadableError if the network can't
 * be read: callers must show UNKNOWN, never "nothing here" (PRD §6.3).
 */
export async function getParcel(net: MoraNetwork, a: { from: string; to: string; token: string }): Promise<Parcel | null> {
  const tx = await viaPool(net, {}, (c) => c.parcel(a));
  const r = tx.result;
  return r ?? null;
}

export async function getConfig(net: MoraNetwork): Promise<{ grace_ledgers: number; max_items: number }> {
  const tx = await viaPool(net, {}, (c) => c.config());
  return tx.result;
}

/** Network fee from simulation, in stroops: inclusion fee plus resource fee. */
export function estimatedFee(tx: AT<unknown>): bigint {
  const sim = tx.simulation as { minResourceFee?: string } | undefined;
  const resource = BigInt(sim?.minResourceFee ?? "0");
  const inclusion = BigInt(tx.built?.fee ?? "100");
  return resource > inclusion ? inclusion + resource : inclusion;
}

/** Did simulation fail? Returns the Mora contract error name when there is one. */
export function simulationError(tx: AT<unknown>): { name?: string; message: string } | null {
  const sim = tx.simulation as { error?: string } | undefined;
  if (!sim?.error) return null;
  const m = /Error\(Contract, #(\d+)\)/.exec(sim.error);
  const code = m ? Number(m[1]) : undefined;
  const name = code !== undefined ? (Errors as Record<number, { message: string }>)[code]?.message : undefined;
  return { name, message: sim.error.split("\n")[0] ?? sim.error };
}

/** Archived storage must be restored first; the SDK does it in a separate signature (PRD §15). */
export function needsRestore(tx: AT<unknown>): boolean {
  const sim = tx.simulation as { restorePreamble?: unknown } | undefined;
  return !!sim?.restorePreamble;
}

/** The hash of a transaction sent with signAndSend(). */
export function sentHash(sent: contract.SentTransaction<unknown>): string | undefined {
  return sent.sendTransactionResponse?.hash;
}
