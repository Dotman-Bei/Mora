import type { ClaimResult, DoorResult, Outcome } from "./generated/mora-client";

// SAC error codes that make a payment wait (PRD §11.3, DECISIONS D-001).
export const SAC = {
  ACCOUNT_MISSING: 6,
  BALANCE_ERROR: 10,
  BALANCE_DEAUTHORIZED: 11,
  TRUSTLINE_MISSING: 13,
  INSUFFICIENT_ACCOUNT_RESERVE: 14,
  TOO_MANY_SUBENTRIES: 15,
} as const;

export type ParsedOutcome = { status: "delivered" } | { status: "waiting"; code: number };

export function parseOutcome(o: Outcome): ParsedOutcome {
  return o.tag === "Delivered" ? { status: "delivered" } : { status: "waiting", code: o.values[0] };
}

export type ParsedClaim =
  | { status: "claimed"; amount: bigint; trustlineCreated: boolean }
  | { status: "blocked"; code: number }
  | { status: "empty" };

export function parseClaimResult(r: ClaimResult): ParsedClaim {
  switch (r.tag) {
    case "Claimed":
      return { status: "claimed", amount: BigInt(r.values[0]), trustlineCreated: r.values[1] };
    case "Blocked":
      return { status: "blocked", code: r.values[0] };
    default:
      return { status: "empty" };
  }
}

export type ParsedDoor = { status: "moved"; amount: bigint } | { status: "still-blocked"; code: number } | { status: "empty" };

export function parseDoorResult(r: DoorResult): ParsedDoor {
  switch (r.tag) {
    case "Moved":
      return { status: "moved", amount: BigInt(r.values[0]) };
    case "StillBlocked":
      return { status: "still-blocked", code: r.values[0] };
    default:
      return { status: "empty" };
  }
}

/** Why a payment is waiting, in the product's words (PRD §8). */
export function waitingReason(code: number, assetCode: string): string {
  switch (code) {
    case SAC.TRUSTLINE_MISSING:
      return `no ${assetCode} trustline`;
    case SAC.ACCOUNT_MISSING:
    case SAC.INSUFFICIENT_ACCOUNT_RESERVE:
      return "account not active";
    case SAC.BALANCE_DEAUTHORIZED:
      return "needs issuer approval";
    case SAC.BALANCE_ERROR:
      return `${assetCode} limit too low`;
    default:
      return `network code ${code}`;
  }
}

/** Why a claim can't go through yet, and what the recipient can do. */
export function blockedReason(code: number, assetCode: string): string {
  switch (code) {
    case SAC.INSUFFICIENT_ACCOUNT_RESERVE:
    case SAC.TOO_MANY_SUBENTRIES:
      return `Your account needs a little more free XLM before ${assetCode} can be added.`;
    case SAC.ACCOUNT_MISSING:
    case SAC.TRUSTLINE_MISSING:
      return "Your account isn't active yet. Add some XLM to it first, then claim.";
    case SAC.BALANCE_DEAUTHORIZED:
      return `${assetCode} needs approval from its issuer before your account can hold it.`;
    case SAC.BALANCE_ERROR:
      return `Your ${assetCode} limit is too low for this amount. Raise it in your wallet, then claim.`;
    default:
      return `The network refused this claim (code ${code}).`;
  }
}
