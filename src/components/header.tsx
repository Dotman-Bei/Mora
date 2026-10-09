"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { accountUrl, IS_TESTNET, NETWORK } from "@/lib/config";
import { short } from "@/lib/format";
import { Icons } from "./icons";
import { useSession } from "./providers";
import { Button, ButtonLink } from "./ui";

// Two headers. The marketing site: logo, three links in the middle, "Open app".
// The app (/app/*): its four screens in the middle, network and account on the right.

const SITE_NAV = [
  { href: "/#why", label: "Why Portaj" },
  { href: "/#security", label: "Security" },
  { href: "/how", label: "How it works" },
];

const APP_NAV = [
  { href: "/app", label: "Wallet" },
  { href: "/app/carry", label: "Carry" },
  { href: "/app/receipts", label: "Receipts" },
  ...(IS_TESTNET ? [{ href: "/app/exchange", label: "Exchange" }] : []),
];

export const isAppPath = (p: string | null) => p === "/app" || !!p?.startsWith("/app/");

/** No banner slot on Portaj: the network is labelled in the app header itself. */
export function Chrome() {
  return isAppPath(usePathname()) ? <AppHeader /> : <SiteHeader />;
}

function Logo({ href }: { href: string }) {
  return (
    <Link href={href} className="-ml-1 flex h-11 items-center gap-2 px-1 text-foreground" aria-label="Portaj home">
      <Icons.Logo className="h-6 w-7" />
      <span className="text-lg leading-none">portaj</span>
    </Link>
  );
}

function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className={`fixed left-0 right-0 top-0 z-50 ${open ? "bg-background" : "bg-background-semi-transparent backdrop-blur-md"}`}>
      <div className="mx-auto grid max-w-[1400px] grid-cols-[1fr_auto] items-center px-4 py-3 md:grid-cols-[1fr_auto_1fr] xl:px-6 xl:py-4 2xl:px-8">
        <div className="justify-self-start">
          <Logo href="/" />
        </div>

        <nav className="hidden items-center gap-9 md:flex" aria-label="Main">
          {SITE_NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`text-sm transition-colors hover:text-foreground ${pathname === n.href ? "text-foreground" : "text-muted-foreground"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center justify-self-end gap-2">
          <ButtonLink href="/app" className="hidden sm:inline-flex">
            Open app
            <Icons.arrowRight className="h-3.5 w-3.5" />
          </ButtonLink>
          <button
            type="button"
            className="-mr-2 flex h-11 w-11 flex-col items-center justify-center gap-[5px] md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span className={`h-[1.5px] w-5 bg-foreground transition-transform ${open ? "translate-y-[6.5px] rotate-45" : ""}`} />
            <span className={`h-[1.5px] w-5 bg-foreground transition-opacity ${open ? "opacity-0" : ""}`} />
            <span className={`h-[1.5px] w-5 bg-foreground transition-transform ${open ? "-translate-y-[6.5px] -rotate-45" : ""}`} />
          </button>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-x-0 bottom-0 top-[4.25rem] z-50 overflow-y-auto bg-background px-4 pb-10 md:hidden">
          <nav className="flex flex-col border-t border-border" aria-label="Mobile">
            {SITE_NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="flex h-14 items-center border-b border-border text-lg text-foreground">
                {n.label}
              </Link>
            ))}
          </nav>
          <ButtonLink href="/app" size="lg" className="mt-8 w-full">
            Open app
            <Icons.arrowRight className="h-3.5 w-3.5" />
          </ButtonLink>
        </div>
      ) : null}
    </header>
  );
}

function AppHeader() {
  const pathname = usePathname();
  const tab = (n: (typeof APP_NAV)[number], mobile: boolean) => {
    const active = pathname === n.href;
    return (
      <Link
        key={n.href}
        href={n.href}
        aria-current={active ? "page" : undefined}
        className={`relative flex items-center justify-center text-sm transition-colors hover:text-foreground ${mobile ? "h-11 flex-1" : "h-full px-1"} ${
          active ? "text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-foreground" : "text-muted-foreground"
        }`}
      >
        {n.label}
      </Link>
    );
  };

  return (
    <header className="bg-background-semi-transparent fixed left-0 right-0 top-0 z-50 border-b border-border backdrop-blur-md">
      <div className="mx-auto grid h-[60px] max-w-[1400px] grid-cols-[1fr_auto] items-center gap-4 px-4 md:grid-cols-[1fr_auto_1fr] xl:px-6 2xl:px-8">
        <div className="justify-self-start">
          <Logo href="/" />
        </div>
        <nav className="hidden h-full items-stretch gap-8 md:flex" aria-label="App">
          {APP_NAV.map((n) => tab(n, false))}
        </nav>
        <div className="flex items-center justify-self-end gap-3 sm:gap-4">
          <NetworkLabel />
          <AccountButton />
        </div>
      </div>
      <nav className="flex border-t border-border px-2 md:hidden" aria-label="App (mobile)">
        {APP_NAV.map((n) => tab(n, true))}
      </nav>
    </header>
  );
}

/** A label, not a switch: Portaj runs on one network per deployment. */
export function NetworkLabel() {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 border border-border px-2.5 text-xs text-muted-foreground" title={`Stellar ${NETWORK.label}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${IS_TESTNET ? "bg-waiting" : "bg-delivered"}`} aria-hidden />
      {NETWORK.label}
    </span>
  );
}

/**
 * The passkey account. Signed in, it shows the user's own transit G address
 * (derived from the passkey) and falls back to the smart wallet's C address
 * until the first passkey prompt derives it. Signing in is a passkey prompt.
 */
export function AccountButton() {
  const { wallet, setWallet, exit, signOut } = useSession();
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu && !error) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setMenu(false);
        setError(null);
      }
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [menu, error]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const { connectWallet } = await import("@/lib/wallet");
      setWallet(await connectWallet());
    } catch (e) {
      const { passkeyError } = await import("@/lib/format");
      setError(passkeyError(e));
    } finally {
      setBusy(false);
    }
  }

  const copy = (label: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(() => setCopied(label));
  };

  if (!wallet && !exit) {
    return (
      <div className="relative" ref={ref}>
        <Button variant="outline" size="sm" onClick={() => void signIn()} disabled={busy}>
          <Icons.key className="h-3.5 w-3.5" />
          {busy ? "Waiting…" : <span>Sign in<span className="hidden sm:inline"> with passkey</span></span>}
        </Button>
        {error ? (
          <p role="alert" className="absolute right-0 top-full z-50 mt-3 w-64 animate-dropdown-fade border border-border bg-background p-3 text-xs text-destructive shadow-lg">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  const g = exit?.publicKey ?? null;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setMenu((m) => !m)}
        aria-expanded={menu}
        aria-haspopup="menu"
        className="inline-flex h-10 items-center gap-2 border border-border px-3 font-mono text-sm tabular text-foreground transition-colors hover:border-muted-foreground sm:h-8"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-delivered" aria-hidden />
        {short(g ?? wallet!.contractId)}
      </button>
      {menu ? (
        <div role="menu" className="absolute right-0 top-full z-50 mt-3 w-[min(20rem,calc(100vw-2rem))] animate-dropdown-fade border border-border bg-background shadow-lg">
          <div className="space-y-1 border-b border-border p-3">
            <p className="text-xs text-muted-foreground">Transit account</p>
            {g ? (
              <>
                <p className="break-all font-mono text-xs text-foreground">{g}</p>
                <p className="text-xs text-muted-foreground">Yours, derived from your passkey.</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Appears after your first passkey prompt in a carry.</p>
            )}
          </div>
          {wallet ? (
            <div className="space-y-1 border-b border-border p-3">
              <p className="text-xs text-muted-foreground">Smart wallet</p>
              <p className="break-all font-mono text-xs text-foreground">{wallet.contractId}</p>
            </div>
          ) : null}
          {g ? (
            <MenuItem onClick={() => copy("g", g)}>{copied === "g" ? "Copied" : "Copy transit address"}</MenuItem>
          ) : null}
          {wallet ? <MenuItem onClick={() => copy("c", wallet.contractId)}>{copied === "c" ? "Copied" : "Copy wallet address"}</MenuItem> : null}
          {g ? (
            <a role="menuitem" href={accountUrl(g)} target="_blank" rel="noreferrer" className="flex w-full items-center justify-between px-3 py-2.5 text-sm text-foreground hover:bg-accent">
              View on explorer
              <Icons.external className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
          ) : null}
          <MenuItem
            className="border-t border-border"
            onClick={() => {
              signOut();
              setMenu(false);
            }}
          >
            Sign out
          </MenuItem>
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ onClick, children, className = "" }: { onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`block w-full px-3 py-2.5 text-left text-sm text-foreground hover:bg-accent ${className}`}>
      {children}
    </button>
  );
}
