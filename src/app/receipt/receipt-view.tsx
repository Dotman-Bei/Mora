"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Page, Receipt, receiptUrl, type ReceiptData } from "@/components/portaj";
import { ButtonLink } from "@/components/ui";
import { short } from "@/lib/format";
import { store, type Receipt as Stored } from "@/lib/store";

// FR-6 as a shareable page. With query parameters it shows one receipt, read
// live from the chain; without, the receipts saved in this browser.

export function ReceiptView() {
  const [one, setOne] = useState<ReceiptData | null>(null);
  const [list, setList] = useState<Stored[] | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const g = q.get("g");
    const out = q.get("out");
    if (g && out) {
      setOne({
        account: g,
        destination: q.get("to") ?? "",
        memoLabel: q.get("memo") ?? "",
        amount: q.get("amount") ?? "",
        setupHash: q.get("setup") ?? undefined,
        inHash: q.get("in") ?? undefined,
        outHash: out,
      });
    } else setList(store.receipts());
  }, []);

  if (one) {
    return (
      <Page title="Receipt" intro="Each step is a transaction on Stellar testnet. Open the links to check them yourself.">
        <Receipt r={one} />
      </Page>
    );
  }

  return (
    <Page title="Receipts" intro="Exits made in this browser.">
      {list === null ? null : list.length === 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">No exits yet.</p>
          <ButtonLink href="/exit">Exit to an exchange</ButtonLink>
        </div>
      ) : (
        <ul className="border border-border">
          {list.map((r) => (
            <li key={r.outHash} className="border-b border-border last:border-b-0">
              <Link href={receiptUrl(r)} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-accent">
                <span className="font-mono tabular text-foreground">{r.amount} USDC</span>
                <span className="text-muted-foreground">
                  to {short(r.destination)} · {r.memoLabel}
                </span>
                <span className="text-xs text-muted-foreground">{new Date(r.at).toLocaleString()}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
