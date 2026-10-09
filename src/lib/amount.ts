// Stellar USDC has 7 decimals; never assume 6 (FR-1.5).

export const DECIMALS = 7;
const SCALE = 10n ** BigInt(DECIMALS);

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** "20" | "20.5" | "0.0000001" → stroops. Rejects more than 7 decimals. */
export function parseUsdc(input: string): Parsed<bigint> {
  const s = input.trim().replace(/,/g, "");
  if (!s) return { ok: false, error: "Enter an amount." };
  const m = /^(\d+)(?:\.(\d*))?$/.exec(s);
  if (!m) return { ok: false, error: "Enter a number, like 20 or 12.5." };
  const frac = m[2] ?? "";
  if (frac.length > DECIMALS) return { ok: false, error: "USDC on Stellar has 7 decimals at most." };
  const value = BigInt(m[1]) * SCALE + BigInt(frac.padEnd(DECIMALS, "0") || "0");
  if (value <= 0n) return { ok: false, error: "The amount must be more than 0." };
  if (value > 9_223_372_036_854_775_807n) return { ok: false, error: "That amount is too large." };
  return { ok: true, value };
}

/** Stroops → "20.0000000", always 7 decimals. */
export function formatUsdc(stroops: bigint | string | number): string {
  const v = typeof stroops === "bigint" ? stroops : BigInt(stroops);
  const neg = v < 0n;
  const a = neg ? -v : v;
  return `${neg ? "-" : ""}${a / SCALE}.${(a % SCALE).toString().padStart(DECIMALS, "0")}`;
}

/** Horizon's "20.0000000" → stroops. */
export function fromDecimal(s: string): bigint {
  const r = parseUsdc(s);
  if (r.ok) return r.value;
  if (/^0*(\.0*)?$/.test(s.trim())) return 0n;
  throw new Error(`Bad amount: ${s}`);
}
