"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AddressLine, Field, Input, Notice, Page, Panel, TransitAccountCard, useAccount } from "@/components/portaj";
import { useSession } from "@/components/providers";
import { TxLink } from "@/components/share";
import { Icons } from "@/components/icons";
import { Button, ButtonLink, Eyebrow, Skeleton } from "@/components/ui";
import { formatUsdc } from "@/lib/amount";
import { IS_TESTNET, NETWORK, TEST_USDC_GRANT, txUrl } from "@/lib/config";
import { passkeyError } from "@/lib/format";

// The passkey smart wallet: USDC balance and C-address. On testnet, FR-9 judge
// onboarding lives here too: create a test wallet, get test USDC.

export function WalletView() {
  const { wallet, setWallet, exit } = useSession();
  const [name, setName] = useState("Judge");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ at: string; msg: string } | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [funded, setFunded] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const transit = useAccount(exit?.publicKey);

  const loadBalance = useCallback(async () => {
    if (!wallet) return setBalance(null);
    const { contractUsdcBalance } = await import("@/lib/wallet");
    setBalance(await contractUsdcBalance(wallet.contractId).catch(() => null));
  }, [wallet]);
  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  async function run(at: string, fn: () => Promise<void>) {
    setBusy(at);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError({ at, msg: passkeyError(e) });
    } finally {
      setBusy(null);
    }
  }

  const signIn = () =>
    run("signin", async () => {
      const { connectWallet } = await import("@/lib/wallet");
      setWallet(await connectWallet());
    });

  const create = () =>
    run("create", async () => {
      const { createWallet } = await import("@/lib/wallet");
      const w = await createWallet(name.trim() || "Judge");
      setWallet({ contractId: w.contractId, keyId: w.keyId });
      setCreated(w.hash);
    });

  const fund = () =>
    run("fund", async () => {
      const { api } = await import("@/lib/api");
      setFunded((await api.fund(wallet!.contractId)).hash);
      await loadBalance();
    });

  const err = (at: string) => (error?.at === at ? <Notice tone="error">{error.msg}</Notice> : null);

  if (!wallet) {
    return (
      <Page title="Wallet" intro={`Your passkey smart wallet on Stellar ${NETWORK.label.toLowerCase()}. No seed phrase, no extension: your device's passkey controls it.`}>
        <div className={`grid border border-border ${IS_TESTNET ? "md:grid-cols-2" : ""}`}>
          <div className="flex flex-col gap-4 border-b border-border p-6 md:border-b-0 md:border-r last:border-0">
            <span className="flex h-10 w-10 items-center justify-center border border-border bg-secondary text-muted-foreground">
              <Icons.key className="h-5 w-5" />
            </span>
            <div className="space-y-1.5">
              <p className="text-base text-foreground sm:text-lg">Sign in with your passkey</p>
              <p className="text-sm text-muted-foreground">Already made a Portaj wallet on this device? Your passkey finds it.</p>
            </div>
            <div className="mt-auto pt-2">
              <Button size="lg" variant={IS_TESTNET ? "outline" : "default"} onClick={() => void signIn()} disabled={!!busy}>
                {busy === "signin" ? "Waiting for your passkey…" : "Sign in with passkey"}
              </Button>
            </div>
            {err("signin")}
          </div>

          {IS_TESTNET ? (
            <div className="flex flex-col gap-4 p-6">
              <span className="flex h-10 w-10 items-center justify-center border border-border bg-secondary text-muted-foreground">
                <Icons.wallet className="h-5 w-5" />
              </span>
              <div className="space-y-1.5">
                <p className="text-base text-foreground sm:text-lg">Create a test wallet</p>
                <p className="text-sm text-muted-foreground">A passkey-kit smart wallet on testnet, controlled by a passkey on this device. Portaj pays the deployment.</p>
              </div>
              <div className="mt-auto grid gap-3 pt-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <Field label="Name for the passkey">
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="font-sans" />
                </Field>
                <Button size="lg" onClick={() => void create()} disabled={!!busy}>
                  {busy === "create" ? "Creating…" : "Create test wallet"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Your device asks for the passkey twice: once to make it, once to bind it to the wallet.</p>
              {err("create")}
            </div>
          ) : null}
        </div>

        <p className="text-sm text-muted-foreground">
          Your wallet lives on another site?{" "}
          <Link href="/app/carry?mode=b" className="text-foreground underline underline-offset-4">
            Carry from another wallet
          </Link>
          . Passkeys belong to the site that made them, so you send the USDC from there and Portaj pays the exchange.
        </p>
      </Page>
    );
  }

  return (
    <Page
      title="Wallet"
      intro={`Your passkey smart wallet on Stellar ${NETWORK.label.toLowerCase()}.`}
      aside={
        <ButtonLink href="/app/carry" size="lg">
          Carry to an exchange
          <Icons.arrowRight className="h-3.5 w-3.5" />
        </ButtonLink>
      }
    >
      <div className={`grid border border-border ${IS_TESTNET ? "lg:grid-cols-[1.5fr_1fr]" : ""}`}>
        <div className="space-y-6 border-b border-border p-6 lg:border-b-0 lg:border-r last:border-0">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow>USDC balance</Eyebrow>
              <button type="button" onClick={() => void loadBalance()} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Refresh
              </button>
            </div>
            {balance === null ? (
              <Skeleton className="h-12 w-56" />
            ) : (
              <p className="flex items-baseline gap-2 font-mono tabular text-foreground" data-testid="wallet-usdc">
                <span className="text-4xl sm:text-5xl">{formatUsdc(balance)}</span>
                <span className="text-base text-muted-foreground">USDC</span>
              </p>
            )}
          </div>
          <AddressLine label="Smart wallet (passkey-kit) · C-address" address={wallet.contractId} />
          {created ? <TxLink href={txUrl(created)} label="Wallet deployment" /> : null}
        </div>

        {IS_TESTNET ? (
          <div className="flex flex-col gap-4 p-6">
            <Eyebrow>Testnet funds</Eyebrow>
            <p className="text-sm text-muted-foreground">{TEST_USDC_GRANT} Circle testnet USDC from Portaj&apos;s stash, sent to this wallet. Same issuer as real exchanges accept.</p>
            <div className="mt-auto flex flex-wrap items-center gap-3">
              <Button onClick={() => void fund()} disabled={!!busy}>
                {busy === "fund" ? "Sending…" : "Get test USDC"}
              </Button>
              {funded ? <TxLink href={txUrl(funded)} label="Test USDC transfer" /> : null}
            </div>
            {err("fund")}
          </div>
        ) : null}
      </div>

      <Panel title="Transit account" eyebrow="Derived from your passkey">
        {exit ? (
          <TransitAccountCard account={exit.publicKey} state={transit.state} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Your own G account, used for one ledger on the way to the exchange. It appears after your first passkey prompt in a carry, created with 0 XLM and reserves paid by Portaj.
          </p>
        )}
      </Panel>

      {IS_TESTNET ? (
        <Panel title="Next" eyebrow="Testnet walkthrough">
          <ol className="grid gap-px border border-border bg-border sm:grid-cols-3">
            {[
              ["Try the normal way", "On Carry, watch the network refuse a memo on a smart-wallet transfer.", "/app/carry#normal-way"],
              ["Carry with Portaj", "Same address and memo. One passkey prompt.", "/app/carry"],
              ["See it credited", "The exchange simulator credits your memo.", "/app/exchange"],
            ].map(([t, b, href], i) => (
              <li key={t} className="bg-background">
                <Link href={href} className="group block h-full space-y-1.5 p-4 transition-colors hover:bg-accent">
                  <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                  <span className="flex items-center gap-1.5 text-sm text-foreground">
                    {t}
                    <Icons.arrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                  <span className="block text-xs text-muted-foreground">{b}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}
    </Page>
  );
}
