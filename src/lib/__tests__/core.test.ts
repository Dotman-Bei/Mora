import { createHash, hkdfSync } from "node:crypto";
import { Keypair, Networks, StrKey } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { formatUsdc, parseUsdc } from "../amount";
import { deriveExitKeypair, deriveExitSeed, prfSalt, PRF_LABEL } from "../derive";
import { guessMemoType, memoLabel, parseDestination, parseMemo } from "../destination";

describe("amount (FR-1.5: 7 decimals)", () => {
  it("parses whole and fractional USDC to stroops", () => {
    expect(parseUsdc("20")).toEqual({ ok: true, value: 200_000_000n });
    expect(parseUsdc("12.5")).toEqual({ ok: true, value: 125_000_000n });
    expect(parseUsdc("0.0000001")).toEqual({ ok: true, value: 1n });
    expect(parseUsdc("1,000")).toEqual({ ok: true, value: 10_000_000_000n });
  });
  it("rejects an 8th decimal, zero and junk", () => {
    expect(parseUsdc("0.00000001").ok).toBe(false);
    expect(parseUsdc("0").ok).toBe(false);
    expect(parseUsdc("abc").ok).toBe(false);
    expect(parseUsdc("-1").ok).toBe(false);
  });
  it("formats with all 7 decimals", () => {
    expect(formatUsdc(200_000_000n)).toBe("20.0000000");
    expect(formatUsdc(1n)).toBe("0.0000001");
  });
});

describe("destination (FR-1.2, FR-1.3)", () => {
  const g = Keypair.random().publicKey();
  it("accepts a G address", () => {
    expect(parseDestination(g)).toEqual({ ok: true, value: { kind: "G", address: g, account: g } });
  });
  it("decodes an M address into its account and muxed ID", () => {
    const m = StrKey.encodeMed25519PublicKey(Buffer.concat([StrKey.decodeEd25519PublicKey(g), Buffer.from([0, 0, 0, 0, 0, 0, 0x30, 0x39])]));
    const r = parseDestination(m);
    expect(r.ok && r.value.kind === "M" && r.value.account === g && r.value.muxedId === "12345").toBe(true);
    expect(r.ok && memoLabel(r.value, { type: "none" })).toBe("Muxed ID 12345");
  });
  it("refuses a contract address", () => {
    const c = StrKey.encodeContract(Buffer.alloc(32, 7));
    const r = parseDestination(c);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/contract/);
  });
});

describe("memo", () => {
  it("validates ID memos as uint64", () => {
    expect(parseMemo("id", "18446744073709551615").ok).toBe(true);
    expect(parseMemo("id", "18446744073709551616").ok).toBe(false);
    expect(parseMemo("id", "12a").ok).toBe(false);
  });
  it("limits text memos to 28 bytes", () => {
    expect(parseMemo("text", "a".repeat(28)).ok).toBe(true);
    expect(parseMemo("text", "a".repeat(29)).ok).toBe(false);
    expect(parseMemo("text", "é".repeat(15)).ok).toBe(false);
  });
  it("guesses digits as an ID", () => {
    expect(guessMemoType("4417")).toBe("id");
    expect(guessMemoType("AB12")).toBe("text");
    expect(guessMemoType("")).toBe("none");
  });
});

describe("exit account derivation (§10)", () => {
  const prf = new Uint8Array(32).map((_, i) => i * 7);

  it("uses SHA-256 of the fixed label as the PRF salt", async () => {
    expect(Buffer.from(await prfSalt()).toString("hex")).toBe(createHash("sha256").update(PRF_LABEL).digest("hex"));
  });

  it("matches an independent HKDF-SHA256 computation", async () => {
    const info = `stellar-ed25519-seed:${createHash("sha256").update(Networks.TESTNET).digest("hex")}`;
    const expected = Buffer.from(hkdfSync("sha256", prf, "portaj", info, 32));
    expect(Buffer.from(await deriveExitSeed(prf, Networks.TESTNET))).toEqual(expected);
  });

  it("gives the same G for the same passkey and a different G per network", async () => {
    const a = await deriveExitKeypair(prf, Networks.TESTNET);
    const b = await deriveExitKeypair(prf, Networks.TESTNET);
    const main = await deriveExitKeypair(prf, Networks.PUBLIC);
    expect(a.publicKey()).toBe(b.publicKey());
    expect(a.publicKey()).not.toBe(main.publicKey());
    expect(StrKey.isValidEd25519PublicKey(a.publicKey())).toBe(true);
  });
});
