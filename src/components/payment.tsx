import { formatAmount } from "mora-sdk/amount";
import { shortAddress } from "mora-sdk/format";
import type { MoraAsset } from "mora-sdk/network";
import type { ReactNode } from "react";

// The product's words (PRD §8). "Waiting" always comes with a reason;
// nothing waiting is ever called paid, pending, failed or expired.
export type Status = "delivered" | "waiting" | "claimed" | "returned" | "ready-to-return" | "unknown";

const STATUS: Record<Status, { label: string; dot: string; text: string }> = {
  delivered: { label: "Delivered", dot: "bg-delivered", text: "text-delivered" },
  claimed: { label: "Claimed", dot: "bg-delivered", text: "text-delivered" },
  waiting: { label: "Waiting", dot: "bg-waiting", text: "text-waiting" },
  "ready-to-return": { label: "Ready to return", dot: "bg-returned", text: "text-returned" },
  returned: { label: "Returned", dot: "bg-returned", text: "text-returned" },
  unknown: { label: "UNKNOWN", dot: "bg-muted-foreground", text: "text-muted-foreground" },
};

/** A status as a small round dot plus its word. The only colour on the page lives here. */
export function StatusMark({ status, reason, className = "" }: { status: Status; reason?: string; className?: string }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-2 text-sm ${className}`}>
      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${s.dot}`} aria-hidden />
      <span className={s.text}>{s.label}</span>
      {reason ? <span className="text-muted-foreground">· {reason}</span> : null}
    </span>
  );
}

/** Amounts: tabular figures, never floats, never a number the contract hasn't confirmed. */
export function Amount({ value, code, className = "" }: { value: bigint | null; code?: string; className?: string }) {
  return (
    <span className={`font-mono tabular ${className}`}>
      {value === null ? "UNKNOWN" : formatAmount(value)}
      {code ? <span className="text-muted-foreground"> {code}</span> : null}
    </span>
  );
}

export function AssetLine({ asset }: { asset: MoraAsset }) {
  return (
    <span className="text-sm text-muted-foreground">
      {asset.code}
      {asset.test ? " · test asset" : ""}
      {asset.domain ? ` · ${asset.domain}` : ""}
    </span>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-border py-3 text-sm first:border-t-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-foreground">{children}</dd>
    </div>
  );
}

export function AddressText({ address, full = false }: { address: string; full?: boolean }) {
  return (
    <span className="font-mono tabular break-all" title={address}>
      {full ? address : shortAddress(address, 6, 6)}
    </span>
  );
}

/**
 * The payment card: one focal component used on the claim page, inbox and
 * activity (PRD §14). Square, bordered, no shadow.
 */
export function PaymentCard({
  status,
  reason,
  amount,
  asset,
  from,
  to,
  returnDate,
  children,
  footer,
  showIssuer = false,
}: {
  status: Status;
  reason?: string;
  amount: bigint | null;
  asset: MoraAsset;
  from: string;
  to: string;
  returnDate?: string;
  children?: ReactNode;
  footer?: ReactNode;
  showIssuer?: boolean;
}) {
  return (
    <article className="border border-border bg-background">
      <div className="space-y-5 p-5 sm:p-6">
        <StatusMark status={status} reason={reason} />
        <div className="space-y-1">
          <p className="text-4xl text-foreground sm:text-5xl">
            <Amount value={amount} />
          </p>
          <AssetLine asset={asset} />
        </div>
      </div>
      <dl className="border-t border-border px-5 sm:px-6">
        <Row label="From">
          <AddressText address={from} />
        </Row>
        <Row label="For">
          <AddressText address={to} />
        </Row>
        {showIssuer && asset.issuer ? (
          <Row label="Issuer">
            <AddressText address={asset.issuer} full />
          </Row>
        ) : null}
        {returnDate ? <Row label="Returns to sender">{returnDate}</Row> : null}
      </dl>
      {children ? <div className="space-y-3 border-t border-border p-5 sm:p-6">{children}</div> : null}
      {footer ? <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground sm:px-6">{footer}</div> : null}
    </article>
  );
}
