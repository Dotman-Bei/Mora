"use client";

// Payments sent from this browser. Activity falls back to this list when the
// index is unavailable, and re-checks every entry against the contract before
// showing it (PRD §6.5). A per-viewer convenience only: never the source of
// truth for any amount.

export interface SentRecord {
  network: string;
  from: string;
  to: string;
  token: string;
  assetCode: string;
  amount: string; // stroops, as a string (JSON has no bigint)
  outcome: "delivered" | "waiting";
  reason?: number;
  refundAfter: number;
  txHash?: string;
  at: number;
}

const KEY = "mora:sent:v1";
const MAX = 500;

export function readHistory(): SentRecord[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SentRecord[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function addHistory(records: SentRecord[]) {
  try {
    const next = [...records, ...readHistory()].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}
