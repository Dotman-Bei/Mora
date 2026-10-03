"use client";

import type { MoraNetwork, NetworkId, SignTransaction } from "mora-sdk";
import { ThemeProvider, useTheme } from "next-themes";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_NETWORK, getNetwork, isNetworkId } from "@/lib/networks";
import { loadKit } from "@/lib/wallet-kit";

// ---------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------

interface NetworkCtx {
  id: NetworkId;
  net: MoraNetwork;
  setNetwork: (id: NetworkId) => void;
}

const NetworkContext = createContext<NetworkCtx | null>(null);
const STORE_KEY = "mora:network";

function NetworkProvider({ children }: { children: ReactNode }) {
  const [id, setId] = useState<NetworkId>(DEFAULT_NETWORK);

  useEffect(() => {
    // A link's ?network= wins; otherwise the viewer's last choice.
    const fromUrl = new URLSearchParams(window.location.search).get("network");
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(STORE_KEY);
    } catch {}
    const pick = isNetworkId(fromUrl) ? fromUrl : isNetworkId(stored) ? stored : null;
    if (pick && getNetwork(pick)) setId(pick);
  }, []);

  const setNetwork = useCallback((next: NetworkId) => {
    if (!getNetwork(next)) return;
    setId(next);
    try {
      window.localStorage.setItem(STORE_KEY, next);
    } catch {}
  }, []);

  const net = getNetwork(id) ?? (getNetwork("testnet") as MoraNetwork);
  const value = useMemo(() => ({ id: net.id, net, setNetwork }), [net, setNetwork]);
  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkCtx {
  const c = useContext(NetworkContext);
  if (!c) throw new Error("useNetwork outside NetworkProvider");
  return c;
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

interface WalletCtx {
  address: string | null;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<string | null>;
  disconnect: () => Promise<void>;
  signTransaction: SignTransaction;
}

const WalletContext = createContext<WalletCtx | null>(null);
const WALLET_KEY = "mora:wallet-address";

function WalletProvider({ children }: { children: ReactNode }) {
  const { net } = useNetwork();
  const { resolvedTheme } = useTheme();
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dark = resolvedTheme === "dark";

  useEffect(() => {
    // Remember the last address for display only; signing always goes back
    // through the wallet.
    try {
      const a = window.localStorage.getItem(WALLET_KEY);
      if (a) setAddress(a);
    } catch {}
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const kit = await loadKit(net.passphrase, dark);
      const { address: a } = await kit.authModal();
      setAddress(a);
      try {
        window.localStorage.setItem(WALLET_KEY, a);
      } catch {}
      return a;
    } catch (e) {
      const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : null;
      if (msg && !/closed|cancel|reject/i.test(msg)) setError(msg);
      return null;
    } finally {
      setConnecting(false);
    }
  }, [net.passphrase, dark]);

  const disconnect = useCallback(async () => {
    try {
      const kit = await loadKit(net.passphrase, dark);
      await kit.disconnect();
    } catch {}
    setAddress(null);
    try {
      window.localStorage.removeItem(WALLET_KEY);
    } catch {}
  }, [net.passphrase, dark]);

  const signTransaction = useCallback<SignTransaction>(
    async (xdr, opts) => {
      const kit = await loadKit(net.passphrase, dark);
      return kit.signTransaction(xdr, {
        networkPassphrase: opts?.networkPassphrase ?? net.passphrase,
        address: opts?.address ?? address ?? undefined,
      });
    },
    [net.passphrase, dark, address],
  );

  const value = useMemo(
    () => ({ address, connecting, error, connect, disconnect, signTransaction }),
    [address, connecting, error, connect, disconnect, signTransaction],
  );
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletCtx {
  const c = useContext(WalletContext);
  if (!c) throw new Error("useWallet outside WalletProvider");
  return c;
}

// ---------------------------------------------------------------------------

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <NetworkProvider>
        <WalletProvider>{children}</WalletProvider>
      </NetworkProvider>
    </ThemeProvider>
  );
}
