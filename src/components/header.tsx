"use client";

import { shortAddress, type NetworkId } from "mora-sdk";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NETWORK_LABEL, NETWORKS } from "@/lib/networks";
import { Icons } from "./icons";
import { useNetwork, useWallet } from "./providers";

const NAV = [
  { href: "/send", label: "Send" },
  { href: "/inbox", label: "Inbox" },
  { href: "/activity", label: "Activity" },
  { href: "/integrate", label: "Integrate" },
  { href: "/try", label: "Try it" },
];

/**
 * Mainnet carries a persistent beta strip (PRD §6). It reuses the
 * announcement-strip slot from frontend.md §6.0, offsets included.
 */
export function Chrome() {
  const { id } = useNetwork();
  const banner = id === "mainnet";
  useEffect(() => {
    document.documentElement.style.setProperty("--banner-h", banner ? "2.25rem" : "0px");
  }, [banner]);
  return (
    <>
      {banner ? (
        <div className="fixed inset-x-0 top-0 z-[60] flex h-9 items-center justify-center border-b border-border bg-secondary px-4 text-center text-xs text-muted-foreground">
          Beta. The contract is unaudited. Payments are capped.
        </div>
      ) : null}
      <Header top={banner ? "top-9" : "top-0"} />
    </>
  );
}

function Header({ top }: { top: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className={`fixed left-0 right-0 ${top} z-50 ${open ? "bg-background" : "bg-background-semi-transparent backdrop-blur-md"}`}>
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-3 xl:px-6 xl:py-4 2xl:px-8">
        <Link href="/" className="flex items-center gap-2 text-foreground" aria-label="Mora home">
          <Icons.Logo className="h-6 w-6" />
          <span className="text-lg leading-none xl:hidden">mora</span>
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
            <NetworkSwitch />
            <ConnectButton />
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
        <div className="fixed inset-x-0 bottom-0 top-[calc(var(--banner-h,0px)+4.25rem)] z-50 overflow-y-auto bg-background px-4 pb-10 xl:hidden">
          <nav className="flex flex-col border-t border-border" aria-label="Mobile">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="flex h-14 items-center border-b border-border text-lg text-foreground">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="mt-8 space-y-6">
            <NetworkSwitch />
            <ConnectButton block />
          </div>
        </div>
      ) : null}
    </header>
  );
}

export function NetworkSwitch() {
  const { id, setNetwork } = useNetwork();
  const ids: NetworkId[] = ["mainnet", "testnet"];
  return (
    <div className="inline-flex border border-border text-xs" role="radiogroup" aria-label="Network">
      {ids.map((n) => {
        const available = !!NETWORKS[n];
        const active = id === n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={!available}
            title={available ? undefined : "Mainnet deployment pending"}
            onClick={() => setNetwork(n)}
            className={`h-7 px-2.5 transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {NETWORK_LABEL[n]}
          </button>
        );
      })}
    </div>
  );
}

export function ConnectButton({ block = false }: { block?: boolean }) {
  const { address, connect, disconnect, connecting } = useWallet();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);

  if (!address) {
    return (
      <button
        type="button"
        onClick={() => void connect()}
        disabled={connecting}
        className={
          block
            ? "h-11 w-full bg-primary px-6 text-sm text-primary-foreground"
            : "text-sm text-foreground underline-offset-4 hover:underline disabled:opacity-50"
        }
      >
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
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
        {shortAddress(address)}
      </button>
      {menu ? (
        <div className="absolute right-0 top-full z-50 mt-3 w-56 animate-dropdown-fade border border-border bg-background shadow-lg">
          <p className="break-all border-b border-border px-3 py-2 font-mono text-xs text-muted-foreground">{address}</p>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
            onClick={() => {
              void navigator.clipboard?.writeText(address);
              setMenu(false);
            }}
          >
            Copy address
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
            onClick={() => {
              void connect();
              setMenu(false);
            }}
          >
            Switch wallet
          </button>
          <button
            type="button"
            className="block w-full border-t border-border px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
            onClick={() => {
              void disconnect();
              setMenu(false);
            }}
          >
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}
