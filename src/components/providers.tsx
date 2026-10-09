"use client";

import type { Keypair } from "@stellar/stellar-sdk";
import { ThemeProvider } from "next-themes";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { NETWORK } from "@/lib/config";
import { store, type WalletRef } from "@/lib/store";

// The Portaj session. Two things, both per browser:
// - wallet: the in-app passkey smart wallet (Mode A), remembered by address.
// - exit: the passkey-derived exit account. Its public key may be remembered;
//   the keypair lives in memory only and is gone when the tab closes (FR-2.2).

export interface ExitAccount {
  publicKey: string;
  credentialId: string;
  /** In memory only. null until a passkey ceremony in this tab derived it. */
  keypair: Keypair | null;
  /** §10.4: no PRF, so a one-time random key held for this session only. */
  oneTime: boolean;
}

interface SessionCtx {
  wallet: WalletRef | null;
  setWallet: (w: WalletRef | null) => void;
  exit: ExitAccount | null;
  setExit: (e: ExitAccount | null) => void;
  signOut: () => void;
}

const Ctx = createContext<SessionCtx | null>(null);

function SessionProvider({ children }: { children: ReactNode }) {
  const [wallet, setWalletState] = useState<WalletRef | null>(null);
  const [exit, setExitState] = useState<ExitAccount | null>(null);

  useEffect(() => {
    const w = store.wallet();
    if (w) {
      setWalletState(w);
      const g = store.exitFor(w.keyId);
      if (g) setExitState({ publicKey: g, credentialId: w.keyId, keypair: null, oneTime: false });
    }
  }, []);

  // Every PRF result from any ceremony on this page (wallet creation, signing,
  // plain sign-in) derives the exit account for the passkey that produced it.
  useEffect(() => {
    let off = () => {};
    void import("@/lib/webauthn").then(({ onPrf, installPrfCapture }) => {
      installPrfCapture();
      off = onPrf(async (c) => {
        if (!c.first) return;
        const { deriveExitKeypair } = await import("@/lib/derive");
        const kp = await deriveExitKeypair(c.first, NETWORK.passphrase);
        store.rememberExit(c.credentialId, kp.publicKey());
        setExitState({ publicKey: kp.publicKey(), credentialId: c.credentialId, keypair: kp, oneTime: false });
      });
    });
    return () => off();
  }, []);

  const setWallet = useCallback((w: WalletRef | null) => {
    setWalletState(w);
    store.setWallet(w);
  }, []);

  const setExit = useCallback((e: ExitAccount | null) => setExitState(e), []);

  const signOut = useCallback(() => {
    setWalletState(null);
    setExitState(null);
    store.setWallet(null);
  }, []);

  const value = useMemo(() => ({ wallet, setWallet, exit, setExit, signOut }), [wallet, setWallet, exit, setExit, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSession outside SessionProvider");
  return c;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SessionProvider>{children}</SessionProvider>
    </ThemeProvider>
  );
}
