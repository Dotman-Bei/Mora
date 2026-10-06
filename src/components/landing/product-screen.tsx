import { Amount, StatusMark, type Status } from "../payment";

// An illustration of the send results screen, built from the same components
// the product uses, so it is correct in both themes (frontend.md §4, §12.7).
// Example rows only; it isn't presented as live data.

const ROWS: Array<{ name: string; addr: string; amount: bigint; status: Status; reason?: string }> = [
  { name: "Ada", addr: "GDQX…7KQM", amount: 500_000_000n, status: "delivered" },
  { name: "Kunle", addr: "GBN4…2WPA", amount: 500_000_000n, status: "waiting", reason: "no USDC trustline" },
  { name: "Mei", addr: "GCTR…H3LD", amount: 500_000_000n, status: "delivered" },
  { name: "Tomás", addr: "CAZK…Q9RE", amount: 500_000_000n, status: "delivered" },
  { name: "Ife", addr: "GAQL…M8VB", amount: 500_000_000n, status: "waiting", reason: "account not active" },
];

export function ProductScreen() {
  return (
    <div className="w-full border border-border bg-background text-left" role="img" aria-label="Illustration: a Mora payout of five payments, three delivered and two waiting">
      <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-3">
        <span className="min-w-0 truncate text-sm text-foreground">
          <span className="sm:hidden">October payout</span>
          <span className="hidden sm:inline">Contributor payout · October</span>
        </span>
        <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">1 signature</span>
      </div>
      <div className="grid grid-cols-3 border-b border-border text-xs text-muted-foreground">
        <Stat label="Delivered" value="3" />
        <Stat label="Waiting" value="2" />
        <Stat label="Failed" value="0" />
      </div>
      <ul>
        {ROWS.map((r) => (
          <li key={r.addr} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border px-5 py-3 last:border-b-0 sm:grid-cols-[9rem_1fr_auto]">
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{r.name}</p>
              <p className="font-mono tabular text-xs text-muted-foreground">{r.addr}</p>
            </div>
            <span className="hidden sm:block">
              <StatusMark status={r.status} reason={r.reason} />
            </span>
            <div className="text-right">
              <Amount value={r.amount} code="USDC" className="text-sm" />
              <span className="mt-0.5 block text-xs sm:hidden">
                <StatusMark status={r.status} className="text-xs" />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-border px-5 py-3 last:border-r-0">
      <p>{label}</p>
      <p className="font-mono tabular text-xl text-foreground">{value}</p>
    </div>
  );
}
