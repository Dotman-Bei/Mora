"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NETWORK } from "@/lib/config";
import { short } from "@/lib/format";
import { Icons } from "./icons";
import { useSession } from "./providers";

const NAV = [
  { href: "/exit", label: "Exit" },
  { href: "/try", label: "Try it" },
  { href: "/exchange", label: "Exchange simulator" },
  { href: "/recover", label: "Recover" },
  { href: "/how", label: "How it works" },
];

/** No banner slot on Portaj: testnet is labelled in the header itself. */
export function Chrome() {
  return <Header />;
}

function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className={`fixed left-0 right-0 top-0 z-50 ${open ? "bg-background" : "bg-background-semi-transparent backdrop-blur-md"}`}>
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3 xl:px-6 xl:py-4 2xl:px-8">
        <Link href="/" className="-ml-1 flex h-11 items-center gap-2 px-1 text-foreground" aria-label="Portaj home">
          <Icons.Logo className="h-6 w-7" />
          <span className="text-lg leading-none xl:hidden">portaj</span>
        </Link>

        <nav className="hidden items-center gap-7 xl:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`text-sm transition-colors hover:text-foreground ${pathname === n.href ? "text-foreground" : "text-muted-foreground"}`}
            >
              {n.label}
            </Link>
          ))}
          <div className="flex items-center gap-5 border-l border-border pl-6">
            <NetworkLabel />
            <AccountButton />
          </div>
        </nav>

        <button
          type="button"
          className="-mr-2 flex h-11 w-11 flex-col items-center justify-center gap-[5px] xl:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={`h-[1.5px] w-5 bg-foreground transition-transform ${open ? "translate-y-[6.5px] rotate-45" : ""}`} />
          <span className={`h-[1.5px] w-5 bg-foreground transition-opacity ${open ? "opacity-0" : ""}`} />
          <span className={`h-[1.5px] w-5 bg-foreground transition-transform ${open ? "-translate-y-[6.5px] -rotate-45" : ""}`} />
        </button>
      </div>

      {open ? (
        <div className="fixed inset-x-0 bottom-0 top-[4.25rem] z-50 overflow-y-auto bg-background px-4 pb-10 xl:hidden">
          <nav className="flex flex-col border-t border-border" aria-label="Mobile">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="flex h-14 items-center border-b border-border text-lg text-foreground">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mt-8 space-y-6">
            <NetworkLabel />
            <AccountButton block />
          </div>
        </div>
      ) : null}
    </header>
  );
}

/** Testnet only (PRD §2): a label, not a switch. */
export function NetworkLabel() {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 border border-border px-2.5 text-xs text-muted-foreground">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-waiting" aria-hidden />
      {NETWORK.label}
    </span>
  );
}

/** The passkey wallet this browser uses. Signing in is a passkey prompt; no extension. */
export function AccountButton({ block = false }: { block?: boolean }) {
  const { wallet, setWallet, exit, signOut } = useSession();
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

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

  if (!wallet) {
    return (
      <div className={block ? "space-y-2" : "relative"}>
        <button
          type="button"
          onClick={() => void signIn()}
          disabled={busy}
          className={
            block
              ? "h-11 w-full bg-primary px-6 text-sm text-primary-foreground"
              : "text-sm text-foreground underline-offset-4 hover:underline disabled:opacity-50"
          }
        >
          {busy ? "Waiting for passkey…" : "Sign in with passkey"}
        </button>
        {error ? (
          <p role="alert" className={`text-xs text-destructive ${block ? "" : "absolute right-0 top-full mt-2 w-64 border border-border bg-background p-2 text-left"}`}>
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setMenu((m) => !m)}
        aria-expanded={menu}
        className={`font-mono tabular text-sm text-foreground ${block ? "h-11 w-full border border-border" : ""}`}
      >
        {short(wallet.contractId)}
      </button>
      {menu ? (
        <div className="absolute right-0 top-full z-50 mt-3 w-64 animate-dropdown-fade border border-border bg-background shadow-lg">
          <p className="border-b border-border px-3 pt-2 text-xs text-muted-foreground">Smart wallet</p>
          <p className="break-all border-b border-border px-3 pb-2 font-mono text-xs text-foreground">{wallet.contractId}</p>
          {exit ? (
            <>
              <p className="px-3 pt-2 text-xs text-muted-foreground">Exit account</p>
              <p className="break-all border-b border-border px-3 pb-2 font-mono text-xs text-foreground">{exit.publicKey}</p>
            </>
          ) : null}
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
            onClick={() => {
              void navigator.clipboard?.writeText(wallet.contractId);
              setMenu(false);
            }}
          >
            Copy wallet address
          </button>
          <button
            type="button"
            className="block w-full border-t border-border px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
            onClick={() => {
              signOut();
              setMenu(false);
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
