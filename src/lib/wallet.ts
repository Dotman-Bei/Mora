"use client";

import type { PasskeyKit } from "passkey-kit";
import { NETWORK, USDC, WALLET_WASM_HASH } from "./config";
import { installPrfCapture } from "./webauthn";
import { api } from "./api";
import type { WalletRef } from "./store";

export type { WalletRef };

// Mode A: the in-app passkey-kit smart wallet (PRD §5, FR-4.1, FR-9.1).
// passkey-kit is loaded on demand so the landing page never pays for it.

let kitPromise: Promise<PasskeyKit> | null = null;

export function getKit(): Promise<PasskeyKit> {
  installPrfCapture();
  kitPromise ??= (async () => {
    const [{ PasskeyKit }, { IndexedDBStorage }] = await Promise.all([import("passkey-kit"), import("passkey-kit/storage")]);
    return new PasskeyKit({
      rpcUrl: NETWORK.rpcUrl,
      networkPassphrase: NETWORK.passphrase,
      walletWasmHash: WALLET_WASM_HASH,
      storage: new IndexedDBStorage(),
      timeoutInSeconds: 60,
    });
  })();
  return kitPromise;
}

/**
 * Register a passkey, deploy its smart wallet (fee paid by the Portaj sponsor
 * through the `{func, auth}` path), and leave the kit connected.
 */
export async function createWallet(userName: string): Promise<WalletRef & { hash: string }> {
  const kit = await getKit();
  const created = await kit.createWallet("Portaj", userName);
  const { hash } = await api.deploy(created.signedTx);
  await kit.confirmWalletCreation(created, hash);
  await attach(kit, { contractId: created.contractId, keyId: created.keyIdBase64 });
  return { contractId: created.contractId, keyId: created.keyIdBase64, hash };
}

/**
 * Point the kit at a wallet this browser created and verified earlier, without
 * a separate connect ceremony: the next signature is the proof of possession
 * the contract checks on chain. Saves one prompt per exit (§10.3).
 */
export async function attach(kit: PasskeyKit, ref: WalletRef) {
  const { PasskeyClient } = await import("passkey-kit");
  kit.keyId = ref.keyId;
  kit.wallet = new PasskeyClient({ contractId: ref.contractId, rpcUrl: NETWORK.rpcUrl, networkPassphrase: NETWORK.passphrase });
}

/** Sign in with an existing wallet passkey (discoverable, or a known keyId). */
export async function connectWallet(keyId?: string): Promise<WalletRef> {
  const kit = await getKit();
  const { MercuryIndexer, SignerKey } = await import("passkey-kit");
  // A passkey made in another browser: find its wallet through the public
  // passkey indexer. The kit verifies every candidate on chain.
  const indexer = MercuryIndexer.forNetwork({}, NETWORK.passphrase);
  const r = await kit.connectWallet({
    ...(keyId ? { keyId } : {}),
    ...(indexer ? { getWalletCandidates: (id: string) => indexer.findWallets(SignerKey.Secp256r1(id)) } : {}),
  });
  return { contractId: r.contractId, keyId: r.keyIdBase64 };
}

/** USDC held by a C-address, read through the SAC (simulation only). */
export async function contractUsdcBalance(contractId: string): Promise<bigint> {
  const { SACClient } = await import("passkey-kit");
  const sac = new SACClient({ rpcUrl: NETWORK.rpcUrl, networkPassphrase: NETWORK.passphrase }).getSACClient(USDC.sac);
  const at = await sac.balance({ id: contractId });
  return BigInt(at.result as bigint | number | string);
}

/**
 * tx2's payload (§9.2): SEP-41 transfer(C → to, amount), with the wallet's auth
 * entry signed by the passkey. Returns the `{func, auth}` pair for the sponsor
 * to relay. The passkey prompt happens here.
 */
export async function signTransfer(ref: WalletRef, to: string, stroops: bigint): Promise<{ func: string; auth: string[] }> {
  const kit = await getKit();
  if (kit.wallet?.options.contractId !== ref.contractId || kit.keyId !== ref.keyId) await attach(kit, ref);
  const { SACClient } = await import("passkey-kit");
  const sac = new SACClient({ rpcUrl: NETWORK.rpcUrl, networkPassphrase: NETWORK.passphrase }).getSACClient(USDC.sac);
  const at = await sac.transfer({ from: ref.contractId, to, amount: stroops });
  await kit.sign(at);
  const op = at.built!.operations[0] as unknown as { func: { toXDR(f: "base64"): string }; auth?: { toXDR(f: "base64"): string }[] };
  return { func: op.func.toXDR("base64"), auth: (op.auth ?? []).map((a) => a.toXDR("base64")) };
}
