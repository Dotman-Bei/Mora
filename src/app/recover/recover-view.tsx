"use client";

import { Keypair } from "@stellar/stellar-sdk";
import { useEffect, useState } from "react";
import { ExitAccountCard, Field, Input, Notice, Page, Receipt, useAccount, type ReceiptData } from "@/components/portaj";
import { useSession } from "@/components/providers";
import { TxLink } from "@/components/share";
import { Button } from "@/components/ui";
import { formatUsdc } from "@/lib/amount";
import { SPONSOR, txUrl } from "@/lib/config";
import { memoLabel, parseDestination, parseMemo } from "@/lib/destination";
import { passkeyError } from "@/lib/format";
import { store, type PendingExit } from "@/lib/store";

// FR-8 and PRD §11: USDC left in an exit account after an interrupted exit.
// Re-derive the account with the same passkey, then resume or return.

export function RecoverView() {
  const { wallet, exit, setExit } = useSession();
  const [kp, setKp] = useState<Keypair | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingExit | null>(null);
  const [to, setTo] = useState("");
  const [memo, setMemo] = useState("");
  const [memoType, setMemoType] = useState<"id" | "text" | "none">("id");
  const [returnTo, setReturnTo] = useState("");
  const [done, setDone] = useState<{ kind: "resume"; receipt: ReceiptData } | { kind: "return"; hash: string } | null>(null);
  const acct = useAccount(kp?.publicKey());

  // Already unlocked in this tab.
  useEffect(() => {
    if (exit?.keypair && !kp) setKp(exit.keypair);
  }, [exit, kp]);

  useEffect(() => {
    if (!kp) return;
    const p = store.pending(kp.publicKey());
    setPending(p);
    if (p) {
      setTo(p.destination);
      setMemo(p.memo);
      setMemoType(p.memoType);
      if (p.returnTo) setReturnTo(p.returnTo);
    }
    if (!returnTo && wallet) setReturnTo(wallet.contractId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kp]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(passkeyError(e));
    } finally {
      setBusy(null);
    }
  }

  const signIn = () =>
    run("passkey", async () => {
      const { unlock } = await import("@/lib/exit");
      const u = await unlock(wallet?.keyId);
      if (!u.keypair) throw new Error("This passkey didn't return a PRF value here, so the exit account can't be derived. If you used a one-time key, open its recovery file below.");
      setKp(u.keypair);
      setExit({ publicKey: u.keypair.publicKey(), credentialId: u.credentialId, keypair: u.keypair, oneTime: false });
    });

  const openFile = (file: File) =>
    run("file", async () => {
      const j = JSON.parse(await file.text()) as { secret?: string; destination?: string };
      if (!j.secret) throw new Error("That isn't a Portaj recovery file.");
      const k = Keypair.fromSecret(j.secret);
      setKp(k);
      if (j.destination) setTo(j.destination);
    });

  const usdc = acct.state?.usdc?.stroops ?? 0n;

  const resume = () =>
    run("resume", async () => {
      if (!kp) return;
      const d = parseDestination(to);
      if (!d.ok) throw new Error(d.error);
      const m = parseMemo(d.value.kind === "M" ? "none" : memoType, d.value.kind === "M" ? "" : memo);
      if (!m.ok) throw new Error(m.error);
      const { payOut } = await import("@/lib/exit");
      const hash = await payOut(kp, d.value, m.value, usdc);
      const r: ReceiptData = { account: kp.publicKey(), destination: d.value.address, memoLabel: memoLabel(d.value, m.value), amount: formatUsdc(usdc), setupHash: pending?.setupHash, inHash: pending?.inHash, outHash: hash };
      store.addReceipt({ ...r, at: Date.now() });
      store.clearPending(kp.publicKey());
      setDone({ kind: "resume", receipt: r });
      acct.refresh();
    });

  const giveBack = () =>
    run("return", async () => {
      if (!kp) return;
      const { returnAll } = await import("@/lib/exit");
      const { hash } = await returnAll(kp, returnTo.trim());
      store.clearPending(kp.publicKey());
      setDone({ kind: "return", hash });
      acct.refresh();
    });

  return (
    <Page title="Recover" intro="If an exit stopped after your USDC reached your exit account, finish it here or send the USDC back to your wallet. Use the passkey and device you started with.">
      {!kp ? (
        <div className="space-y-4">
          <Button size="lg" onClick={() => void signIn()} disabled={!!busy}>
            {busy === "passkey" ? "Waiting for your passkey…" : "Sign in with passkey"}
          </Button>
          <div className="space-y-2 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">Used a one-time key because your passkey had no PRF? Open the recovery file you saved.</p>
            <input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && void openFile(e.target.files[0])} className="min-h-10 text-sm text-muted-foreground file:mr-3 file:h-10 file:border file:border-border file:bg-background file:px-3 file:text-foreground" />
          </div>
        </div>
      ) : (
        <>
          <ExitAccountCard account={kp.publicKey()} state={acct.state} />

          {acct.state && !acct.state.exists ? (
            <Notice tone="warn" title="No exit account for this passkey on testnet">
              If you started on another device, use that one: some authenticators return a different PRF value across devices (Safari&apos;s cross-device flow, for one). Your funds stay safe in the original exit account.
            </Notice>
          ) : null}

          {done?.kind === "resume" ? (
            <Notice tone="ok" title="Exit finished">
              <div className="mt-3">
                <Receipt r={done.receipt} />
              </div>
            </Notice>
          ) : done?.kind === "return" ? (
            <Notice tone="ok" title="Returned to your wallet">
              <TxLink href={txUrl(done.hash)} label="Return transaction" />
            </Notice>
          ) : null}

          {acct.state?.exists && usdc === 0n && !done ? <Notice title="Nothing to recover">Your exit account holds 0 USDC.</Notice> : null}

          {usdc > 0n ? (
            <>
              <section className="space-y-4 border-t border-border pt-6">
                <h2 className="text-lg text-foreground">Resume exit</h2>
                <p className="text-sm text-muted-foreground">Pay the {formatUsdc(usdc)} USDC in your exit account to the exchange, memo attached. Fee paid by Portaj.</p>
                <Field label="Exchange deposit address">
                  <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="G…" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                  <Field label="Memo type">
                    <select value={memoType} onChange={(e) => setMemoType(e.target.value as "id" | "text" | "none")} className="h-11 w-full border border-border bg-background px-3 text-sm">
                      <option value="id">ID</option>
                      <option value="text">Text</option>
                      <option value="none">No memo</option>
                    </select>
                  </Field>
                  <Field label="Memo">
                    <Input value={memo} onChange={(e) => setMemo(e.target.value)} disabled={memoType === "none"} />
                  </Field>
                </div>
                <Button onClick={() => void resume()} disabled={!!busy}>
                  {busy === "resume" ? "Sending…" : "Resume exit"}
                </Button>
              </section>

              <section className="space-y-4 border-t border-border pt-6">
                <h2 className="text-lg text-foreground">Return to my wallet</h2>
                <p className="text-sm text-muted-foreground">Send it back to your smart wallet (C…) or a classic wallet (G…) that has a USDC trustline.</p>
                <Field label="Wallet address">
                  <Input value={returnTo} onChange={(e) => setReturnTo(e.target.value)} placeholder="C… or G…" />
                </Field>
                <Button variant="outline" onClick={() => void giveBack()} disabled={!!busy || !returnTo.trim()}>
                  {busy === "return" ? "Returning…" : "Return to my wallet"}
                </Button>
              </section>
            </>
          ) : null}

          {acct.state?.exists && acct.state.sponsor !== SPONSOR ? <Notice tone="warn">This account isn&apos;t sponsored by Portaj, so Portaj can&apos;t pay its fees.</Notice> : null}
        </>
      )}

      {error ? <Notice tone="error">{error}</Notice> : null}
    </Page>
  );
}
