import { StrKey } from "@stellar/stellar-sdk";

export type AddressKind = "account" | "contract" | "muxed" | "invalid";

/** G… is an account, C… a contract (smart wallet or app), M… a muxed account. */
export function addressKind(input: string): AddressKind {
  const a = input.trim();
  if (StrKey.isValidEd25519PublicKey(a)) return "account";
  if (StrKey.isValidContract(a)) return "contract";
  if (StrKey.isValidMed25519PublicKey(a)) return "muxed";
  return "invalid";
}

/** Addresses Mora can pay: G and C. M is rejected because Soroban transactions can't carry memos. */
export function isPayable(input: string): boolean {
  const k = addressKind(input);
  return k === "account" || k === "contract";
}

