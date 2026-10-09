import { MuxedAccount, StrKey } from "@stellar/stellar-sdk";
import type { Parsed } from "./amount";

// FR-1.1 to FR-1.3: an exchange deposit address (G or M) and its memo.

export type Destination =
  | { kind: "G"; address: string; account: string }
  | { kind: "M"; address: string; account: string; muxedId: string };

export function parseDestination(input: string): Parsed<Destination> {
  const s = input.trim();
  if (!s) return { ok: false, error: "Paste the exchange's deposit address." };
  if (StrKey.isValidEd25519PublicKey(s)) return { ok: true, value: { kind: "G", address: s, account: s } };
  if (StrKey.isValidMed25519PublicKey(s)) {
    const m = MuxedAccount.fromAddress(s, "0");
    return { ok: true, value: { kind: "M", address: s, account: m.baseAccount().accountId(), muxedId: m.id() } };
  }
  if (StrKey.isValidContract(s)) {
    return { ok: false, error: "That is a contract (C…) address. Exchanges give a G… or M… deposit address; classic payments can't go to a contract." };
  }
  return { ok: false, error: "That isn't a Stellar address. Deposit addresses start with G or M." };
}

export type MemoType = "none" | "id" | "text";
export type MemoInput = { type: "none" } | { type: "id"; value: string } | { type: "text"; value: string };

const MAX_U64 = 18_446_744_073_709_551_615n;

export function parseMemo(type: MemoType, raw: string): Parsed<MemoInput> {
  const value = raw.trim();
  if (type === "none") return value ? { ok: false, error: "Choose a memo type." } : { ok: true, value: { type: "none" } };
  if (!value) return { ok: false, error: "Enter the memo the exchange showed you." };
  if (type === "id") {
    if (!/^\d+$/.test(value) || BigInt(value) > MAX_U64) return { ok: false, error: "A memo ID is a whole number (up to 20 digits)." };
    return { ok: true, value: { type: "id", value: BigInt(value).toString() } };
  }
  if (new TextEncoder().encode(value).length > 28) return { ok: false, error: "A text memo is 28 bytes at most." };
  return { ok: true, value: { type: "text", value } };
}

/** The memo as the exchange will see it (FR-6.3). An M-address carries its ID instead. */
export function memoLabel(dest: Destination | null, memo: MemoInput): string {
  if (dest?.kind === "M") return `Muxed ID ${dest.muxedId}`;
  if (memo.type === "none") return "No memo";
  return `${memo.type === "id" ? "ID" : "Text"} ${memo.value}`;
}

/** Guess the memo type from what was pasted: digits are usually an ID. */
export function guessMemoType(raw: string): MemoType {
  const v = raw.trim();
  if (!v) return "none";
  return /^\d+$/.test(v) && BigInt(v) <= MAX_U64 ? "id" : "text";
}
