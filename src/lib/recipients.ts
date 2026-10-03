import { addressKind, AmountError, parseAmount } from "mora-sdk";

// Parse what the sender pasted (PRD §6.2): one `address, amount` per line, or
// addresses only with one amount for all. G and C accepted, M rejected with
// a reason, duplicates merged with a notice. Exact integer math throughout.

export interface ParsedRow {
  address: string;
  amount: bigint | null;
  lines: number[];
  error?: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  notices: string[];
}

const SPLIT = /[\s,;\t]+/;

export function parseRecipients(text: string, sameAmount?: string): ParseResult {
  const notices: string[] = [];
  const byAddress = new Map<string, ParsedRow>();
  const order: ParsedRow[] = [];
  let shared: bigint | null = null;
  let sharedError: string | undefined;
  if (sameAmount !== undefined) {
    try {
      shared = parseAmount(sameAmount);
    } catch (e) {
      sharedError = e instanceof AmountError ? e.message : "Enter an amount";
    }
  }

  text.split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    const [address = "", amountText, ...rest] = line.split(SPLIT).filter(Boolean);
    const lineNo = i + 1;
    let amount: bigint | null = null;
    let error: string | undefined;

    const kind = addressKind(address);
    if (kind === "muxed") error = "M-addresses carry a memo, and Soroban payments can't. Use the account's G-address.";
    else if (kind === "invalid") error = "Not a Stellar address";

    if (sameAmount !== undefined) {
      amount = shared;
      if (!error && sharedError) error = sharedError;
    } else if (amountText === undefined) {
      if (!error) error = "Missing amount";
    } else {
      try {
        amount = parseAmount(amountText);
      } catch (e) {
        if (!error) error = e instanceof AmountError ? e.message : "Not an amount";
      }
    }
    if (rest.length && !error) error = "Expected `address, amount`";

    const existing = !error ? byAddress.get(address) : undefined;
    if (existing && amount !== null && existing.amount !== null) {
      existing.amount += amount;
      existing.lines.push(lineNo);
      return;
    }
    const row: ParsedRow = { address, amount, lines: [lineNo], error };
    if (!error) byAddress.set(address, row);
    order.push(row);
  });

  const merged = order.filter((r) => r.lines.length > 1);
  if (merged.length) {
    notices.push(
      `${merged.length} duplicate address${merged.length > 1 ? "es were" : " was"} merged: amounts on lines ${merged
        .map((r) => r.lines.join("+"))
        .join(", ")} were added together.`,
    );
  }
  return { rows: order, notices };
}
