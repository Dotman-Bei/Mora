// The PRF salt (PRD §10.1), kept free of the Stellar SDK: webauthn.ts loads on
// every page to capture PRF results, and importing it must not pull the SDK
// into the landing page.

/** Fixed per network family; never per transaction (§10.1). */
export const PRF_LABEL = "portaj:stellar:g-account:v1";

let saltCache: Promise<Uint8Array> | null = null;
export function prfSalt(): Promise<Uint8Array> {
  saltCache ??= crypto.subtle.digest("SHA-256", new TextEncoder().encode(PRF_LABEL)).then((b) => new Uint8Array(b));
  return saltCache;
}
