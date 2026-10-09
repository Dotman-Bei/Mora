"use client";

import { useCallback, useEffect, useState } from "react";
import { AddressLine, Field, Input, Notice, Page } from "@/components/portaj";
import { useSession } from "@/components/providers";
import { TxLink } from "@/components/share";
import { Button, ButtonLink, Eyebrow } from "@/components/ui";
import type { NaiveResult } from "@/lib/api";
import { formatUsdc } from "@/lib/amount";
import { SIMULATOR_DEPOSIT, TEST_USDC_GRANT, txUrl } from "@/lib/config";
import { passkeyError } from "@/lib/format";
import { simulatorMemo } from "@/lib/simulator";

// FR-9 judge onboarding and FR-7 the "before" panel, on testnet.

const CORE_RULE = "https://github.com/stellar/stellar-core/blob/ba6a4e6e322a8069b85bdf48a35d971a2d72cc81/src/transactions/TransactionFrame.cpp";

export function TryView() {
  const { wallet, setWallet } = useSession();
  const [name, setName] = useState("Judge");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ at: string; msg: string } | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [funded, setFunded] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("20");
  const [naive, setNaive] = useState<NaiveResult | null>(null);
  const [noMemo, setNoMemo] = useState<string | null>(null);

  useEffect(() => setMemo(simulatorMemo()), []);

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

  const tryNormal = () =>
    run("before", async () => {
      const { api } = await import("@/lib/api");
      setNaive(await api.before(wallet!.contractId, amount, "id", memo));
    });

  const tryWithoutMemo = () =>
    run("nomemo", async () => {
      const [{ signTransfer }, { api }, { parseUsdc }] = await Promise.all([import("@/lib/wallet"), import("@/lib/api"), import("@/lib/amount")]);
      const a = parseUsdc(amount);
      if (!a.ok) throw new Error(a.error);
      const p = await signTransfer(wallet!, SIMULATOR_DEPOSIT, a.value);
      setNoMemo((await api.relay(p.func, p.auth, "naive")).hash);
      await loadBalance();
    });

  const err = (at: string) => (error?.at === at ? <Notice tone="error">{error.msg}</Notice> : null);
  const exitHref = `/exit?to=${SIMULATOR_DEPOSIT}&memoType=id&memo=${encodeURIComponent(memo)}&amount=${encodeURIComponent(amount)}`;

  return (
    <Page title="Try it on testnet" intro="Create a test passkey wallet, get test USDC, watch the normal way fail, then exit with Portaj. Every step is a real testnet transaction.">
      <Section n={1} title="Create a test smart wallet">
        {wallet ? (
          <div className="space-y-3">
            <AddressLine label="Your smart wallet (passkey-kit)" address={wallet.contractId} />
            {created ? <TxLink href={txUrl(created)} label="Wallet deployment" /> : null}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">A passkey-kit smart wallet on testnet, controlled by a passkey on this device. Portaj pays the deployment.</p>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Name for the passkey">
                <Input value={name} onChange={(e) => setName(e.target.value)} className="font-sans" />
              </Field>
              <Button size="lg" onClick={() => void create()} disabled={!!busy}>
                {busy === "create" ? "Creating…" : "Create a test smart wallet"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Your device asks for the passkey twice: once to make it, once to bind it to the wallet.</p>
          </div>
        )}
        {err("create")}
      </Section>

      <Section n={2} title="Get test USDC">
        <p className="text-sm text-muted-foreground">
          {TEST_USDC_GRANT} Circle testnet USDC from Portaj&apos;s stash, sent to your smart wallet.{" "}
          {balance !== null ? (
            <span className="text-foreground" data-testid="try-balance">
              You hold {formatUsdc(balance)} USDC.
            </span>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void fund()} disabled={!wallet || !!busy}>
            {busy === "fund" ? "Sending…" : "Get test USDC"}
          </Button>
          {funded ? <TxLink href={txUrl(funded)} label="Test USDC transfer" /> : null}
        </div>
        {err("fund")}
      </Section>

      <Section n={3} title="Try the normal way" id="before">
        <p className="text-sm text-muted-foreground">
          Your smart wallet sends USDC to the exchange simulator with the memo attached, the way you would to any exchange.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Memo (ID) from the simulator">
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} />
          </Field>
          <Field label="Amount (USDC)">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </Field>
        </div>
        <Button variant="outline" onClick={() => void tryNormal()} disabled={!wallet || !!busy} data-testid="try-normal">
          {busy === "before" ? "Sending…" : "Send with the memo"}
        </Button>
        {err("before")}
        {naive ? (
          <div className="space-y-3 border border-destructive/50 p-4" data-testid="before-result">
            <Eyebrow>The network&apos;s answers</Eyebrow>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted-foreground">simulateTransaction</dt>
                <dd className="font-mono text-foreground">{naive.simulate}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">sendTransaction</dt>
                <dd className="font-mono text-foreground">
                  {naive.send.status} · {naive.send.code ?? "—"} ({naive.send.xdrCode ?? "—"})
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              Rejected before any signature is checked, so nothing moved and no fee was charged. The rule is stellar-core&apos;s{" "}
              <a href={CORE_RULE} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                TransactionFrame::validateSorobanMemo
              </a>
              , which logs &ldquo;Soroban transactions are not allowed to use memo or muxed source account&rdquo; and marks the transaction malformed.
            </p>
            <div className="border-t border-border pt-3">
              <p className="text-sm text-muted-foreground">Drop the memo and the transfer goes through, but the exchange can&apos;t tell it&apos;s yours, and exchanges don&apos;t credit contract transfers.</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button variant="outline" size="sm" onClick={() => void tryWithoutMemo()} disabled={!!busy || !!noMemo}>
                  {busy === "nomemo" ? "Waiting for your passkey…" : "Send without the memo"}
                </Button>
                {noMemo ? (
                  <>
                    <TxLink href={txUrl(noMemo)} label="It landed on chain" />
                    <ButtonLink href="/exchange" size="sm" variant="link">
                      The simulator didn&apos;t credit it →
                    </ButtonLink>
                  </>
                ) : null}
              </div>
              {err("nomemo")}
            </div>
          </div>
        ) : null}
      </Section>

      <Section n={4} title="Now exit with Portaj">
        <p className="text-sm text-muted-foreground">Same wallet, same address and memo. One passkey prompt, and the simulator credits your memo.</p>
        <ButtonLink href={exitHref} size="lg">
          Exit to the simulator
        </ButtonLink>
      </Section>
    </Page>
  );
}

function Section({ n, title, id, children }: { n: number; title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 space-y-4 border-t border-border pt-8">
      <h2 className="flex items-baseline gap-3 text-lg text-foreground">
        <span className="font-mono text-xs text-muted-foreground">0{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
