"use client";

import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { formatUsdc } from "@/lib/amount";
import { accountUrl, SPONSOR, txUrl } from "@/lib/config";
import { short } from "@/lib/format";
import { getAccount, type AccountState } from "@/lib/horizon";
import { CopyButton, TxLink } from "./share";
import { Eyebrow } from "./ui";

// Building blocks shared by the Exit, Try it, Recover and Receipt screens.

export function Page({ title, intro, children }: { title: ReactNode; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-10 pb-24 pt-28 sm:pt-32">
      <header className="space-y-3">
        <h1 className="font-serif text-3xl sm:text-4xl">{title}</h1>
        {intro ? <p className="text-sm text-muted-foreground">{intro}</p> : null}
      </header>
      {children}
    </div>
  );
}

export const inputClass = "h-11 w-full border border-border bg-background px-3 font-mono text-sm outline-none focus:border-foreground disabled:opacity-60";

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
      {error ? <span className="block text-xs text-destructive">{error}</span> : hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input spellCheck={false} autoComplete="off" {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "error" | "ok"; title?: ReactNode; children?: ReactNode }) {
  const border = tone === "error" ? "border-destructive/50" : tone === "warn" ? "border-waiting/50" : tone === "ok" ? "border-delivered/50" : "border-border";
  return (
    <div role={tone === "error" ? "alert" : undefined} className={`space-y-1.5 border ${border} bg-secondary p-4 text-sm`}>
      {title ? <p className="text-foreground">{title}</p> : null}
      {children ? <div className="text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function Dot({ state }: { state: "done" | "active" | "idle" | "failed" | "skipped" }) {
  const c = state === "done" ? "bg-delivered" : state === "active" ? "animate-pulse bg-waiting" : state === "failed" ? "bg-destructive" : "bg-muted-foreground/40";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${c}`} aria-hidden />;
}

export interface Step {
  label: string;
  state: "done" | "active" | "idle" | "failed" | "skipped";
  detail?: string;
  hash?: string;
}

/** Live status per transaction (PRD §15.5). */
export function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="border border-border" aria-live="polite">
      {steps.map((s) => (
        <li key={s.label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-3 text-sm last:border-b-0">
          <span className={`flex items-center gap-2.5 ${s.state === "skipped" ? "text-muted-foreground" : "text-foreground"}`}>
            <Dot state={s.state} />
            {s.label}
          </span>
          <span className="flex items-center gap-3 text-xs text-muted-foreground">
            {s.detail ? <span>{s.detail}</span> : null}
            {s.hash ? <TxLink href={txUrl(s.hash)} label="Explorer" /> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function AddressLine({ label, address, copy = true }: { label: string; address: string; copy?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Eyebrow>{label}</Eyebrow>
      <div className="flex flex-wrap items-center gap-2">
        <a href={accountUrl(address)} target="_blank" rel="noreferrer" className="break-all font-mono text-sm text-foreground underline-offset-4 hover:underline">
          {address}
        </a>
        {copy ? <CopyButton text={address} label="Copy" /> : null}
      </div>
    </div>
  );
}

export function useAccount(id: string | null | undefined, pollMs = 0) {
  const [state, setState] = useState<AccountState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!id) {
      setState(null);
      return;
    }
    let alive = true;
    const load = () =>
      getAccount(id)
        .then((a) => alive && (setState(a), setError(null)))
        .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    void load();
    const t = pollMs ? setInterval(load, pollMs) : null;
    return () => {
      alive = false;
      if (t) clearInterval(t);
    };
  }, [id, pollMs, tick]);
  return { state, error, refresh: () => setTick((x) => x + 1) };
}

/** The exit account's live state (FR-2.3, FR-6.2). */
export function ExitAccountCard({ account, state }: { account: string; state: AccountState | null }) {
  const sponsored = state?.sponsor === SPONSOR;
  const rows: [string, ReactNode][] = state
    ? [
        ["Status", state.exists ? (state.usdc ? "Ready" : "Exists, no USDC trustline yet") : "Not set up yet"],
        ["XLM balance", state.exists ? formatUsdc(state.nativeStroops) : "0"],
        ["USDC balance", state.usdc ? formatUsdc(state.usdc.stroops) : "—"],
        ["Base reserve", state.exists ? (sponsored ? `Sponsored by Portaj (${short(SPONSOR)})` : state.sponsor ? `Sponsored by ${short(state.sponsor)}` : "Paid by the account") : "Paid by Portaj when set up"],
        ["USDC trustline reserve", state.usdc ? (state.usdc.sponsor === SPONSOR ? "Sponsored by Portaj" : "Paid by the account") : "Paid by Portaj when set up"],
      ]
    : [["Status", "Reading the network…"]];
  return (
    <div className="border border-border">
      <div className="space-y-1.5 border-b border-border p-4">
        <Eyebrow>Your exit account</Eyebrow>
        <div className="flex flex-wrap items-center gap-2">
          <a href={accountUrl(account)} target="_blank" rel="noreferrer" className="break-all font-mono text-sm text-foreground underline-offset-4 hover:underline" data-testid="exit-account">
            {account}
          </a>
          <CopyButton text={account} label="Copy" />
        </div>
      </div>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-2.5 text-sm last:border-b-0">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-mono tabular text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export interface ReceiptData {
  account: string;
  destination: string;
  memoLabel: string;
  amount: string;
  setupHash?: string;
  inHash?: string;
  outHash: string;
}

export function receiptUrl(r: ReceiptData) {
  const q = new URLSearchParams({ g: r.account, to: r.destination, memo: r.memoLabel, amount: r.amount, out: r.outHash });
  if (r.inHash) q.set("in", r.inHash);
  if (r.setupHash) q.set("setup", r.setupHash);
  return `/receipt?${q}`;
}

/** FR-6: three explorer links, the exit account's 0 XLM and sponsor, the memo as sent. */
export function Receipt({ r }: { r: ReceiptData }) {
  const { state } = useAccount(r.account);
  const links: [string, string | undefined][] = [
    ["Setup · exit account created, reserves sponsored", r.setupHash],
    ["Transfer in · smart wallet → exit account", r.inHash],
    ["Payment out · exit account → exchange, with memo", r.outHash],
  ];
  return (
    <div className="space-y-6" data-testid="receipt">
      <div className="grid border border-border sm:grid-cols-3">
        <Stat label="Sent" value={`${r.amount} USDC`} />
        <Stat label="Memo as sent" value={r.memoLabel} />
        <Stat label="Your exit account holds" value={state ? `${formatUsdc(state.nativeStroops)} XLM` : "…"} testId="exit-xlm" />
      </div>
      <ul className="border border-border">
        {links.map(([label, hash]) => (
          <li key={label} className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 text-sm last:border-b-0">
            <span className="flex items-center gap-2.5 text-foreground">
              <Dot state={hash ? "done" : "skipped"} />
              {label}
            </span>
            {hash ? <TxLink href={txUrl(hash)} label={`${hash.slice(0, 8)}…`} /> : <span className="text-xs text-muted-foreground">Not needed this time</span>}
          </li>
        ))}
      </ul>
      <div className="grid gap-6 sm:grid-cols-2">
        <AddressLine label="Exchange address" address={r.destination} copy={false} />
        <AddressLine label="Exit account" address={r.account} copy={false} />
      </div>
      <p className="text-xs text-muted-foreground">
        {state?.sponsor === SPONSOR
          ? `Reserves sponsored by Portaj (${short(SPONSOR)}). USDC left in the exit account: ${state.usdc ? formatUsdc(state.usdc.stroops) : "0"}. Every fee was paid by a fee bump.`
          : "Reading the exit account…"}
      </p>
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="space-y-1 border-b border-border p-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <Eyebrow>{label}</Eyebrow>
      <p className="break-all font-mono text-sm text-foreground" data-testid={testId}>
        {value}
      </p>
    </div>
  );
}
