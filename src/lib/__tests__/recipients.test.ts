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
