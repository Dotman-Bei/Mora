import { addressKind, AmountError, parseAmount } from "mora-sdk";

// Parse what the sender pasted (PRD §6.2): one `address, amount` per line, or
// addresses only with one amount for all. G and C accepted, M rejected with
// a reason, duplicates merged with a notice. Exact integer math throughout.

export interface ParsedRow {
  address: string;
  amount: bigint | null;
  lines: number[];
  error?: string;
  /** The federation name the sender typed (name*domain), when there was one. */
  label?: string;
  /** A federation name still being looked up. */
  pending?: boolean;
}

/** Result of resolving a federation name (SEP-2). */
export type NameLookup = { status: "pending" } | { status: "ok"; account: string } | { status: "error"; message: string };

/** name*domain.tld, as typed in a list. */
export const FEDERATION_NAME = /^[^\s*,;]+\*[^\s*,;]+\.[^\s*,;]+$/;

export interface ParseResult {
  rows: ParsedRow[];
  notices: string[];
}

const SPLIT = /[\s,;\t]+/;

export function parseRecipients(text: string, sameAmount?: string, names?: Map<string, NameLookup>): ParseResult {
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
    const [typed = "", amountText, ...rest] = line.split(SPLIT).filter(Boolean);
    const lineNo = i + 1;
    let amount: bigint | null = null;
    let error: string | undefined;
    let address = typed;
    let label: string | undefined;
    let pending = false;

    if (FEDERATION_NAME.test(typed)) {
      // name*domain: use the account it resolves to (SEP-2).
      label = typed;
      const found = names?.get(typed.toLowerCase());
      if (found?.status === "ok") address = found.account;
      else if (found?.status === "error") error = found.message;
      else {
        pending = true;
        error = "Looking up this name…";
      }
    }

    if (!error) {
      const kind = addressKind(address);
      if (kind === "muxed") error = "M-addresses carry a memo, and Soroban payments can't. Use the account's G-address.";
      else if (kind === "invalid") error = "Not a Stellar address";
    }

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
    const row: ParsedRow = { address, amount, lines: [lineNo], error, label, pending: pending || undefined };
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

/**
 * A pasted or uploaded CSV as the list format: the first two columns of each
 * row (address or name, amount). A header row and blank rows are dropped.
 */
export function csvToList(csv: string): string {
  return csv
    .split(/\r?\n/)
    .map((line) => line.split(/[,;\t]/).map((c) => c.trim().replace(/^"(.*)"$/, "$1")))
    .filter(([first = ""]) => addressKind(first) !== "invalid" || FEDERATION_NAME.test(first))
    .map(([who = "", amount = ""]) => (amount ? `${who}, ${amount}` : who))
    .join("\n");
}
