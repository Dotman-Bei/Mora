"use client";

import { Address, Asset, BASE_FEE, Contract, Keypair, nativeToScVal, Operation, rpc, TransactionBuilder, xdr } from "@stellar/stellar-sdk";
import { basicNodeSigner } from "@stellar/stellar-sdk/contract";
import {
  buildClaim,
  buildRefund,
  buildSendMany,
  claimLink,
  formatAmount,
  ledgerAfter,
  parseClaimResult,
  parseDoorResult,
  parseOutcome,
  probeNetwork,
  RpcPool,
  sentHash,
  shortAddress,
  waitingReason,
  type MoraNetwork,
} from "mora-sdk";
import { useEffect, useState } from "react";
import { StatusMark, type Status } from "@/components/payment";
import { TxLink } from "@/components/share";
import { Button } from "@/components/ui";
import { getNetwork } from "@/lib/networks";
import { testnetExtras } from "../../../deployments";
import { reportTx, walletErrorMessage } from "@/lib/tx";

// A guided walkthrough on testnet for anyone without a wallet (PRD §6.8).
// Keys live only in this component's memory and are labelled as demo keys.
// Every step is a real testnet transaction with a link. Nothing is simulated
// for show.

type Log = { text: string; status?: Status; reason?: string; hash?: string; link?: string };
type Keys = { you: Keypair; ready: Keypair; noTrust: Keypair; inactive: Keypair };

const DEMO_AMOUNT = 100_000_000n; // 10 TESTUSD
const RETURN_SECONDS = 5 * 60;

export function TryView() {
  const net = getNetwork("testnet") as MoraNetwork;
  const testusd = net.assets.find((a) => a.code === "TESTUSD")!;
  // Memory only: never written to storage, gone when the tab closes.
  const [keys, setKeys] = useState<Keys | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Log[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refundAfter, setRefundAfter] = useState<number | null>(null);
  const [ledger, setLedger] = useState<number | null>(null);

  const add = (l: Log) => setLog((x) => [...x, l]);
  const signer = (kp: Keypair) => ({ publicKey: kp.publicKey(), signTransaction: basicNodeSigner(kp, net.passphrase).signTransaction });
  const pool = RpcPool.for(net);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setStep((s) => s + 1);
    } catch (e) {
      setError(walletErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function fund(kp: Keypair) {
    await pool.call((s) => s.requestAirdrop(kp.publicKey()));
  }

  async function addTrustline(kp: Keypair) {
    await pool.call(async (s) => {
      const acct = await s.getAccount(kp.publicKey());
      const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: net.passphrase })
        .addOperation(Operation.changeTrust({ asset: new Asset(testusd.code, testusd.issuer!) }))
        .setTimeout(60)
        .build();
      tx.sign(kp);
      const sent = await s.sendTransaction(tx);
      if (sent.status === "ERROR") throw new Error("Couldn't add TESTUSD to the demo recipient.");
      const done = await s.pollTransaction(sent.hash, { attempts: 20 });
      if (done.status !== "SUCCESS") throw new Error("Couldn't add TESTUSD to the demo recipient.");
    });
  }

  // Step 0: create and fund demo keys.
  const start = () =>
    run(async () => {
      const k: Keys = { you: Keypair.random(), ready: Keypair.random(), noTrust: Keypair.random(), inactive: Keypair.random() };
      setKeys(k);
      await Promise.all([fund(k.you), fund(k.ready), fund(k.noTrust)]);
      await addTrustline(k.ready);
      add({ text: `Created demo keys. You are ${shortAddress(k.you.publicKey())}, funded by Friendbot.` });
    });

  // Step 1: get TESTUSD from the faucet, which pays through Mora, then claim it.
  const faucet = () =>
    run(async () => {
      const k = keys!;
      const r = await fetch("/api/v1/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: k.you.publicKey() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Faucet unavailable");
      add({ text: "The faucet paid you 100 TESTUSD through Mora. You hadn't added TESTUSD, so it's waiting.", status: "waiting", reason: "no TESTUSD trustline", hash: j.txHash });
      const tx = await buildClaim(net, signer(k.you), { from: testnetExtras.faucet.account, to: k.you.publicKey(), token: testusd.sac });
      const sent = await tx.signAndSend();
      const out = parseClaimResult(sent.result);
      if (out.status !== "claimed") throw new Error("The claim was blocked.");
      reportTx(net.id, sentHash(sent));
      add({ text: `You claimed ${formatAmount(out.amount)} TESTUSD with one signature${out.trustlineCreated ? ". TESTUSD was added to your account in the same transaction" : ""}.`, status: "claimed", hash: sentHash(sent) });
    });

  // Step 2: the same payout without Mora (demo-only baseline-payout contract,
  // PRD §10.2): plain SAC transfers, so one unready recipient fails the run.
  const withoutMora = () =>
    run(async () => {
      const k = keys!;
      const payees = xdr.ScVal.scvVec(
        [k.ready, k.noTrust, k.inactive].map((kp) =>
          nativeToScVal(
            { amount: nativeToScVal(DEMO_AMOUNT, { type: "i128" }), to: Address.fromString(kp.publicKey()) },
            { type: { amount: ["symbol", null], to: ["symbol", null] } },
          ),
        ),
      );
      const op = new Contract(testnetExtras.baselinePayout.contractId).call(
        "pay_all",
        Address.fromString(k.you.publicKey()).toScVal(),
        Address.fromString(testusd.sac).toScVal(),
        payees,
      );
      const sim = await pool.call(async (s) => {
        const acct = await s.getAccount(k.you.publicKey());
        const tx = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: net.passphrase }).addOperation(op).setTimeout(60).build();
        return s.simulateTransaction(tx);
      });
      if (!rpc.Api.isSimulationError(sim)) throw new Error("Expected the plain payout to fail, and it didn't.");
      add({ text: "Without Mora: the same payout with plain transfers. The network refused the whole run because one recipient couldn't receive TESTUSD. 0 of 3 paid." });
    });

  // Step 3: pay three demo recipients, two of them not ready.
  const pay = () =>
    run(async () => {
      const k = keys!;
      const probe = await probeNetwork(net);
      const rf = ledgerAfter(probe, RETURN_SECONDS);
      const payees = [k.ready, k.noTrust, k.inactive].map((kp) => ({ to: kp.publicKey(), amount: DEMO_AMOUNT }));
      const tx = await buildSendMany(net, signer(k.you), { from: k.you.publicKey(), token: testusd.sac, payees, refundAfter: rf });
      const sent = await tx.signAndSend();
      const hash = sentHash(sent);
      reportTx(net.id, hash);
      setRefundAfter(rf);
      const labels = ["Ready recipient", "Recipient without TESTUSD", "Recipient whose account isn't active"];
      add({ text: "You paid three people 10 TESTUSD each with one signature.", hash });
      sent.result.map(parseOutcome).forEach((o, i) => {
        add({
          text: `${labels[i]} (${shortAddress(payees[i]!.to)})`,
          status: o.status === "delivered" ? "delivered" : "waiting",
          // The inactive account reads as code 13 for credit assets (D-002).
          reason: o.status === "waiting" ? (i === 2 ? "account not active" : waitingReason(o.code, "TESTUSD")) : undefined,
          link: o.status === "waiting" ? claimLink({ network: "testnet", from: k.you.publicKey(), to: payees[i]!.to, asset: testusd.sac }, window.location.origin) : undefined,
        });
      });
    });

  // Step 4: switch to the recipient without TESTUSD and claim.
  const claimAsRecipient = () =>
    run(async () => {
      const k = keys!;
      const tx = await buildClaim(net, signer(k.noTrust), { from: k.you.publicKey(), to: k.noTrust.publicKey(), token: testusd.sac });
      const sent = await tx.signAndSend();
      const out = parseClaimResult(sent.result);
      if (out.status !== "claimed") throw new Error("The claim was blocked.");
      reportTx(net.id, sentHash(sent));
      add({ text: `As ${shortAddress(k.noTrust.publicKey())}, you claimed ${formatAmount(out.amount)} TESTUSD. One signature added TESTUSD and paid it.`, status: "claimed", hash: sentHash(sent) });
    });

  // Step 5: after the 5-minute window, return the payment nobody claimed.
  const returnIt = () =>
    run(async () => {
      const k = keys!;
      const tx = await buildRefund(net, signer(k.you), { from: k.you.publicKey(), to: k.inactive.publicKey(), token: testusd.sac });
      const sent = await tx.signAndSend();
      const out = parseDoorResult(sent.result);
      if (out.status !== "moved") throw new Error("Nothing to return.");
      reportTx(net.id, sentHash(sent));
      add({ text: `Nobody claimed the last one, so it came back to you: ${formatAmount(out.amount)} TESTUSD.`, status: "returned", hash: sentHash(sent) });
    });

  // Watch the ledger during the return window.
  useEffect(() => {
    if (step !== 5 || refundAfter === null) return;
    let alive = true;
    const tick = async () => {
      try {
        const l = await pool.call((s) => s.getLatestLedger());
        if (alive) setLedger(l.sequence);
      } catch {}
    };
    void tick();
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [step, refundAfter, pool]);

  const ledgersLeft = refundAfter !== null && ledger !== null ? Math.max(0, refundAfter - ledger + 1) : null;
  const steps = [
    { title: "Create demo keys", body: "Two minutes, no wallet. Keys live only in this tab.", action: start, cta: "Start" },
    { title: "Get TESTUSD from the faucet", body: "The faucet pays through Mora. You don't have TESTUSD yet, so it will wait for you, and you'll claim it.", action: faucet, cta: "Get 100 TESTUSD" },
    {
      title: "Without Mora",
      body: "First, pay three people with plain transfers, the way most payout contracts do. Demo-only contract.",
      action: withoutMora,
      cta: "Try the plain payout",
    },
    { title: "With Mora: pay the same three", body: "One has TESTUSD, one doesn't, one's account isn't active. One signature, and the return window is 5 minutes.", action: pay, cta: "Send 10 TESTUSD each" },
    { title: "Switch to a recipient and claim", body: "Become the recipient without TESTUSD and claim with one signature.", action: claimAsRecipient, cta: "Claim as recipient" },
    {
      title: "Wait, then return the unclaimed one",
      body: ledgersLeft === null ? "Checking the network…" : ledgersLeft > 0 ? `Return opens in about ${ledgersLeft} ledgers (≈ ${Math.ceil(ledgersLeft * 5 / 60)} min).` : "The return date has passed. Anyone can send it back.",
      action: returnIt,
      cta: "Return to sender",
      disabled: (ledgersLeft ?? 1) > 0,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 pb-24 pt-28 sm:pt-32">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Try it · Testnet</p>
        <h1 className="font-serif text-3xl sm:text-5xl">Every outcome, in six steps.</h1>
        <p className="text-sm text-muted-foreground">Real testnet transactions, each with a link. TESTUSD is a test asset with no value.</p>
      </header>

      {keys ? (
        <p className="border border-waiting/40 px-4 py-2 text-xs text-waiting">Demo keys. This tab only. Testnet.</p>
      ) : null}

      <ol className="border border-border">
        {steps.map((s, i) => (
          <li key={s.title} className={`flex flex-col gap-3 border-b border-border p-5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between ${i === step ? "" : "opacity-60"}`}>
            <div className="flex gap-4">
              <span className={`mt-1.5 h-2 w-2 shrink-0 ${i < step ? "bg-delivered" : i === step ? "bg-foreground" : "bg-muted-foreground"}`} aria-hidden />
              <div>
                <p className="text-base text-foreground">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.body}</p>
              </div>
            </div>
            {i === step ? (
              <Button onClick={() => void s.action()} disabled={busy || s.disabled} className="shrink-0">
                {busy ? "Working…" : s.cta}
              </Button>
            ) : i < step ? (
              <span className="text-xs text-muted-foreground">Done</span>
            ) : null}
          </li>
        ))}
      </ol>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {step >= steps.length ? <p className="text-base text-foreground">That&apos;s Mora: delivered, waiting, claimed, returned. Nothing failed.</p> : null}

      {log.length ? (
        <ul className="space-y-3 border-t border-border pt-6" aria-live="polite">
          {log.map((l, i) => (
            <li key={i} className="space-y-1 text-sm">
              <p className="text-foreground">{l.text}</p>
              <div className="flex flex-wrap items-center gap-4">
                {l.status ? <StatusMark status={l.status} reason={l.reason} className="text-xs" /> : null}
                {l.hash ? <TxLink href={net.explorer.tx(l.hash)} /> : null}
                {l.link ? (
                  <a href={l.link} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                    Claim link
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
