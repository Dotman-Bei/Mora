import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import { parseRecipients } from "../recipients";

const a = Keypair.random().publicKey();
const b = Keypair.random().publicKey();
const m = "MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAAAAAAAAAAACJUQ";

describe("parseRecipients", () => {
  it("reads address, amount lines in any separator", () => {
    const r = parseRecipients(`${a}, 50\n${b}\t12.5\n\n# comment`);
    expect(r.rows.map((x) => [x.address, x.amount, x.error])).toEqual([
      [a, 500_000_000n, undefined],
      [b, 125_000_000n, undefined],
    ]);
  });
  it("merges duplicates exactly and says so", () => {
    const r = parseRecipients(`${a}, 0.1\n${b}, 1\n${a}, 0.2`);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]?.amount).toBe(3_000_000n);
    expect(r.rows[0]?.lines).toEqual([1, 3]);
    expect(r.notices[0]).toMatch(/1 duplicate address was merged/);
  });
  it("rejects M-addresses with a reason", () => {
    const r = parseRecipients(`${m}, 5`);
    expect(r.rows[0]?.error).toMatch(/memo/);
  });
  it("flags bad amounts and junk", () => {
    const r = parseRecipients(`${a}, -1\nnope, 5\n${b}`);
    expect(r.rows.map((x) => !!x.error)).toEqual([true, true, true]);
  });
  it("applies one amount to an address list", () => {
    const r = parseRecipients(`${a}\n${b}`, "50");
    expect(r.rows.map((x) => x.amount)).toEqual([500_000_000n, 500_000_000n]);
    expect(parseRecipients(`${a}`, "0").rows[0]?.error).toBeTruthy();
  });
});

describe("federation names", () => {
  const name = "ada*example.com";
  it("waits for a lookup, then uses the resolved account and keeps the name", async () => {
    const { parseRecipients } = await import("../recipients");
    const pending = parseRecipients(`${name}, 5`);
    expect(pending.rows[0]?.pending).toBe(true);
    const ok = parseRecipients(`${name}, 5`, undefined, new Map([[name, { status: "ok" as const, account: a }]]));
    expect(ok.rows[0]).toMatchObject({ address: a, label: name, amount: 50_000_000n });
    expect(ok.rows[0]?.error).toBeUndefined();
  });
  it("shows why a name can't be used", async () => {
    const { parseRecipients } = await import("../recipients");
    const r = parseRecipients(`${name}, 5`, undefined, new Map([[name, { status: "error" as const, message: "needs a memo" }]]));
    expect(r.rows[0]?.error).toBe("needs a memo");
  });
  it("merges a name with the same account typed as an address", async () => {
    const { parseRecipients } = await import("../recipients");
    const r = parseRecipients(`${name}, 1\n${a}, 2`, undefined, new Map([[name, { status: "ok" as const, account: a }]]));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.amount).toBe(30_000_000n);
  });
});

describe("csvToList", () => {
  it("keeps the first two columns and drops the header", async () => {
    const { csvToList } = await import("../recipients");
    expect(csvToList(`address,amount,note\n${a},50,first\n"${b}","12.5"\n\nada*example.com;1`)).toBe(`${a}, 50\n${b}, 12.5\nada*example.com, 1`);
  });
});
