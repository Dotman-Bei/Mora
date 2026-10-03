"use client";

import {
  accountKey,
  accountState,
  addressKind,
  blockedReason,
  buildClaim,
  buildRefund,
  estimatedFee,
  findAsset,
  findResolution,
  formatAmount,
  needsRestore,
  parseClaimResult,
  parseDoorResult,
  probeNetwork,
  readEntries,
  readiness,
  sentHash,
  shortAddress,
  getParcel,
  type ClaimLinkParams,
  type MoraAsset,
  type MoraNetwork,
  type NetworkProbe,
  type Parcel,
  type Resolution,
} from "mora-sdk";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PaymentCard, StatusMark } from "@/components/payment";
import { useWallet } from "@/components/providers";
import { TxLink } from "@/components/share";
import { Button, ButtonLink, Skeleton } from "@/components/ui";
import { getNetwork } from "@/lib/networks";
import { ledgerDate, reportTx, walletErrorMessage, xlm } from "@/lib/tx";

// The claim page (PRD §6.3). It reads the waiting payment straight from the
// contract, with no index involved, so a link works even if every Mora server
// is down. Phone first.

type Load =
  | { kind: "loading" }
  | { kind: "invalid"; why: string }
  | { kind: "unknown"; why: string }
  | { kind: "empty" }
  | { kind: "resolved"; res: Resolution; probe: NetworkProbe }
  | { kind: "waiting"; parcel: Parcel; probe: NetworkProbe; reason: string };

type Done = { kind: "claimed"; amount: bigint; trustline: boolean; hash?: string } | { kind: "returned"; amount: bigint; hash?: string };

const REASON: Record<string, (code: string) => string> = {
  "wait-no-trustline": (c) => `no ${c} trustline`,
  "wait-not-active": () => "account not active",
  "wait-needs-approval": () => "needs issuer approval",
  "wait-limit": (c) => `${c} limit too low`,
};

export function ClaimView({ params }: { params: Partial<ClaimLinkParams> }) {
  const net = params.network ? getNetwork(params.network) : null;
  const asset = net && params.asset ? findAsset(net, params.asset) : undefined;
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [done, setDone] = useState<Done | null>(null);
  const [nonce, setNonce] = useState(0);

  const valid =
    !!params.from && !!params.to && addressKind(params.from) !== "invalid" && addressKind(params.to) !== "invalid";

  useEffect(() => {
    if (!params.network) return setLoad({ kind: "invalid", why: "This link doesn't say which network it's on." });
    if (!net) return setLoad({ kind: "invalid", why: `Mora isn't live on ${params.network} yet.` });
    if (!valid) return setLoad({ kind: "invalid", why: "This link is incomplete. Ask the sender to copy it again." });
    if (!asset) return setLoad({ kind: "invalid", why: "This link points to an asset Mora doesn't list." });
    let alive = true;
    setLoad({ kind: "loading" });
    (async () => {
      try {
        const key = { from: params.from!, to: params.to!, token: asset.sac };
        const [probe, parcel] = await Promise.all([probeNetwork(net), getParcel(net, key)]);
        if (!alive) return;
        if (parcel) {
          const [r] = await readiness(net, asset, [{ address: key.to, amount: BigInt(parcel.amount) }], probe.baseReserve);
          const why = r && REASON[r.readiness] ? REASON[r.readiness]!(asset.code) : "";
          if (alive) setLoad({ kind: "waiting", parcel, probe, reason: why });
          return;
        }
        const res = await findResolution(net, key);
        if (!alive) return;
        setLoad(res ? { kind: "resolved", res, probe } : { kind: "empty" });
      } catch (e) {
        // Never "nothing here" when we simply couldn't read (PRD §6.3).
        if (alive) setLoad({ kind: "unknown", why: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [net, asset, params.network, params.from, params.to, valid, nonce]);

  return (
    <div className="mx-auto w-full max-w-md space-y-6 pb-24 pt-28 sm:pt-32">
      <header className="space-y-2">
        <h1 className="font-serif text-3xl">{done ? (done.kind === "claimed" ? "It's yours." : "Returned.") : "A payment for you"}</h1>
        {!done && net?.id === "testnet" ? <p className="text-xs text-muted-foreground">Testnet · test assets have no value</p> : null}
      </header>

      {done && net && asset ? (
        <Success done={done} net={net} asset={asset} />
      ) : load.kind === "loading" ? (
        <SkeletonCard />
      ) : load.kind === "invalid" ? (
        <Notice title="This link doesn't work" body={load.why} />
      ) : load.kind === "unknown" ? (
        <div className="border border-border p-6">
          <StatusMark status="unknown" />
          <p className="mt-3 text-sm text-muted-foreground">We couldn&apos;t read the network just now, so we can&apos;t say what&apos;s under this link.</p>
          <Button className="mt-5" variant="outline" onClick={() => setNonce((n) => n + 1)}>
            Try again
          </Button>
        </div>
      ) : load.kind === "empty" ? (
        <Notice title="Nothing is waiting under this link." body="It may have been claimed or returned more than a week ago, or the link may be for a different account." />
      ) : load.kind === "resolved" && net && asset ? (
        <PaymentCard
          status={load.res.type === "returned" ? "returned" : load.res.type === "claimed" ? "claimed" : "delivered"}
          amount={load.res.amount}
          asset={asset}
          from={params.from!}
          to={params.to!}
          footer={<TxLink href={net.explorer.tx(load.res.txHash)} label={load.res.type === "returned" ? "Returned to the sender" : "Claimed by the recipient"} />}
        />
      ) : load.kind === "waiting" && net && asset ? (
        <Waiting
          net={net}
          asset={asset}
          from={params.from!}
          to={params.to!}
          parcel={load.parcel}
          probe={load.probe}
          reason={load.reason}
          onDone={setDone}
        />
      ) : null}
    </div>
  );
}

function Waiting({
  net,
  asset,
  from,
  to,
  parcel,
  probe,
  reason,
  onDone,
}: {
  net: MoraNetwork;
  asset: MoraAsset;
  from: string;
  to: string;
  parcel: Parcel;
  probe: NetworkProbe;
  reason: string;
  onDone: (d: Done) => void;
}) {
  const wallet = useWallet();
  const amount = BigInt(parcel.amount);
  const returnable = probe.ledger > parcel.refund_after;
  const isRecipient = wallet.address === to;

  return (
    <PaymentCard
      status={returnable ? "ready-to-return" : "waiting"}
      reason={returnable ? undefined : reason || undefined}
      amount={amount}
      asset={asset}
      from={from}
      to={to}
      showIssuer
      returnDate={`${returnable ? "Since" : "After"} ${ledgerDate(probe, parcel.refund_after)}`}
    >
      {!wallet.address ? (
        <NoWallet />
      ) : isRecipient ? (
        <ClaimAction net={net} asset={asset} from={from} to={to} probe={probe} onDone={onDone} />
      ) : (
        <p className="text-sm text-muted-foreground">
          This payment is for <span className="font-mono text-foreground">{shortAddress(to)}</span>. Switch to that account in your wallet.{" "}
          <button type="button" className="text-foreground underline underline-offset-4" onClick={() => void wallet.connect()}>
            Switch
          </button>
        </p>
      )}
      {returnable && wallet.address ? <ReturnAction net={net} from={from} to={to} asset={asset} onDone={onDone} /> : null}
    </PaymentCard>
  );
}

function NoWallet() {
  const { connect, connecting } = useWallet();
  return (
    <div className="space-y-3">
      <Button className="w-full" size="lg" onClick={() => void connect()} disabled={connecting}>
        {connecting ? "Connecting…" : "Connect wallet to claim"}
      </Button>
      <p className="text-xs text-muted-foreground">
        No wallet yet?{" "}
        <a className="text-foreground underline underline-offset-4" href="https://lobstr.co" target="_blank" rel="noreferrer">
          Get LOBSTR
        </a>{" "}
        or{" "}
        <a className="text-foreground underline underline-offset-4" href="https://www.freighter.app" target="_blank" rel="noreferrer">
          Freighter
        </a>
        , then come back to this link.
      </p>
    </div>
  );
}

type Prep =
  | { kind: "checking" }
  | { kind: "inactive"; need: bigint }
  | { kind: "blocked"; text: string }
  | { kind: "restore" }
  | { kind: "ready"; trustline: boolean; fee: bigint; run: () => Promise<void> }
  | { kind: "error"; text: string };

/** Simulate first; ask for a signature only when the simulation says Claimed (PRD §7 B.3). */
function ClaimAction({
  net,
  asset,
  from,
  to,
  probe,
  onDone,
}: {
  net: MoraNetwork;
  asset: MoraAsset;
  from: string;
  to: string;
  probe: NetworkProbe;
  onDone: (d: Done) => void;
}) {
  const wallet = useWallet();
  const [prep, setPrep] = useState<Prep>({ kind: "checking" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const prepare = useCallback(async () => {
    setPrep({ kind: "checking" });
    try {
      const acct = accountState((await readEntries(net, [accountKey(to)])).get(accountKey(to).toXDR("base64")), probe.baseReserve);
      if (!acct.exists) {
        // An account needs 2 reserves to exist, one more for the trustline, plus fees.
        const need = (asset.issuer ? 3n : 2n) * probe.baseReserve + 1_000_000n;
        return setPrep({ kind: "inactive", need });
      }
      const caller = { publicKey: to, signTransaction: wallet.signTransaction };
      const tx = await buildClaim(net, caller, { from, to, token: asset.sac });
      if (needsRestore(tx)) return setPrep({ kind: "restore" });
      const r = parseClaimResult(tx.result);
      if (r.status === "empty") return setPrep({ kind: "blocked", text: "Nothing is waiting under this link any more." });
      if (r.status === "blocked") {
        let text = blockedReason(r.code, asset.code);
        if (r.code === 14 || r.code === 15) {
          const short = probe.baseReserve + estimatedFee(tx) - acct.free;
          if (short > 0n) text += ` Add at least ${xlm(short)} to your account, then come back.`;
        }
        return setPrep({ kind: "blocked", text });
      }
      setPrep({
        kind: "ready",
        trustline: r.trustlineCreated,
        fee: estimatedFee(tx),
        run: async () => {
          const sent = await tx.signAndSend();
          const hash = sentHash(sent);
          reportTx(net.id, hash);
          const out = parseClaimResult(sent.result);
          if (out.status !== "claimed") throw new Error(blockedReason(out.status === "blocked" ? out.code : 0, asset.code));
          onDone({ kind: "claimed", amount: out.amount, trustline: out.trustlineCreated, hash });
        },
      });
    } catch (e) {
      setPrep({ kind: "error", text: walletErrorMessage(e) });
    }
  }, [net, asset, from, to, probe.baseReserve, wallet.signTransaction, onDone]);

  useEffect(() => {
    void prepare();
  }, [prepare]);

  if (prep.kind === "checking") return <p className="text-sm text-muted-foreground">Checking your account…</p>;
  if (prep.kind === "inactive")
    return (
      <p className="text-sm text-muted-foreground">
        Your account isn&apos;t active on the network yet. Send it at least <span className="text-foreground">{xlm(prep.need)}</span> from
        another wallet or an exchange, then come back to this link.
      </p>
    );
  if (prep.kind === "blocked" || prep.kind === "error")
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{prep.text}</p>
        <Button variant="outline" size="sm" onClick={() => void prepare()}>
          Check again
        </Button>
      </div>
    );
  if (prep.kind === "restore")
    return (
      <p className="text-sm text-muted-foreground">
        This payment&apos;s storage has been archived. Claiming it first needs a small restore fee and one extra signature.{" "}
        <RestoreClaim net={net} asset={asset} from={from} to={to} onDone={onDone} />
      </p>
    );

  return (
    <div className="space-y-3">
      {prep.trustline ? (
        <p className="text-sm text-muted-foreground">
          Claiming adds {asset.code} to your wallet. Stellar sets aside {xlm(probe.baseReserve)} of your balance while {asset.code} stays
          added.
        </p>
      ) : null}
      <Button
        size="lg"
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            await prep.run();
          } catch (e) {
            setErr(walletErrorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Waiting for your wallet…" : "Claim"}
      </Button>
      <p className="text-xs text-muted-foreground">One signature · network fee about {xlm(prep.fee)}</p>
      {err ? <p className="text-sm text-destructive">{err}</p> : null}
    </div>
  );
}

function RestoreClaim({ net, asset, from, to, onDone }: { net: MoraNetwork; asset: MoraAsset; from: string; to: string; onDone: (d: Done) => void }) {
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={busy}
        className="text-foreground underline underline-offset-4"
        onClick={async () => {
          setBusy(true);
          try {
            const tx = await buildClaim(net, { publicKey: to, signTransaction: wallet.signTransaction }, { from, to, token: asset.sac }, { restore: true });
            const sent = await tx.signAndSend();
            const out = parseClaimResult(sent.result);
            reportTx(net.id, sentHash(sent));
            if (out.status === "claimed") onDone({ kind: "claimed", amount: out.amount, trustline: out.trustlineCreated, hash: sentHash(sent) });
          } catch (e) {
            setErr(walletErrorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Restoring…" : "Restore and claim"}
      </button>
      {err ? <span className="block text-destructive">{err}</span> : null}
    </>
  );
}

/** After the return date, anyone can send it back to the sender (PRD §7 C). */
function ReturnAction({ net, from, to, asset, onDone }: { net: MoraNetwork; from: string; to: string; asset: MoraAsset; onDone: (d: Done) => void }) {
  const wallet = useWallet();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="space-y-2 border-t border-border pt-4">
      <p className="text-xs text-muted-foreground">The return date has passed. Anyone can send this back to {shortAddress(from)}.</p>
      <Button
        variant="outline"
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const caller = { publicKey: wallet.address!, signTransaction: wallet.signTransaction };
            let tx = await buildRefund(net, caller, { from, to, token: asset.sac });
            if (needsRestore(tx)) tx = await buildRefund(net, caller, { from, to, token: asset.sac }, { restore: true });
            const sent = await tx.signAndSend();
            reportTx(net.id, sentHash(sent));
            const out = parseDoorResult(sent.result);
            if (out.status === "moved") onDone({ kind: "returned", amount: out.amount, hash: sentHash(sent) });
            else if (out.status === "still-blocked") setErr(`The sender can't receive it right now (code ${out.code}).`);
            else setErr("Nothing is waiting under this link any more.");
          } catch (e) {
            setErr(walletErrorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Waiting for your wallet…" : "Return to sender"}
      </Button>
      {err ? <p className="text-sm text-destructive">{err}</p> : null}
    </div>
  );
}

function Success({ done, net, asset }: { done: Done; net: MoraNetwork; asset: MoraAsset }) {
  return (
    <div className="space-y-6">
      <div className="border border-border p-6">
        <StatusMark status={done.kind === "claimed" ? "claimed" : "returned"} />
        <p className="mt-4 font-mono tabular text-5xl">
          {formatAmount(done.amount)} <span className="text-muted-foreground text-2xl">{asset.code}</span>
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          {done.kind === "claimed"
            ? done.trustline
              ? `${asset.code} was added to your wallet, and the money is in it.`
              : "The money is in your wallet."
            : "The payment went back to its sender."}
        </p>
        {done.hash ? (
          <div className="mt-4">
            <TxLink href={net.explorer.tx(done.hash)} />
          </div>
        ) : null}
      </div>
      {/* The growth loop (PRD §5), one quiet line, never a pop-up. */}
      {done.kind === "claimed" ? (
        <p className="text-sm text-muted-foreground">
          <Link href="/send" className="text-foreground underline-offset-4 hover:underline">
            Pay your own people with Mora →
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="space-y-5 border border-border p-6" aria-busy aria-label="Loading payment">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-12 w-48" />
      <Skeleton className="h-4 w-32" />
      <div className="space-y-3 pt-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-3 border border-border p-6">
      <p className="text-base text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      <ButtonLink href="/inbox" variant="outline" size="sm">
        Check for payments
      </ButtonLink>
    </div>
  );
}
