import { describe, expect, it } from "vitest";
import { Address, Keypair, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import {
  AmountError, addressKind, claimLink, formatAmount, parseAmount, parseClaimLink, parseClaimResult,
  parseMoraEvent, parseOutcome, readinessGroup, sumAmounts, waitingReason,
} from "../src";

describe("amounts: exact 7-decimal integers", () => {
  it("parses decimals without floats", () => {
    expect(parseAmount("1")).toBe(10_000_000n);
    expect(parseAmount("0.1")).toBe(1_000_000n);
    expect(parseAmount("0.0000001")).toBe(1n);
    expect(parseAmount(" 12.5 ")).toBe(125_000_000n);
    expect(parseAmount(".5")).toBe(5_000_000n);
    expect(parseAmount("1_000")).toBe(10_000_000_000n);
    // 0.1 + 0.2 is exactly 0.3 here
    expect(sumAmounts([parseAmount("0.1"), parseAmount("0.2")])).toBe(parseAmount("0.3"));
  });
  it("rejects anything that isn't a positive amount", () => {
    for (const bad of ["", "0", "0.0", "-1", "1e5", "abc", "1.00000001", "1,5", "922337203685.4775808"]) {
      expect(() => parseAmount(bad), bad).toThrow(AmountError);
    }
  });
  it("formats with grouping and trimmed zeros", () => {
    expect(formatAmount(10_000_000n)).toBe("1");
    expect(formatAmount(125_000_000n)).toBe("12.5");
    expect(formatAmount(1n)).toBe("0.0000001");
    expect(formatAmount(12_345_678_900_000_000n)).toBe("1,234,567,890");
    expect(formatAmount(10_000_000n, 2)).toBe("1.00");
  });
  it("round-trips", () => {
    for (const s of ["1", "0.5", "123.4567891", "1000000"]) expect(formatAmount(parseAmount(s)).replace(/,/g, "")).toBe(s);
  });
});

describe("addresses", () => {
  const g = Keypair.random().publicKey();
  it("classifies G, C, M and junk", () => {
    expect(addressKind(g)).toBe("account");
    expect(addressKind("CAHCJV5S5LJIL53YPNS4YTO2QWK65RYJG56SMSMYIPU45RVHV4YZZ3SF")).toBe("contract");
    expect(addressKind("MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAAAAAAAAAAACJUQ")).toBe("muxed");
    expect(addressKind("GABC")).toBe("invalid");
    expect(addressKind(g.slice(0, -1) + (g.endsWith("A") ? "B" : "A"))).toBe("invalid");
  });
});

describe("claim links", () => {
  it("round-trip every field", () => {
    const p = { network: "testnet" as const, from: Keypair.random().publicKey(), to: Keypair.random().publicKey(), asset: "CABKO7FTLFX6LT3UXIWDBKVPE64RQYLQAHYYP6RBLW2OMBA7THKZXA74" };
    const url = new URL(claimLink(p, "https://example.com/"));
    expect(url.pathname).toBe("/claim");
    expect(parseClaimLink(url.searchParams)).toEqual(p);
  });
  it("rejects unknown networks", () => {
    expect(parseClaimLink({ network: "futurenet" }).network).toBeUndefined();
  });
});

describe("results", () => {
  it("parses outcomes and claims", () => {
    expect(parseOutcome({ tag: "Delivered", values: undefined })).toEqual({ status: "delivered" });
    expect(parseOutcome({ tag: "Parked", values: [13] })).toEqual({ status: "waiting", code: 13 });
    expect(parseClaimResult({ tag: "Claimed", values: [5n, true] })).toEqual({ status: "claimed", amount: 5n, trustlineCreated: true });
    expect(parseClaimResult({ tag: "Blocked", values: [11] })).toEqual({ status: "blocked", code: 11 });
    expect(parseClaimResult({ tag: "Empty", values: undefined })).toEqual({ status: "empty" });
  });
  it("uses product words for reasons", () => {
    expect(waitingReason(13, "USDC")).toBe("no USDC trustline");
    expect(waitingReason(14, "XLM")).toBe("account not active");
    expect(readinessGroup("will-activate")).toBe("delivered");
    expect(readinessGroup("wait-no-trustline")).toBe("waiting");
    expect(readinessGroup("blocked-memo")).toBe("blocked");
  });
});

describe("events", () => {
  const from = Keypair.random().publicKey();
  const to = Keypair.random().publicKey();
  const token = "CABKO7FTLFX6LT3UXIWDBKVPE64RQYLQAHYYP6RBLW2OMBA7THKZXA74";
  const topics = (name: string) => [
    xdr.ScVal.scvSymbol("mora"), xdr.ScVal.scvSymbol(name),
    Address.fromString(from).toScVal(), Address.fromString(to).toScVal(), Address.fromString(token).toScVal(),
  ];
  it("decodes parked vec data", () => {
    const data = xdr.ScVal.scvVec([nativeToScVal(5n, { type: "i128" }), nativeToScVal(13, { type: "u32" }), nativeToScVal(900, { type: "u32" }), nativeToScVal(7n, { type: "i128" })]);
    expect(parseMoraEvent(topics("parked"), data)).toEqual({ type: "parked", from, to, token, amount: 5n, reason: 13, refundAfter: 900, parcelTotal: 7n });
  });
  it("decodes single-value amounts", () => {
    expect(parseMoraEvent(topics("delivered"), nativeToScVal(9n, { type: "i128" }))).toMatchObject({ type: "delivered", amount: 9n });
  });
  it("ignores other events", () => {
    expect(parseMoraEvent([xdr.ScVal.scvSymbol("transfer")], nativeToScVal(1n, { type: "i128" }))).toBeNull();
  });
});
