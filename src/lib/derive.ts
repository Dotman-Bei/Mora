import { Keypair } from "@stellar/stellar-sdk";
import { Buffer } from "buffer";

// PRD §10: passkey PRF output → HKDF-SHA256 → ed25519 seed → the user's G.
// Runs in the browser; the seed is never stored or sent anywhere (FR-2.2).

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Fixed per network family; never per transaction (§10.1). */
export const PRF_LABEL = "portaj:stellar:g-account:v1";

let saltCache: Promise<Uint8Array> | null = null;
export function prfSalt(): Promise<Uint8Array> {
  saltCache ??= crypto.subtle.digest("SHA-256", enc.encode(PRF_LABEL)).then((b) => new Uint8Array(b));
  return saltCache;
}

/** seed = HKDF-SHA256(ikm = prf.first, salt = "portaj", info = "stellar-ed25519-seed:" + sha256(passphrase)) */
export async function deriveExitSeed(prfFirst: BufferSource, networkPassphrase: string): Promise<Uint8Array> {
  const passHash = hex(await crypto.subtle.digest("SHA-256", enc.encode(networkPassphrase)));
  const ikm = await crypto.subtle.importKey("raw", prfFirst, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("portaj"), info: enc.encode(`stellar-ed25519-seed:${passHash}`) },
    ikm,
    256,
  );
  return new Uint8Array(bits);
}

export async function deriveExitKeypair(prfFirst: BufferSource, networkPassphrase: string): Promise<Keypair> {
  const seed = await deriveExitSeed(prfFirst, networkPassphrase);
  return Keypair.fromRawEd25519Seed(Buffer.from(seed));
}
