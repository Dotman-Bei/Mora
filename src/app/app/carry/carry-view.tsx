"use client";

import type { Keypair } from "@stellar/stellar-sdk";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Field, Input, inputClass, Notice, Page, Receipt, receiptUrl, Steps, TransitAccountCard, useAccount, type ReceiptData, type Step } from "@/components/portaj";
import { useSession } from "@/components/providers";
import { Icons } from "@/components/icons";
import { CopyButton, TxLink } from "@/components/share";
import { Button, ButtonLink, Eyebrow } from "@/components/ui";
import { formatUsdc, parseUsdc } from "@/lib/amount";
import type { NaiveResult } from "@/lib/api";
import { IS_TESTNET, NETWORK, SIMULATOR_DEPOSIT, SPONSOR, txUrl } from "@/lib/config";
import { memoLabel, parseDestination, parseMemo, type MemoType } from "@/lib/destination";
import { passkeyError, short } from "@/lib/format";
import { getAccount, type AccountState } from "@/lib/horizon";
import { simulatorMemo } from "@/lib/simulator";
import { store, type WalletRef } from "@/lib/store";

// FR-1 to FR-6: the carry itself. On testnet, FR-7 sits beside it: the normal
// way, refused by the network, next to Portaj's way through.

const CORE_RULE = "https://github.com/stellar/stellar-core/blob/ba6a4e6e322a8069b85bdf48a35d971a2d72cc81/src/transactions/TransactionFrame.cpp";

type Mode = "A" | "B";
type Stage = "form" | "account" | "wait" | "sending" | "done";

export function CarryView() {
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

  // Prefill from a link (the wallet and the simulator send judges here with its details).
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
  if (dest?.ok && destState && !destState.exists) blockers.push(`That address doesn't exist on ${NETWORK.label.toLowerCase()}.`);
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
        // Known transit account, already set up: the transfer-in prompt will derive the key (§10.3).
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
    window.history.replaceState(null, "", receiptUrl(r).replace("/app/receipts", "/app/carry"));
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
          throw new Error("This passkey gave a different transit account, so nothing was sent. Use the passkey this wallet was created with, on the device you started on.");
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
      if (!k) throw new Error("Open Receipts and sign in with your passkey to resume.");
      await finish(k, hashes.in);
    });

  const returnToWallet = () =>
    run("return", async () => {
      const k = kpRef.current;
      if (!k || !wallet) throw new Error("Open Receipts and sign in with your passkey to return the funds.");
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
    { label: "Set up transit account (paid by Portaj)", state: hashes.setup ? "done" : "skipped", detail: hashes.setup ? "Confirmed" : "Already set up", hash: hashes.setup },
    mode === "A"
      ? {
          label: "Smart wallet → transit account",
          state: hashes.in ? "done" : failedAt === "in" ? "failed" : stage === "sending" ? "active" : "idle",
          detail: hashes.in ? "Confirmed" : failedAt === "in" ? "Nothing moved" : stage === "sending" ? "Waiting for your passkey…" : undefined,
          hash: hashes.in,
        }
      : { label: "Your wallet → transit account", state: hashes.in || arrived ? "done" : "active", detail: arrived ? "Arrived" : "Waiting for your transfer…", hash: hashes.in },
    {
      label: `Transit account → exchange, ${dest?.ok && memoParsed.ok ? memoLabel(dest.value, memoParsed.value).toLowerCase() : "memo"}`,
      state: hashes.out ? "done" : failedAt === "out" ? "failed" : hashes.in || (mode === "B" && arrived) ? "active" : "idle",
      detail: hashes.out ? "Confirmed" : failedAt === "out" ? "Failed, your USDC is in your transit account" : hashes.in ? "Sending…" : undefined,
      hash: hashes.out,
    },
  ];

  const fillSimulator = () => {
    setTo(SIMULATOR_DEPOSIT);
    setMemoType("id");
    setMemo(simulatorMemo());
  };

  const done = stage === "done" && receipt;

  const main = done ? (
    <>
      <Receipt r={receipt} />
      <div className="flex flex-wrap gap-3">
        {receipt.destination === SIMULATOR_DEPOSIT && IS_TESTNET ? <ButtonLink href={`/app/exchange?memo=${encodeURIComponent(memo)}`}>See it credited</ButtonLink> : null}
        <CopyButton text={`${window.location.origin}${receiptUrl(receipt)}`} label="Copy receipt link" size="default" />
        <Button
          variant="outline"
          onClick={() => {
            setStage("form");
            setHashes({});
            setReceipt(null);
            setAmount("");
            window.history.replaceState(null, "", "/app/carry");
          }}
        >
          New carry
        </Button>
      </div>
    </>
  ) : (
    <>
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
                Use <span className="text-foreground">Sign in</span> at the top, or{" "}
                <Link href="/app" className="text-foreground underline underline-offset-4">
                  {IS_TESTNET ? "create a test wallet" : "open your wallet"}
                </Link>{" "}
                first. Your wallet lives on another site? Choose <span className="text-foreground">Another wallet</span>.
              </Notice>
            )
          ) : (
            <Notice title="Bring your own smart wallet">
              Passkeys belong to the site that made them, so Portaj can&apos;t sign for your wallet. You&apos;ll send the USDC to your transit account from your own wallet app; Portaj pays it out with the memo.
            </Notice>
          )}

          <div className="space-y-5">
            <Field
              label="Exchange deposit address (G… or M…)"
              error={dest && !dest.ok ? dest.error : null}
              hint={
                IS_TESTNET && to.trim() !== SIMULATOR_DEPOSIT ? (
                  <button type="button" onClick={fillSimulator} className="inline-flex min-h-10 items-center text-left underline-offset-4 hover:text-foreground hover:underline sm:min-h-0">
                    No exchange on testnet? Use the exchange simulator&apos;s address and memo
                  </button>
                ) : null
              }
            >
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
                    {dest.value.address === SIMULATOR_DEPOSIT ? <Chip ok>Exchange simulator</Chip> : null}
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
                <p className="text-xs text-muted-foreground">First time on Portaj? Create a passkey. Use the same device next time: your transit account comes from this passkey.</p>
                <Button variant="outline" disabled={!ready || !!busy} onClick={() => void continueWithPasskey(true)}>
                  Create a passkey
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">One passkey prompt per carry · No XLM · Fees paid by Portaj</p>
            )}
          </div>
        </>
      ) : null}

      {stage !== "form" && account ? (
        <>
          <TransitAccountCard account={account} state={acct.state} />

          {oneTime ? (
            <Notice tone="warn" title="Your passkey can't derive a key on this device">
              <p>
                It didn&apos;t return a PRF value, so Portaj made a one-time key held only in this tab. Keep this page open until the carry finishes: if the tab closes between steps, the USDC sits in an account only that key can move.
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => void saveRecovery()}>
                {savedFile ? "Recovery file saved" : "Download the recovery file"}
              </Button>
            </Notice>
          ) : null}

          {stage === "account" && !accountReady ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">First carry with this passkey: your transit account gets created with 0 XLM and a USDC trustline. Portaj pays the reserves and the fee.</p>
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
                <p className="text-xs text-muted-foreground">Your passkey signs the transfer into your transit account. The payment out follows in the next ledger.</p>
              </div>
            ) : (
              <Button size="lg" disabled={!!busy || needsFile || !kp} onClick={() => setStage("wait")}>
                Continue
              </Button>
            )
          ) : null}

          {stage === "wait" && amt?.ok ? (
            <div className="space-y-4">
              <Notice title={`Send exactly ${formatUsdc(amt.value)} USDC to your transit account from your wallet.`}>
                Use your wallet&apos;s normal send. No memo needed for this leg. Portaj pays the exchange as soon as it arrives.
              </Notice>
              <div className="flex flex-wrap items-center gap-3">
                <CopyButton text={account} label="Copy transit account" size="default" />
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
            <Notice tone="warn" title="Your USDC is safe in your transit account">
              <p>The payment out didn&apos;t go through. Try it again, or send the USDC back to your wallet.</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Button size="sm" onClick={() => void resume()} disabled={!!busy}>
                  {busy === "send" ? "Sending…" : "Resume carry"}
                </Button>
                {mode === "A" && wallet ? (
                  <Button size="sm" variant="outline" onClick={() => void returnToWallet()} disabled={!!busy}>
                    {busy === "return" ? "Returning…" : "Return to my wallet"}
                  </Button>
                ) : (
                  <ButtonLink size="sm" variant="outline" href="/app/receipts#recover">
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
    </>
  );

  // The normal way uses the same details when they point at the simulator.
  const sameAsForm = to.trim() === SIMULATOR_DEPOSIT && memoType === "id" && memoParsed.ok;

  return (
    <Page
      wide
      title={done ? "Sent." : "Carry to an exchange"}
      intro={
        done
          ? "Your USDC reached the exchange as a classic payment with your memo."
          : "Paste the deposit address and memo your exchange shows for Stellar USDC. Portaj carries your USDC through your own transit account and pays the exchange with the memo."
      }
    >
      <div className={`grid gap-14 ${IS_TESTNET ? "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-0" : "max-w-3xl"}`}>
        <section className={`min-w-0 space-y-8 ${IS_TESTNET ? "lg:pr-12" : ""}`} aria-labelledby={IS_TESTNET ? "with-portaj" : undefined}>
          {IS_TESTNET ? <ColumnHead id="with-portaj" tone="delivered" label="With Portaj" note="Classic payment, memo attached" /> : null}
          {main}
        </section>
        {IS_TESTNET ? (
          <aside id="normal-way" className="min-w-0 scroll-mt-36 border-t border-border pt-10 md:scroll-mt-28 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0" aria-labelledby="normal-way-title">
            <NormalWay wallet={wallet} memo={sameAsForm ? memo : null} amount={amt?.ok ? amount : null} onBalance={() => void loadBalance()} />
          </aside>
        ) : null}
      </div>
    </Page>
  );
}

function ColumnHead({ id, tone, label, note }: { id: string; tone: "delivered" | "returned"; label: string; note: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
      <h2 id={id} className="flex items-center gap-2 text-lg text-foreground">
        <span className={`inline-block h-2 w-2 rounded-full ${tone === "delivered" ? "bg-delivered" : "bg-returned"}`} aria-hidden />
        {label}
      </h2>
      <span className="text-xs text-muted-foreground">{note}</span>
    </div>
  );
}

/** FR-7: the smart wallet sends straight to the exchange, memo attached, and the network refuses it. */
function NormalWay({ wallet, memo: formMemo, amount: formAmount, onBalance }: { wallet: WalletRef | null; memo: string | null; amount: string | null; onBalance: () => void }) {
  const [ownMemo, setOwnMemo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [naive, setNaive] = useState<NaiveResult | null>(null);
  const [noMemo, setNoMemo] = useState<string | null>(null);
  useEffect(() => setOwnMemo(simulatorMemo()), []);

  const memo = formMemo ?? ownMemo;
  const amount = formAmount ?? "20";
  // A small amount for the memo-less send: it lands for real and isn't credited.
  const noMemoAmount = "1";

  async function run(at: string, fn: () => Promise<void>) {
    setBusy(at);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(passkeyError(e));
    } finally {
      setBusy(null);
    }
  }

  const tryNormal = () =>
    run("before", async () => {
      const { api } = await import("@/lib/api");
      setNaive(await api.before(wallet!.contractId, amount, "id", memo));
    });

  const tryWithoutMemo = () =>
    run("nomemo", async () => {
      const [{ signTransfer }, { api }] = await Promise.all([import("@/lib/wallet"), import("@/lib/api")]);
      const a = parseUsdc(noMemoAmount);
      if (!a.ok) throw new Error(a.error);
      const p = await signTransfer(wallet!, SIMULATOR_DEPOSIT, a.value);
      setNoMemo((await api.relay(p.func, p.auth, "naive")).hash);
      onBalance();
    });

  return (
    <div className="space-y-6">
      <ColumnHead id="normal-way-title" tone="returned" label="The normal way" note="Smart wallet straight to the exchange" />
      <p className="text-sm text-muted-foreground">
        What a smart wallet does today: a contract transfer to the exchange, memo attached. The network refuses it before any signature is checked, so nothing moves and no fee is charged.
      </p>

      <dl className="border border-border text-sm">
        {(
          [
            ["To", "Exchange simulator"],
            ["Memo", `ID ${memo || "…"}`],
            ["Amount", `${amount} USDC`],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-border px-4 py-2.5 last:border-b-0">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-mono tabular text-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-2">
        <Button variant="outline" size="lg" onClick={() => void tryNormal()} disabled={!wallet || !!busy || !memo} data-testid="try-normal">
          {busy === "before" ? "Sending…" : "Try the normal way"}
        </Button>
        {!wallet ? <p className="text-xs text-muted-foreground">Needs a Portaj wallet. Sign in, or create a test wallet on Wallet.</p> : null}
      </div>

      {naive ? (
        <div className="space-y-3 border border-destructive/50 p-4" data-testid="before-result">
          <Eyebrow>The network&apos;s answers</Eyebrow>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">simulateTransaction</dt>
              <dd className="break-words font-mono text-foreground">{naive.simulate}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">sendTransaction</dt>
              <dd className="font-mono text-foreground">
                {naive.send.status} · {naive.send.code ?? "—"} ({naive.send.xdrCode ?? "—"})
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            The rule is stellar-core&apos;s{" "}
            <a href={CORE_RULE} target="_blank" rel="noreferrer" className="underline underline-offset-4">
              TransactionFrame::validateSorobanMemo
            </a>
            , which logs &ldquo;Soroban transactions are not allowed to use memo or muxed source account&rdquo; and marks the transaction malformed.
          </p>
          <div className="space-y-3 border-t border-border pt-3">
            <p className="text-sm text-muted-foreground">Drop the memo and {noMemoAmount} USDC goes through, but the exchange can&apos;t tell it&apos;s yours, and exchanges don&apos;t credit contract transfers.</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => void tryWithoutMemo()} disabled={!!busy || !!noMemo}>
                {busy === "nomemo" ? "Waiting for your passkey…" : "Send without the memo"}
              </Button>
              {noMemo ? (
                <>
                  <TxLink href={txUrl(noMemo)} label="It landed on chain" />
                  <ButtonLink href="/app/exchange" size="sm" variant="link">
                    The simulator didn&apos;t credit it →
                  </ButtonLink>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 border border-dashed border-border p-4 text-xs text-muted-foreground">
          <Icons.close className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The network&apos;s own answer shows here, verbatim.
        </div>
      )}

      {error ? <Notice tone="error">{error}</Notice> : null}
    </div>
  );
}

function Chip({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <span className={`rounded-full border px-2.5 py-0.5 ${ok ? "border-delivered/40 text-delivered" : "border-waiting/50 text-waiting"}`}>{children}</span>;
}

