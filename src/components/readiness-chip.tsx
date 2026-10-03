import { readinessGroup, type Readiness } from "mora-sdk";

/** Chip wording from PRD §6.2. Round, because it's a chip (frontend.md §4). */
export function readinessLabel(r: Readiness, code: string): string {
  switch (r) {
    case "ready":
      return "Ready";
    case "will-activate":
      return "Will activate account";
    case "wait-no-trustline":
      return `Will wait: no ${code} trustline`;
    case "wait-not-active":
      return "Will wait: account not active";
    case "wait-needs-approval":
      return "Will wait: needs issuer approval";
    case "wait-limit":
      return `Will wait: ${code} limit too low`;
    case "blocked-memo":
      return "Blocked: needs a memo";
    case "invalid-muxed":
      return "Invalid: M-address";
    default:
      return "Invalid";
  }
}

export function ReadinessChip({ r, code }: { r: Readiness | "checking" | "unknown"; code: string }) {
  if (r === "checking") return <span className="text-xs text-muted-foreground">Checking…</span>;
  if (r === "unknown")
    return <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">UNKNOWN</span>;
  const g = readinessGroup(r);
  const cls =
    g === "delivered"
      ? "border-delivered/40 text-delivered"
      : g === "waiting"
        ? "border-waiting/40 text-waiting"
        : "border-destructive/40 text-destructive";
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${cls}`}>{readinessLabel(r, code)}</span>;
}

export const MEMO_HELP =
  "This address requires a memo (SEP-29), which usually means an exchange. Soroban transactions can't carry memos, so Mora won't send rather than lose the deposit.";
