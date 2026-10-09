"use client";

import { prfSalt } from "./prf";

// Every WebAuthn ceremony on Portaj asks for the PRF extension with the fixed
// salt (§10.1). Wrapping navigator.credentials once means passkey-kit's own
// ceremonies (wallet creation, signing the transfer in) also return PRF output,
// so a transfer-in signature and the exit-account key come from one prompt
// (§10.3).

export interface PrfCapture {
  credentialId: string;
  /** prf.results.first, or null when the authenticator gave none. */
  first: ArrayBuffer | null;
  /** prf.enabled from a registration, when reported. */
  enabled?: boolean;
  at: number;
}

let last: PrfCapture | null = null;
const listeners = new Set<(c: PrfCapture) => void>();

export function lastPrf(): PrfCapture | null {
  return last;
}

export function onPrf(fn: (c: PrfCapture) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

type PrfExt = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };

function capture(cred: Credential | null) {
  if (!cred || !(cred instanceof PublicKeyCredential)) return;
  const ext = cred.getClientExtensionResults() as PrfExt;
  last = { credentialId: cred.id, first: ext.prf?.results?.first ?? null, enabled: ext.prf?.enabled, at: Date.now() };
  listeners.forEach((l) => l(last!));
}

let installed = false;

export function installPrfCapture() {
  if (installed || typeof navigator === "undefined" || !navigator.credentials) return;
  installed = true;
  const c = navigator.credentials;
  const get = c.get.bind(c);
  const create = c.create.bind(c);

  c.get = async (opts?: CredentialRequestOptions) => {
    if (opts?.publicKey) {
      const first = await prfSalt();
      opts = { ...opts, publicKey: { ...opts.publicKey, extensions: { ...opts.publicKey.extensions, prf: { eval: { first } } } as AuthenticationExtensionsClientInputs } };
    }
    const cred = await get(opts);
    capture(cred);
    return cred;
  };

  c.create = async (opts?: CredentialCreationOptions) => {
    if (opts?.publicKey) {
      const first = await prfSalt();
      opts = { ...opts, publicKey: { ...opts.publicKey, extensions: { ...opts.publicKey.extensions, prf: { eval: { first } } } as AuthenticationExtensionsClientInputs } };
    }
    const cred = await create(opts);
    capture(cred);
    return cred;
  };
}

// --- Plain ceremonies for Mode B and recovery (no smart wallet involved) ----

export const b64url = {
  encode(b: ArrayBuffer | Uint8Array): string {
    const bytes = b instanceof Uint8Array ? b : new Uint8Array(b);
    let s = "";
    bytes.forEach((x) => (s += String.fromCharCode(x)));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(s: string): Uint8Array {
    const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
    return Uint8Array.from(atob(pad), (ch) => ch.charCodeAt(0));
  },
};

const challenge = () => crypto.getRandomValues(new Uint8Array(32));

/** Authenticate with a passkey on this site and return its PRF output. */
export async function prfGet(credentialId?: string): Promise<PrfCapture> {
  installPrfCapture();
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: challenge(),
      allowCredentials: credentialId ? [{ type: "public-key", id: b64url.decode(credentialId) as BufferSource }] : [],
      userVerification: "preferred",
      timeout: 120_000,
    },
  });
  if (!cred) throw new Error("No passkey was selected.");
  return last!;
}

/** Create a Portaj passkey (no wallet) for Mode B; evaluates PRF straight after if create didn't (§10.1). */
export async function prfCreate(userName: string): Promise<PrfCapture> {
  installPrfCapture();
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: challenge(),
      rp: { name: "Portaj" },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: userName, displayName: userName },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
      timeout: 120_000,
    },
  });
  if (!cred) throw new Error("The passkey wasn't created.");
  const made = last!;
  // enabled === false: this authenticator has no PRF, so a second prompt can't help.
  if (made.first || made.enabled === false) return made;
  return prfGet(made.credentialId);
}
