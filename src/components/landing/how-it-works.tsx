"use client";

import { useEffect, useState } from "react";
import { site } from "@/lib/site.config";
import { Amount, StatusMark, type Status } from "../payment";

// Three steps beside a canvas of scripted product animations. Each animation
// calls onComplete, which advances to the next step, so the section cycles on
// its own (frontend.md §6.3). Reduced motion shows the final frame and stops
// the cycle (frontend.md §9, §12.8).

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Steps through `frames` frames, `ms` apart, then calls onComplete once. */
function useScript(frames: number, ms: number, reduced: boolean, onComplete?: () => void) {
  const [f, setF] = useState(reduced ? frames - 1 : 0);
  useEffect(() => {
    if (reduced) {
      setF(frames - 1);
      return;
    }
    if (f >= frames - 1) {
      const t = setTimeout(() => onComplete?.(), ms * 2.5);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setF((x) => x + 1), ms);
    return () => clearTimeout(t);
  }, [f, frames, ms, reduced, onComplete]);
  return f;
}

type AnimProps = { reduced: boolean; onComplete?: () => void };

const LIST = [
  { addr: "GDQX…7KQM", chip: "Ready", status: "delivered" as Status },
  { addr: "GBN4…2WPA", chip: "Will wait: no USDC trustline", status: "waiting" as Status },
  { addr: "GCTR…H3LD", chip: "Ready", status: "delivered" as Status },
  { addr: "CAZK…Q9RE", chip: "Ready", status: "delivered" as Status },
  { addr: "GAQL…M8VB", chip: "Will wait: account not active", status: "waiting" as Status },
];

function SendAnimation({ reduced, onComplete }: AnimProps) {
  const f = useScript(LIST.length + 3, 600, reduced, onComplete);
  return (
    <div className="w-full max-w-md border border-border bg-background">
      <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">Recipients · 50 USDC each</div>
      <ul>
        {LIST.map((r, i) => (
          <li key={r.addr} className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-sm">
            <span className="font-mono tabular text-foreground">{r.addr}</span>
            {f > i ? (
              <span className={`animate-fade-in-blur rounded-full border px-2 py-0.5 text-xs ${r.status === "delivered" ? "border-delivered/40 text-delivered" : "border-waiting/40 text-waiting"}`}>
                {r.chip}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Checking…</span>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-3 p-4">
        <span className="text-xs text-muted-foreground">Preview. The network decides when you send.</span>
        <span className={`h-9 shrink-0 px-4 text-sm leading-9 transition-colors ${f >= LIST.length + 1 ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
          {f >= LIST.length + 2 ? "Signed" : "Sign once"}
        </span>
      </div>
    </div>
  );
}

function WaitAnimation({ reduced, onComplete }: AnimProps) {
  const f = useScript(5, 800, reduced, onComplete);
  return (
    <div className="w-full max-w-md space-y-4">
      <div className="border border-border bg-background">
        <div className="grid grid-cols-3 border-b border-border text-xs text-muted-foreground">
          {[
            ["Delivered", "3"],
            ["Waiting", "2"],
            ["Failed", "0"],
          ].map(([l, v]) => (
            <div key={l} className="border-r border-border px-4 py-3 last:border-r-0">
              <p>{l}</p>
              <p className="font-mono tabular text-xl text-foreground">{v}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <span className="font-mono tabular">GBN4…2WPA</span>
          <StatusMark status="waiting" reason="no USDC trustline" className="text-xs" />
        </div>
        <div className="flex gap-2 border-t border-border px-4 py-3">
          <span className={`h-8 px-3 text-xs leading-8 transition-colors ${f >= 1 ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
            {f >= 2 ? "Link copied" : "Copy link"}
          </span>
          <span className="h-8 border border-border px-3 text-xs leading-8 text-muted-foreground">Share</span>
        </div>
      </div>
      {f >= 3 ? (
        <div className="ml-auto max-w-[17rem] animate-fade-in-scale rounded-2xl border border-border bg-card p-3 text-sm">
          <p className="text-foreground">Your October payout is waiting 👇</p>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">mora.vercel.app/claim?network=mainnet&from=GDQX…&to=GBN4…</p>
        </div>
      ) : null}
    </div>
  );
}

function ClaimAnimation({ reduced, onComplete }: AnimProps) {
  const f = useScript(5, 900, reduced, onComplete);
  const claimed = f >= 2;
  const returned = f >= 4;
  return (
    <div className="grid w-full max-w-lg gap-4 sm:grid-cols-2">
      <div className="border border-border bg-background">
        <div className="space-y-3 p-4">
          <StatusMark status={claimed ? "claimed" : "waiting"} reason={claimed ? undefined : "no USDC trustline"} className="text-xs" />
          <p className="text-3xl">
            <Amount value={500_000_000n} />
          </p>
          <p className="text-xs text-muted-foreground">USDC · centre.io</p>
        </div>
        <div className="border-t border-border p-4">
          {claimed ? (
            <p className="animate-fade-in-blur text-xs text-muted-foreground">USDC was added to your wallet.</p>
          ) : (
            <span className={`block h-9 text-center text-sm leading-9 ${f >= 1 ? "bg-primary text-primary-foreground" : "border border-border"}`}>
              {f >= 1 ? "Signing…" : "Claim"}
            </span>
          )}
        </div>
      </div>
      <div className="border border-border bg-background">
        <div className="space-y-3 p-4">
          <StatusMark status={returned ? "returned" : f >= 3 ? "ready-to-return" : "waiting"} reason={f < 3 ? "account not active" : undefined} className="text-xs" />
          <p className="text-3xl">
            <Amount value={500_000_000n} />
          </p>
          <p className="text-xs text-muted-foreground">USDC · centre.io</p>
        </div>
        <div className="border-t border-border p-4">
          {returned ? (
            <p className="animate-fade-in-blur text-xs text-muted-foreground">Returned to the sender.</p>
          ) : (
            <span className={`block h-9 text-center text-sm leading-9 ${f >= 3 ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
              {f >= 3 ? "Return to sender" : "Returns after Oct 17"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const ANIMS = [SendAnimation, WaitAnimation, ClaimAnimation];

export function HowItWorks() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const next = () => setActive((a) => (a + 1) % ANIMS.length);
  const Anim = ANIMS[active] ?? SendAnimation;

  return (
    <section className="mx-auto max-w-[1400px] py-12 sm:py-16 lg:py-24">
      {/* Desktop: timeline beside a canvas. */}
      <div className="hidden lg:grid lg:h-[640px] lg:grid-cols-[2fr_3fr] lg:gap-16">
        <div className="flex flex-col justify-center">
          <h2 className="mb-10 font-serif text-2xl">How it works</h2>
          <ol className="relative space-y-8">
            <span className="absolute bottom-2 left-[3.5px] top-2 w-px bg-border" aria-hidden />
            {site.steps.map((s, i) => (
              <li key={s.title} className={`relative pl-8 transition-opacity ${i === active ? "opacity-100" : "opacity-60 hover:opacity-80"}`}>
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Step ${i + 1}: ${s.title}`}
                  aria-current={i === active ? "step" : undefined}
                  className={`absolute left-0 top-2 h-2 w-2 ${i === active ? "bg-foreground" : "bg-muted-foreground"}`}
                />
                <button type="button" onClick={() => setActive(i)} className="text-left text-lg text-foreground lg:text-xl">
                  {s.title}
                </button>
                {i === active ? <p className="mt-2 max-w-md animate-fade-in-blur text-sm text-muted-foreground">{s.subtitle}</p> : null}
              </li>
            ))}
          </ol>
        </div>
        <div className="grid-pattern flex items-center justify-center border border-border bg-card p-10">
          <div key={active} className="flex w-full animate-fade-in-scale justify-center">
            <Anim reduced={reduced} onComplete={reduced ? undefined : next} />
          </div>
        </div>
      </div>

      {/* Mobile: stacked steps, each with its own short copy and animation. */}
      <div className="space-y-12 lg:hidden">
        <h2 className="text-center font-serif text-2xl">How it works</h2>
        {site.steps.map((s, i) => {
          const A = ANIMS[i] ?? SendAnimation;
          return (
            <div key={s.title} className="space-y-4">
              <div>
                <p className="text-lg text-foreground">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.mobileSubtitle}</p>
              </div>
              <div className="flex justify-center border border-border bg-card p-4">
                <A reduced />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
