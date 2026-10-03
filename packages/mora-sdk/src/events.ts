import { scValToNative, type xdr } from "@stellar/stellar-sdk";

export type MoraEventType = "delivered" | "parked" | "claimed" | "moved" | "returned";
const TYPES: readonly MoraEventType[] = ["delivered", "parked", "claimed", "moved", "returned"];

export interface MoraEvent {
  type: MoraEventType;
  from: string;
  to: string;
  token: string;
  amount: bigint;
  /** parked */
  reason?: number;
  refundAfter?: number;
  parcelTotal?: bigint;
  /** claimed */
  trustlineCreated?: boolean;
}

/**
 * Decode one Mora contract event (PRD §11.5). Topics are
 * `mora, <type>, from, to, token`; data is the amount, or a vec for `parked`
 * ([amount, reason, refund_after, parcel_total]) and `claimed`
 * ([amount, trustline_created]). Returns null for anything else.
 */
export function parseMoraEvent(topics: xdr.ScVal[], value: xdr.ScVal): MoraEvent | null {
  if (topics.length !== 5) return null;
  const [t0, t1, from, to, token] = topics.map((t) => scValToNative(t)) as unknown[];
  if (t0 !== "mora" || !TYPES.includes(t1 as MoraEventType)) return null;
  const type = t1 as MoraEventType;
  const data = scValToNative(value) as unknown;
  const base = { type, from: String(from), to: String(to), token: String(token) };

  if (type === "parked") {
    const [amount, reason, refundAfter, parcelTotal] = data as [bigint, number, number, bigint];
    return { ...base, amount: BigInt(amount), reason: Number(reason), refundAfter: Number(refundAfter), parcelTotal: BigInt(parcelTotal) };
  }
  if (type === "claimed") {
    const [amount, trustlineCreated] = data as [bigint, boolean];
    return { ...base, amount: BigInt(amount), trustlineCreated: Boolean(trustlineCreated) };
  }
  return { ...base, amount: BigInt(data as bigint) };
}
