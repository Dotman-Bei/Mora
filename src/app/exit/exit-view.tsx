"use client";

import type { Keypair } from "@stellar/stellar-sdk";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExitAccountCard, Field, Input, inputClass, Notice, Page, Receipt, receiptUrl, Steps, useAccount, type ReceiptData, type Step } from "@/components/portaj";
import { useSession } from "@/components/providers";
import { CopyButton } from "@/components/share";
import { Button, ButtonLink, Eyebrow } from "@/components/ui";
import { formatUsdc, parseUsdc } from "@/lib/amount";
import { SIMULATOR_DEPOSIT, SPONSOR, txUrl } from "@/lib/config";
import { memoLabel, parseDestination, parseMemo, type MemoType } from "@/lib/destination";
import { passkeyError, short } from "@/lib/format";
import { getAccount, type AccountState } from "@/lib/horizon";
import { store } from "@/lib/store";

type Mode = "A" | "B";
type Stage = "form" | "account" | "wait" | "sending" | "done";

export function ExitView() {
  const session = useSession();
  const { wallet, exit, setExit } = session;

  const [mode, setMode] = useState<Mode>("A");
  const [to, setTo] = useState("");
  const [memoType, setMemoType] = useState<MemoType>("id");
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("");

  const [stage, setStage] = useState<Stage>("form");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kp, setKp] = useState<Keypair | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [credentialId, setCredentialId] = useState<string | undefined>();
  const [oneTime, setOneTime] = useState(false);
  const [savedFile, setSavedFile] = useState(false);
  const [hashes, setHashes] = useState<{ setup?: string; in?: string; out?: string }>({});
  const [failedAt, setFailedAt] = useState<"in" | "out" | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const kpRef = useRef<Keypair | null>(null);

  // Prefill from a link (/try sends judges here with the simulator's details).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("to")) setTo(q.get("to")!);
    if (q.get("memo")) setMemo(q.get("memo")!);
    const mt = q.get("memoType");
    if (mt === "id" || mt === "text" || mt === "none") setMemoType(mt);
    if (q.get("amount")) setAmount(q.get("amount")!);
    if (q.get("mode") === "b" || window.location.hash === "#another-wallet") setMode("B");
  }, []);

  // ----- validation (FR-1) -----
  const dest = useMemo(() => (to.trim() ? parseDestination(to) : null), [to]);
  const memoParsed = useMemo(() => parseMemo(dest?.ok && dest.value.kind === "M" ? "none" : memoType, dest?.ok && dest.value.kind === "M" ? "" : memo), [dest, memoType, memo]);
  const amt = useMemo(() => (amount.trim() ? parseUsdc(amount) : null), [amount]);

  const [destState, setDestState] = useState<AccountState | null>(null);
  const [destErr, setDestErr] = useState<string | null>(null);
  useEffect(() => {
    setDestState(null);
    setDestErr(null);
    if (!dest?.ok) return;
    let alive = true;
    const t = setTimeout(() => {
      getAccount(dest.value.account)
        .then((a) => alive && setDestState(a))
        .catch((e) => alive && setDestErr(e instanceof Error ? e.message : String(e)));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [dest]);

  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);
  const loadBalance = useCallback(async () => {
    if (!wallet) return setWalletBalance(null);
    try {
      const { contractUsdcBalance } = await import("@/lib/wallet");
      setWalletBalance(await contractUsdcBalance(wallet.contractId));
    } catch {
      setWalletBalance(null);
    }
  }, [wallet]);
  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  // Field-level problems show under their field; these are the rest.
  const blockers: string[] = [];
  if (dest?.ok && destState && !destState.exists) blockers.push("That address doesn't exist on testnet.");
  if (dest?.ok && destState?.exists && !destState.usdc) blockers.push("That address has no USDC trustline, so it can't receive USDC.");
  const memoMissing = dest?.ok && dest.value.kind !== "M" && memoType === "none";
  if (memoMissing && destState?.memoRequired) blockers.push("This exchange requires a memo (SEP-29). Add the memo it showed you.");
  if (mode === "A" && amt?.ok && walletBalance !== null && amt.value > walletBalance) blockers.push(`Your wallet holds ${formatUsdc(walletBalance)} USDC.`);
  const ready = !!(dest?.ok && destState?.exists && destState.usdc && memoParsed.ok && amt?.ok && blockers.length === 0 && (mode === "B" || wallet));

  // ----- exit account (FR-2, FR-3) -----
  const acct = useAccount(account, stage === "wait" ? 4000 : 0);

  function adopt(k: Keypair | null, cred: string | undefined, isOneTime = false) {
    kpRef.current = k;
    setKp(k);
    setCredentialId(cred);
    setOneTime(isOneTime);
    if (k) {
      setAccount(k.publicKey());
      setExit({ publicKey: k.publicKey(), credentialId: cred ?? "one-time", keypair: k, oneTime: isOneTime });
    }
  }

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

  const continueWithPasskey = (create = false) =>
    run("passkey", async () => {
      const ex = await import("@/lib/exit");
      if (mode === "A") {
        if (!wallet) throw new Error("Sign in with your Portaj wallet first.");
        // Already unlocked in this tab for this passkey.
        if (exit?.keypair && exit.credentialId === wallet.keyId) {
          adopt(exit.keypair, wallet.keyId);
          return setStage("account");
        }
        // Known exit account, already set up: the transfer-in prompt will derive the key (§10.3).
        const known = store.exitFor(wallet.keyId);
        if (known) {
          const a = await getAccount(known);
          if (a.exists && a.usdc && a.sponsor === SPONSOR) {
            setAccount(known);
            setCredentialId(wallet.keyId);
            return setStage("account");
          }
        }
        const u = await ex.unlock(wallet.keyId);
        if (u.keypair) adopt(u.keypair, u.credentialId);
        else adopt(ex.oneTimeKey(), u.credentialId, true);
      } else {
        const u = create ? await ex.createPasskey() : await ex.unlock();
        if (u.keypair) adopt(u.keypair, u.credentialId);
        else adopt(ex.oneTimeKey(), u.credentialId, true);
      }
      setStage("account");
    });

  const setUp = () =>
    run("setup", async () => {
      const ex = await import("@/lib/exit");
      let k = kpRef.current;
      if (!k) {
        const u = await ex.unlock(credentialId);
        if (!u.keypair) throw new Error("This passkey didn't return its PRF output. Try again on the device you started on.");
        adopt(u.keypair, u.credentialId);
        k = u.keypair;
      }
      const hash = await ex.ensureSetup(k, oneTime ? undefined : credentialId);
      setHashes((h) => ({ ...h, setup: hash }));
      acct.refresh();
    });

  const saveRecovery = async () => {
    const ex = await import("@/lib/exit");
    if (!kp) return;
    ex.downloadRecoveryFile(kp, { destination: to.trim(), memo: memoParsed.ok ? memoLabel(dest?.ok ? dest.value : null, memoParsed.value) : "", amount });
    setSavedFile(true);
  };

  function pending(extra: Partial<ReturnType<typeof store.pending>> = {}) {
    if (!account) return;
    store.setPending({
      account,
      destination: to.trim(),
      memoType,
      memo,
      amount,
      returnTo: mode === "A" ? wallet?.contractId : undefined,
      setupHash: hashes.setup,
      inHash: hashes.in,
      startedAt: Date.now(),
      ...extra,
    });
  }

  async function finish(k: Keypair, inHash: string | undefined) {
    if (!dest?.ok || !memoParsed.ok || !amt?.ok) return;
    const ex = await import("@/lib/exit");
    setFailedAt(null);
    const out = await ex.payOut(k, dest.value, memoParsed.value, amt.value).catch((e) => {
      setFailedAt("out");
      throw e;
    });
    setHashes((h) => ({ ...h, out }));
    const r: ReceiptData = {
      account: k.publicKey(),
      destination: dest.value.address,
      memoLabel: memoLabel(dest.value, memoParsed.value),
      amount: formatUsdc(amt.value),
      setupHash: hashes.setup,
      inHash,
      outHash: out,
    };
    store.addReceipt({ ...r, at: Date.now() });
    store.clearPending(k.publicKey());
    setReceipt(r);
    setStage("done");
    window.history.replaceState(null, "", receiptUrl(r).replace("/receipt", "/exit"));
    void loadBalance();
  }

  // Mode A: tx2 then tx3.
  const send = () =>
    run("send", async () => {
      if (!wallet || !account || !amt?.ok) return;
      const [{ signTransfer }, { lastPrf }, { deriveExitKeypair }, { NETWORK }] = await Promise.all([
        import("@/lib/wallet"),
        import("@/lib/webauthn"),
        import("@/lib/derive"),
        import("@/lib/config"),
      ]);
      setStage("sending");
      setFailedAt(null);
      const t0 = Date.now();
      let payload: { func: string; auth: string[] };
      try {
        payload = await signTransfer(wallet, account, amt.value);
      } catch (e) {
        setFailedAt("in");
        throw e;
      }
      // The same prompt returned the PRF output: derive and check it's this account before anything moves.
      let k = kpRef.current;
      if (!k) {
        const c = lastPrf();
        if (c?.first && c.at >= t0) k = await deriveExitKeypair(c.first, NETWORK.passphrase);
        if (!k || k.publicKey() !== account) {
          const ex = await import("@/lib/exit");
          const u = await ex.unlock(wallet.keyId);
          k = u.keypair;
        }
        if (!k || k.publicKey() !== account) {
          setFailedAt("in");
          throw new Error("This passkey gave a different exit account, so nothing was sent. Use the passkey this wallet was created with, on the device you started on.");
        }
        adopt(k, wallet.keyId);
      }
      pending();
      const { api } = await import("@/lib/api");
      let inHash: string;
      try {
        inHash = (await api.relay(payload.func, payload.auth)).hash;
      } catch (e) {
        setFailedAt("in");
        throw e;
      }
      setHashes((h) => ({ ...h, in: inHash }));
      pending({ inHash });
      await finish(k, inHash);
    });

  // Mode B: wait for the user's own transfer, then tx3.
  const arrived = stage === "wait" && amt?.ok && (acct.state?.usdc?.stroops ?? 0n) >= amt.value;
  const firing = useRef(false);
  useEffect(() => {
    if (!arrived || firing.current || !kp) return;
    firing.current = true;
    void run("send", async () => {
      const ex = await import("@/lib/exit");
      setStage("sending");
      const inHash = await ex.findIncoming(kp.publicKey());
      setHashes((h) => ({ ...h, in: inHash }));
      pending({ inHash });
      await finish(kp, inHash);
    }).finally(() => (firing.current = false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrived, kp]);

  const resume = () =>
    run("send", async () => {
      const k = kpRef.current;
      if (!k) throw new Error("Open Recover and sign in with your passkey to resume.");
      await finish(k, hashes.in);
    });

  const returnToWallet = () =>
    run("return", async () => {
      const k = kpRef.current;
      if (!k || !wallet) throw new Error("Open Recover and sign in with your passkey to return the funds.");
      const ex = await import("@/lib/exit");
      const r = await ex.returnAll(k, wallet.contractId);
      store.clearPending(k.publicKey());
      setError(null);
      setFailedAt(null);
      setReturned(r.hash);
      acct.refresh();
      void loadBalance();
    });
  const [returned, setReturned] = useState<string | null>(null);

  // ----- render -----
  const accountReady = !!acct.state?.exists && !!acct.state.usdc && acct.state.sponsor === SPONSOR;
  const needsFile = oneTime && !savedFile;

  const steps: Step[] = [
    { label: "Set up exit account (paid by Portaj)", state: hashes.setup ? "done" : "skipped", detail: hashes.setup ? "Confirmed" : "Already set up", hash: hashes.setup },
    mode === "A"
      ? {
          label: "Smart wallet → exit account",
          state: hashes.in ? "done" : failedAt === "in" ? "failed" : stage === "sending" ? "active" : "idle",
          detail: hashes.in ? "Confirmed" : failedAt === "in" ? "Nothing moved" : stage === "sending" ? "Waiting for your passkey…" : undefined,
          hash: hashes.in,
        }
      : { label: "Your wallet → exit account", state: hashes.in || arrived ? "done" : "active", detail: arrived ? "Arrived" : "Waiting for your transfer…", hash: hashes.in },
    {
      label: `Exit account → exchange, ${dest?.ok && memoParsed.ok ? memoLabel(dest.value, memoParsed.value).toLowerCase() : "memo"}`,
      state: hashes.out ? "done" : failedAt === "out" ? "failed" : hashes.in || (mode === "B" && arrived) ? "active" : "idle",
      detail: hashes.out ? "Confirmed" : failedAt === "out" ? "Failed, your USDC is in your exit account" : hashes.in ? "Sending…" : undefined,
      hash: hashes.out,
    },
  ];

  if (stage === "done" && receipt) {
    return (
      <Page title="Sent." intro="Your USDC reached the exchange as a classic payment with your memo.">
        <Receipt r={receipt} />
        <div className="flex flex-wrap gap-3">
          {receipt.destination === SIMULATOR_DEPOSIT ? <ButtonLink href={`/exchange?memo=${encodeURIComponent(memo)}`}>See it credited</ButtonLink> : null}
          <CopyButton text={`${window.location.origin}${receiptUrl(receipt)}`} label="Copy receipt link" size="default" />
          <Button
            variant="outline"
            onClick={() => {
              setStage("form");
              setHashes({});
              setReceipt(null);
              setAmount("");
              window.history.replaceState(null, "", "/exit");
            }}
          >
            New exit
          </Button>
        </div>
      </Page>
    );
  }

  return (
    <Page title="Exit to an exchange" intro="Paste the deposit address and memo your exchange shows for Stellar USDC. Portaj carries your USDC through your own exit account and pays the exchange with the memo.">
      {stage === "form" ? (
        <>
          <div className="inline-flex border border-border text-sm" role="radiogroup" aria-label="Where your USDC is" id="another-wallet">
            {(
              [
                ["A", "Wallet on Portaj"],
                ["B", "Another wallet"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={`h-10 px-4 transition-colors ${mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "A" ? (
            wallet ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border border-border p-4 text-sm">
                <span className="text-muted-foreground">
                  From <span className="font-mono text-foreground">{short(wallet.contractId)}</span>
                </span>
                <span className="font-mono tabular text-foreground" data-testid="wallet-balance">
                  {walletBalance === null ? "…" : `${formatUsdc(walletBalance)} USDC`}
                </span>
              </div>
            ) : (
              <Notice title="Sign in with your Portaj smart wallet">
                Use <span className="text-foreground">Sign in with passkey</span> at the top, or{" "}
                <Link href="/try" className="text-foreground underline underline-offset-4">
                  create a test wallet
                </Link>{" "}
                first. Your wallet lives on another site? Choose <span className="text-foreground">Another wallet</span>.
              </Notice>
            )
          ) : (
            <Notice title="Bring your own smart wallet">
              Passkeys belong to the site that made them, so Portaj can&apos;t sign for your wallet. You&apos;ll send the USDC to your exit account from your own wallet app; Portaj pays it out with the memo.
            </Notice>
          )}

          <div className="space-y-5">
            <Field label="Exchange deposit address (G… or M…)" error={dest && !dest.ok ? dest.error : null}>
              <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="G…" name="destination" />
            </Field>
            {dest?.ok ? (
              <div className="flex flex-wrap gap-2 text-xs">
                {destErr ? <span className="text-destructive">{destErr}</span> : null}
                {destState ? (
                  <>
                    <Chip ok={destState.exists}>{destState.exists ? "Account exists" : "Account not found"}</Chip>
                    {destState.exists ? <Chip ok={!!destState.usdc}>{destState.usdc ? "Can receive USDC" : "No USDC trustline"}</Chip> : null}
                    {destState.memoRequired ? <Chip ok={!memoMissing}>Memo required (SEP-29)</Chip> : null}
                    {dest.value.kind === "M" ? <Chip ok>Muxed ID {dest.value.muxedId} is the memo</Chip> : null}
                  </>
                ) : (
                  <span className="text-muted-foreground">Checking the address…</span>
                )}
              </div>
            ) : null}

            {dest?.ok && dest.value.kind === "M" ? null : (
              <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                <Field label="Memo type">
                  <select value={memoType} onChange={(e) => setMemoType(e.target.value as MemoType)} className={`${inputClass} font-sans`} name="memoType">
                    <option value="id">ID</option>
                    <option value="text">Text</option>
                    <option value="none">No memo</option>
                  </select>
                </Field>
                <Field label="Memo" error={memoType !== "none" && memo && !memoParsed.ok ? memoParsed.error : null}>
                  <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={memoType === "id" ? "1234567" : memoType === "text" ? "As shown by the exchange" : "—"} disabled={memoType === "none"} name="memo" />
                </Field>
              </div>
            )}

            <Field label="Amount (USDC, up to 7 decimals)" error={amt && !amt.ok ? amt.error : null}>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="20" className="tabular" name="amount" />
            </Field>
          </div>

          {blockers.length ? (
            <ul className="space-y-1">
              {[...new Set(blockers)].map((b) => (
                <li key={b} className="text-sm text-destructive">
                  {b}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="space-y-3">
            <Button size="lg" disabled={!ready || !!busy} onClick={() => void continueWithPasskey()}>
              {busy === "passkey" ? "Waiting for your passkey…" : "Continue with passkey"}
            </Button>
            {mode === "B" ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">First time on Portaj? Create a passkey. Use the same device next time: your exit account comes from this passkey.</p>
                <Button variant="outline" disabled={!ready || !!busy} onClick={() => void continueWithPasskey(true)}>
                  Create a passkey
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">One passkey prompt per exit · No XLM · Fees paid by Portaj</p>
            )}
          </div>
        </>
      ) : null}

      {stage !== "form" && account ? (
        <>
          <ExitAccountCard account={account} state={acct.state} />

          {oneTime ? (
            <Notice tone="warn" title="Your passkey can't derive a key on this device">
              <p>
                It didn&apos;t return a PRF value, so Portaj made a one-time key held only in this tab. Keep this page open until the exit finishes: if the tab closes between steps, the USDC sits in an account only that key can move.
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void saveRecovery()}>
                {savedFile ? "Recovery file saved" : "Download the recovery file"}
              </Button>
            </Notice>
          ) : null}

          {stage === "account" && !accountReady ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">First exit with this passkey: your exit account gets created with 0 XLM and a USDC trustline. Portaj pays the reserves and the fee.</p>
              <Button size="lg" disabled={!!busy || needsFile || !acct.state} onClick={() => void setUp()}>
                {busy === "setup" ? "Setting up…" : "Set up (paid by Portaj)"}
              </Button>
            </div>
          ) : null}

          {stage === "account" && accountReady ? (
            mode === "A" ? (
              <div className="space-y-3">
                <Steps steps={steps} />
                <Button size="lg" disabled={!!busy || needsFile} onClick={() => void send()} data-testid="send">
                  {busy === "send" ? "Waiting for your passkey…" : `Send ${amt?.ok ? formatUsdc(amt.value) : ""} USDC`}
                </Button>
                <p className="text-xs text-muted-foreground">Your passkey signs the transfer into your exit account. The payment out follows in the next ledger.</p>
              </div>
            ) : (
              <Button size="lg" disabled={!!busy || needsFile || !kp} onClick={() => setStage("wait")}>
                Continue
              </Button>
            )
          ) : null}

          {stage === "wait" && amt?.ok ? (
            <div className="space-y-4">
              <Notice title={`Send exactly ${formatUsdc(amt.value)} USDC to your exit account from your wallet.`}>
                Use your wallet&apos;s normal send. No memo needed for this leg. Portaj pays the exchange as soon as it arrives.
              </Notice>
              <div className="flex flex-wrap items-center gap-3">
                <CopyButton text={account} label="Copy exit account" size="default" />
                <CopyButton text={formatUsdc(amt.value)} label="Copy amount" size="default" />
              </div>
              <p className="font-mono text-sm text-foreground" aria-live="polite">
                Arrived: {acct.state?.usdc ? formatUsdc(acct.state.usdc.stroops) : "0.0000000"} / {formatUsdc(amt.value)} USDC
              </p>
              <Steps steps={steps} />
            </div>
          ) : null}

          {stage === "sending" ? <Steps steps={steps} /> : null}

          {failedAt === "out" ? (
            <Notice tone="warn" title="Your USDC is safe in your exit account">
              <p>The payment out didn&apos;t go through. Try it again, or send the USDC back to your wallet.</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Button size="sm" onClick={() => void resume()} disabled={!!busy}>
                  {busy === "send" ? "Sending…" : "Resume exit"}
                </Button>
                {mode === "A" && wallet ? (
                  <Button size="sm" variant="outline" onClick={() => void returnToWallet()} disabled={!!busy}>
                    {busy === "return" ? "Returning…" : "Return to my wallet"}
                  </Button>
                ) : (
                  <ButtonLink size="sm" variant="outline" href="/recover">
                    Return to my wallet
                  </ButtonLink>
                )}
              </div>
            </Notice>
          ) : null}

          {returned ? (
            <Notice tone="ok" title="Returned to your wallet">
              <a className="underline underline-offset-4" href={txUrl(returned)} target="_blank" rel="noreferrer">
                View the return transaction
              </a>
            </Notice>
          ) : null}

          {stage !== "sending" ? (
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => {
                setStage("form");
                setError(null);
              }}
              disabled={!!busy}
            >
              ← Change the details
            </button>
          ) : null}
        </>
      ) : null}

      {error ? (
        <Notice tone="error" title={failedAt === "in" ? "Nothing moved" : "That didn't work"}>
          {error}
        </Notice>
      ) : null}

      <div className="border-t border-border pt-6">
        <Eyebrow>Testnet</Eyebrow>
        <p className="mt-2 text-sm text-muted-foreground">
          No real exchange runs on testnet. Use the{" "}
          <Link href="/exchange" className="text-foreground underline underline-offset-4">
            exchange simulator
          </Link>
          &apos;s deposit address and a memo to see a deposit credited.
        </p>
      </div>
    </Page>
  );
}

function Chip({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <span className={`rounded-full border px-2.5 py-0.5 ${ok ? "border-delivered/40 text-delivered" : "border-waiting/50 text-waiting"}`}>{children}</span>;
}
