/** GABC…WXYZ */
export function short(address: string, n = 4): string {
  return address.length > n * 2 + 1 ? `${address.slice(0, n)}…${address.slice(-n)}` : address;
}

/** Plain words for WebAuthn and passkey-kit failures. */
export function passkeyError(e: unknown): string {
  const name = e instanceof Error ? e.name : "";
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
  if (name === "NotAllowedError" || /not allowed|cancel|timed out|abort/i.test(msg)) return "The passkey prompt was closed. Nothing was sent.";
  if (name === "InvalidStateError") return "This device already has that passkey.";
  if (name === "NotSupportedError" || /not supported/i.test(msg)) return "This browser can't use passkeys here.";
  if (code === "WALLET_NOT_FOUND" || /resolve a wallet/i.test(msg)) return "No Portaj smart wallet found for that passkey. Create one under Wallet, or use Another wallet on Carry.";
  return msg || "Something went wrong with the passkey.";
}
