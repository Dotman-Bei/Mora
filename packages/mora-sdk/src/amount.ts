// Exact 7-decimal amounts (PRD §6.2). Stellar assets use 7 decimal places;
// every amount is an integer number of stroops held as a bigint. No floats.

export const DECIMALS = 7;
const SCALE = 10n ** BigInt(DECIMALS);
const I64_MAX = 9_223_372_036_854_775_807n;

export class AmountError extends Error {}

/** "12.5" → 125000000n. Throws AmountError on anything that isn't a plain positive decimal. */
export function parseAmount(input: string): bigint {
  const s = input.trim().replace(/[_\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(s) && !/^\.\d+$/.test(s)) {
    throw new AmountError(`"${input.trim()}" is not an amount`);
  }
  const [whole = "0", frac = ""] = s.split(".");
  if (frac.length > DECIMALS) {
    throw new AmountError(`"${input.trim()}" has more than ${DECIMALS} decimal places`);
  }
  const stroops = BigInt(whole || "0") * SCALE + BigInt(frac.padEnd(DECIMALS, "0") || "0");
  if (stroops <= 0n) throw new AmountError("Amount must be more than zero");
  if (stroops > I64_MAX) throw new AmountError("Amount is too large");
  return stroops;
}

/** 125000000n → "12.5". Trims trailing zeros; keeps at least `minFraction` places. */
export function formatAmount(stroops: bigint, minFraction = 0): string {
  const neg = stroops < 0n;
  const abs = neg ? -stroops : stroops;
  const whole = abs / SCALE;
  let frac = (abs % SCALE).toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  if (frac.length < minFraction) frac = frac.padEnd(minFraction, "0");
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${w}${frac ? "." + frac : ""}`;
}

export function sumAmounts(xs: Iterable<bigint>): bigint {
  let t = 0n;
  for (const x of xs) t += x;
  return t;
}
