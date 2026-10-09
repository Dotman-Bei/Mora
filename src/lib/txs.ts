import { Account, Asset, Keypair, Memo, Operation, TransactionBuilder, nativeToScVal, rpc } from "@stellar/stellar-sdk";
import { formatUsdc } from "./amount";
import { NETWORK, USDC } from "./config";
import type { Destination, MemoInput } from "./destination";

// Inner transactions the exit account signs in the browser. The sponsor wraps
// each in a fee bump, so the exit account never needs XLM (§9.3, §9.4).

export const usdcAsset = () => new Asset(USDC.code, USDC.issuer);

function memoOf(dest: Destination, memo: MemoInput) {
  if (dest.kind === "M" || memo.type === "none") return Memo.none();
  return memo.type === "id" ? Memo.id(memo.value) : Memo.text(memo.value);
}

/** tx3 · Payment out: G → exchange, classic payment with the memo. */
export function buildPaymentOut(g: Keypair, sequence: string, dest: Destination, memo: MemoInput, stroops: bigint): string {
  const tx = new TransactionBuilder(new Account(g.publicKey(), sequence), {
    fee: "100",
    networkPassphrase: NETWORK.passphrase,
    memo: memoOf(dest, memo),
  })
    .addOperation(Operation.payment({ destination: dest.address, asset: usdcAsset(), amount: formatUsdc(stroops) }))
    .setTimeout(180)
    .build();
  tx.sign(g);
  return tx.toXDR();
}

/**
 * tx4 · Return to wallet. To a C-address: SAC transfer(G → C) with source
 * account auth. To a G-address: a plain USDC payment, no memo.
 */
export async function buildReturn(g: Keypair, sequence: string, to: string, stroops: bigint): Promise<string> {
  const builder = new TransactionBuilder(new Account(g.publicKey(), sequence), { fee: "100", networkPassphrase: NETWORK.passphrase });
  if (to.startsWith("G")) {
    const tx = builder.addOperation(Operation.payment({ destination: to, asset: usdcAsset(), amount: formatUsdc(stroops) })).setTimeout(180).build();
    tx.sign(g);
    return tx.toXDR();
  }
  const raw = builder
    .addOperation(
      Operation.invokeContractFunction({
        contract: USDC.sac,
        function: "transfer",
        args: [nativeToScVal(g.publicKey(), { type: "address" }), nativeToScVal(to, { type: "address" }), nativeToScVal(stroops, { type: "i128" })],
      }),
    )
    .setTimeout(180)
    .build();
  const tx = await new rpc.Server(NETWORK.rpcUrl).prepareTransaction(raw);
  tx.sign(g);
  return tx.toXDR();
}
