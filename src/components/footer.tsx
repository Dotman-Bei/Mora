"use client";

import { RpcPool } from "mora-sdk";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { NETWORK_LABEL } from "@/lib/networks";
import { site } from "@/lib/site.config";
import { useNetwork } from "./providers";

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-border">
      <div className="mx-auto max-w-[1400px] px-4 py-16 sm:px-8 sm:pb-80">
        <div className="flex flex-col gap-12 md:flex-row md:justify-between">
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {site.footer.columns.map((c) => (
              <div key={c.title} className="space-y-3">
                <p className="text-sm text-foreground">{c.title}</p>
                <ul className="space-y-2">
                  {c.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="space-y-6 md:max-w-sm md:text-right">
            <p className="text-base text-foreground sm:text-xl">{site.footer.tagline}</p>
            <div className="flex flex-wrap gap-3 md:justify-end">
              {site.footer.badges.map((b) => (
                <span key={b.label} className="border border-border px-2.5 py-1 text-xs text-muted-foreground">
                  {b.label} · <span className="text-foreground">{b.value}</span>
                </span>
              ))}
            </div>
            <ThemeToggle />
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <NetworkStatus />
          <p>
            © {new Date().getFullYear()} {site.footer.copyright}. No trackers. Recipients never need an account.
          </p>
        </div>
      </div>

      {/* The giant cropped wordmark (frontend.md §6.9). Decorative, so not a heading (§9). */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 hidden -translate-x-1/2 translate-y-[38%] select-none font-sans text-[200px] leading-none text-secondary text-stroke sm:block sm:text-[508px]"
      >
        {site.wordmark}
      </div>
    </footer>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const next = resolvedTheme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="h-9 border border-border px-3 text-xs text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
      aria-label={mounted ? `Switch to ${next} mode` : "Switch theme"}
    >
      {mounted ? `Switch to ${next} mode` : "Switch theme"}
    </button>
  );
}

/** Read live from the RPC, never hard-coded (frontend.md §9). */
function NetworkStatus() {
  const { net, id } = useNetwork();
  const [state, setState] = useState<"checking" | "healthy" | "unreachable">("checking");
  useEffect(() => {
    let alive = true;
    setState("checking");
    RpcPool.for(net)
      .call((s) => s.getHealth())
      .then((h) => alive && setState(h.status === "healthy" ? "healthy" : "unreachable"))
      .catch(() => alive && setState("unreachable"));
    return () => {
      alive = false;
    };
  }, [net]);
  const dot = state === "healthy" ? "bg-delivered animate-pulse-glow" : state === "unreachable" ? "bg-destructive" : "bg-muted-foreground";
  const label = state === "healthy" ? "RPC healthy" : state === "unreachable" ? "RPC unreachable" : "Checking RPC";
  return (
    <p className="flex items-center gap-2">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
      {NETWORK_LABEL[id]} · {label}
    </p>
  );
}
