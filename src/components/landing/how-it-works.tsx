"use client";

import { useEffect, useState } from "react";
import { site } from "@/lib/site.config";
import { Icons } from "../icons";

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

function Field({ label, value, shown }: { label: string; value: string; shown: boolean }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="h-9 truncate border border-border px-3 font-mono text-sm leading-9 text-foreground">{shown ? <span className="animate-fade-in-blur">{value}</span> : null}</p>
    </div>
  );
}

function FormAnimation({ reduced, onComplete }: AnimProps) {
  const f = useScript(6, 650, reduced, onComplete);
  return (
    <div className="w-full max-w-md space-y-4 border border-border bg-background p-4">
      <Field label="Exchange deposit address" value="GCMG…AYE4" shown={f >= 1} />
      {f >= 2 ? (
        <p className="animate-fade-in-blur rounded-full border border-waiting/40 px-2.5 py-0.5 text-xs text-waiting w-fit">This exchange requires a memo</p>
      ) : (
        <p className="h-[22px]" />
      )}
      <Field label="Memo · ID" value="4417 2290" shown={f >= 3} />
      <Field label="Amount" value="20.0000000 USDC" shown={f >= 4} />
      <span className={`block h-10 text-center text-sm leading-10 transition-colors ${f >= 5 ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"}`}>
        Continue with passkey
      </span>
    </div>
  );
}

function AccountAnimation({ reduced, onComplete }: AnimProps) {
  const f = useScript(5, 700, reduced, onComplete);
  const rows = [
    ["XLM balance", "0"],
    ["Base reserve", "Sponsored by Portaj"],
    ["USDC trustline", "Sponsored by Portaj"],
  ];
  return (
    <div className="w-full max-w-md border border-border bg-background">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className={`flex h-8 w-8 items-center justify-center border ${f >= 1 ? "border-foreground text-foreground" : "border-border text-muted-foreground"}`}>
          <Icons.key className="h-4 w-4" />
        </span>
        <span className="text-sm text-foreground">{f >= 1 ? "Passkey confirmed" : "Waiting for your passkey…"}</span>
      </div>
      <div className="space-y-1 border-b border-border px-4 py-3">
        <p className="text-xs text-muted-foreground">Your exit account</p>
        <p className="font-mono text-sm text-foreground">{f >= 2 ? <span className="animate-fade-in-blur">GBX4…P2QD</span> : "—"}</p>
      </div>
      <ul>
        {rows.map(([k, v], i) => (
          <li key={k} className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm last:border-b-0">
            <span className="text-muted-foreground">{k}</span>
            {f >= 3 + (i > 0 ? 1 : 0) ? <span className="animate-fade-in-blur text-foreground">{v}</span> : <span className="text-xs text-muted-foreground">…</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SendAnimation({ reduced, onComplete }: AnimProps) {
  const f = useScript(6, 700, reduced, onComplete);
  const steps = ["Set up exit account", "Wallet → exit account", "Exit account → exchange, memo 4417 2290"];
  return (
    <div className="w-full max-w-md border border-border bg-background">
      <ul>
        {steps.map((s, i) => {
          const done = f > i + 1;
          const now = f === i + 1;
          return (
            <li key={s} className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 text-sm">
              <span className="flex items-center gap-2 text-foreground">
                <span className={`inline-block h-2 w-2 rounded-full ${done ? "bg-delivered" : now ? "animate-pulse bg-waiting" : "bg-muted-foreground/40"}`} aria-hidden />
                {s}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{done ? "Confirmed" : now ? "Sending…" : ""}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-3 p-4">
        <span className="text-xs text-muted-foreground">Exchange simulator</span>
        {f >= 5 ? <span className="animate-fade-in-blur text-sm text-delivered">+20.0000000 USDC credited</span> : <span className="text-sm text-muted-foreground">0 credited</span>}
      </div>
    </div>
  );
}

const ANIMS = [FormAnimation, AccountAnimation, SendAnimation];

export function HowItWorks() {
  const reduced = useReducedMotion();
  const [active, setActive] = useState(0);
  const next = () => setActive((a) => (a + 1) % ANIMS.length);
  const Anim = ANIMS[active] ?? FormAnimation;

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
          const A = ANIMS[i] ?? FormAnimation;
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
