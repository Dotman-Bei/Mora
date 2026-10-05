import type { Metadata } from "next";
import Link from "next/link";
import { deployments } from "../../../deployments";
import testnetRaw from "../../../deployments/testnet.json";
import { Rule, Section, SectionHeader } from "@/components/ui";
import { CodeBlock } from "./code-block";
import { LiveConfig } from "./live-config";

export const metadata: Metadata = {
  title: "Integrate",
  description: "Send through Mora instead of a plain transfer. Your users' failed payments become waiting payments that claim in Mora.",
};

// Both snippets below are run, not just written (PRD §19 M6):
// contracts/partner-example (tests + deployed on testnet) and
// examples/sdk-send.mts (run against testnet).

const RUST_BEFORE = `token::Client::new(&e, &token).transfer(&from, &to, &amount);`;
const RUST_AFTER = `MoraClient::new(&e, &mora).send(&from, &token, &to, &amount, &refund_after);`;

const RUST_FULL = `use soroban_sdk::{contractclient, contracttype, Address, Env};

#[contracttype]
pub enum Outcome { Delivered, Parked(u32) }

#[contractclient(name = "MoraClient")]
pub trait MoraInterface {
    fn send(e: Env, from: Address, token: Address, to: Address,
            amount: i128, refund_after: u32) -> Outcome;
}

pub fn pay(e: Env, from: Address, token: Address, to: Address,
           amount: i128, refund_after: u32) -> Outcome {
    from.require_auth();
    let mora: Address = /* Mora's contract ID for this network */;
    MoraClient::new(&e, &mora).send(&from, &token, &to, &amount, &refund_after)
}`;

const TS = `import { buildSend, claimLink, ledgerAfter, networkFromDeployment,
         parseOutcome, probeNetwork } from "mora-sdk";

const net = networkFromDeployment(deployment, [rpcUrl]);
const probe = await probeNetwork(net);

const tx = await buildSend(net, { publicKey: from, signTransaction }, {
  from, token, to, amount: 10_000_000n,           // 1 unit, 7 decimals
  refundAfter: ledgerAfter(probe, 7 * 86400),      // about 7 days
});
tx.result;                                         // simulated outcome
const sent = await tx.signAndSend();

if (parseOutcome(sent.result).status === "waiting") {
  share(claimLink({ network: net.id, from, to, asset: token }));
}`;

const LINK = `https://mora-chi.vercel.app/claim?network=testnet
  &from=<sender G… or C…>
  &to=<recipient G… or C…>
  &asset=<the asset's SAC contract ID>`;

const API = [
  ["GET", "/api/v1/parcels?network=&to=&cursor=", "Waiting payments for a recipient"],
  ["GET", "/api/v1/parcels?network=&from=&cursor=", "Payments sent by an address (optional &status=)"],
  ["GET", "/api/v1/stats?network=", "Counts: delivered, waited, claimed, returned"],
  ["POST", "/api/v1/ingest", "{ network, txHash }: index a confirmed transaction (idempotent)"],
  ["GET", "/api/v1/sync?network=", "Pull new events since the cursor (rate limited)"],
  ["POST", "/api/v1/faucet", "{ address }: testnet only, 100 TESTUSD through Mora"],
];

export default function IntegratePage() {
  const nets = [deployments.mainnet, deployments.testnet].filter(Boolean) as NonNullable<typeof deployments.mainnet>[];
  const partner = (testnetRaw as { partnerExample?: { contractId: string } }).partnerExample;

  return (
    <>
      {/* Feature-page hero (frontend.md §6.10). */}
      <section className="relative -mx-4 overflow-hidden px-4">
        <div className="grid-pattern absolute inset-0 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent)] dark:opacity-[0.12]" aria-hidden />
        <div className="relative mx-auto max-w-[1400px] pb-20 pt-36 text-center sm:pt-44">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Integrate</p>
          <h1 className="mt-6 font-serif text-4xl leading-tight sm:text-7xl xl:text-8xl">Send it once.</h1>
          <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground lg:text-lg">
            For wallets and payout apps. Swap a transfer for a send, and your users&apos; payments stop failing because the other side wasn&apos;t ready.
          </p>
        </div>
      </section>

      <Section>
        <SectionHeader title="What your users get" />
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["No failed runs", "A recipient without the trustline no longer aborts the batch. That payment waits; everyone else is paid."],
            ["A claim page you don't build", "Recipients open a Mora link, sign once, and the asset and the money arrive together."],
            ["One shared inbox", "Payments from every app that uses Mora show up in the same place for the recipient."],
          ].map(([t, b]) => (
            <div key={t} className="space-y-2 border border-border p-6">
              <p className="text-base text-foreground sm:text-lg">{t}</p>
              <p className="text-sm text-muted-foreground">{b}</p>
            </div>
          ))}
        </div>
      </Section>

      <Rule />
      <Section>
        <SectionHeader title="The one-line change" subtitle="For contracts. Mora pulls the amount once and either delivers it or holds it under (from, to, token)." />
        <div className="mx-auto max-w-3xl space-y-4">
          <CodeBlock label="Before" code={RUST_BEFORE} />
          <CodeBlock label="After" code={RUST_AFTER} />
          <CodeBlock label="Full example (Rust, soroban-sdk 28)" code={RUST_FULL} />
          <p className="text-sm text-muted-foreground">
            Take <span className="text-foreground">refund_after</span> from your caller. If your contract derives it from the current ledger, the
            payer&apos;s authorization, recorded during simulation, won&apos;t match when the transaction applies.
          </p>
          {partner ? (
            <p className="text-sm text-muted-foreground">
              Running on testnet as{" "}
              <a className="font-mono text-foreground underline-offset-4 hover:underline" href={`https://stellar.expert/explorer/testnet/contract/${partner.contractId}`} target="_blank" rel="noreferrer">
                {partner.contractId}
              </a>
              . Its payments land in the same Mora inbox.
            </p>
          ) : null}
        </div>
      </Section>

      <Rule />
      <Section>
        <SectionHeader title="For apps: mora-sdk" subtitle="The package the Mora app is built on. Build, simulate, sign with any Stellar wallet, and get a claim link for anything that waits." />
        <div className="mx-auto max-w-3xl space-y-4">
          <CodeBlock label="TypeScript" code={TS} />
          <p className="text-sm text-muted-foreground">
            Also: <span className="text-foreground">readiness()</span> for the preview chips, <span className="text-foreground">buildSendMany</span>,{" "}
            <span className="text-foreground">buildClaim</span>, <span className="text-foreground">buildRefund</span>,{" "}
            <span className="text-foreground">getParcel</span>, <span className="text-foreground">probeNetwork</span>. npm publication is coming;
            until then it lives in the repository under packages/mora-sdk.
          </p>
        </div>
      </Section>

      <Rule />
      <Section id="contracts">
        <SectionHeader title="Contract IDs" subtitle="One contract per network, shared by everyone. No admin, no upgrade path, no fee." />
        <div className="mx-auto max-w-3xl space-y-4">
          {nets.map((d) => (
            <div key={d.network} className="border border-border">
              <div className="flex items-center justify-between border-b border-border px-5 py-3">
                <p className="text-sm text-foreground">{d.network === "mainnet" ? "Mainnet beta" : "Testnet"}</p>
                <LiveConfig network={d.network} />
              </div>
              <dl className="divide-y divide-border px-5 text-sm">
                <div className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between">
                  <dt className="text-muted-foreground">Contract</dt>
                  <dd>
                    <a
                      className="break-all font-mono text-foreground underline-offset-4 hover:underline"
                      href={`https://stellar.expert/explorer/${d.network === "mainnet" ? "public" : "testnet"}/contract/${d.mora.contractId}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {d.mora.contractId}
                    </a>
                  </dd>
                </div>
                <div className="flex justify-between py-3">
                  <dt className="text-muted-foreground">grace_ledgers</dt>
                  <dd className="font-mono tabular">{d.mora.constructor.grace_ledgers.toLocaleString()}</dd>
                </div>
                <div className="flex justify-between py-3">
                  <dt className="text-muted-foreground">max_items per call</dt>
                  <dd className="font-mono tabular">{d.mora.constructor.max_items}</dd>
                </div>
                <div className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between">
                  <dt className="text-muted-foreground">Assets</dt>
                  <dd>{d.assets.map((a) => a.code + (a.test ? " (test)" : "")).join(" · ")}</dd>
                </div>
              </dl>
            </div>
          ))}
          {!deployments.mainnet ? (
            <p className="text-sm text-muted-foreground">Mora runs on Stellar testnet. Mainnet comes after an audit.</p>
          ) : null}
        </div>
      </Section>

      <Rule />
      <Section id="links">
        <SectionHeader title="Claim links" subtitle="Send your users straight to Mora. Everything needed is in the link, so it works even if Mora's servers are down." />
        <div className="mx-auto max-w-3xl space-y-4">
          <CodeBlock label="Format" code={LINK} />
          <p className="text-sm text-muted-foreground">
            Or call <span className="text-foreground">claimLink()</span> from mora-sdk.{" "}
            <Link href="/inbox" className="text-foreground underline-offset-4 hover:underline">
              The inbox
            </Link>{" "}
            lists everything waiting for an address across apps.
          </p>
        </div>
      </Section>

      <Rule />
      <Section id="api">
        <SectionHeader title="Public read API" subtitle="So wallets can show “you have payments waiting”. Results come from Mora's index: confirm each with the contract's parcel() before showing an amount." />
        <div className="mx-auto max-w-3xl border border-border">
          {API.map(([m, p, d]) => (
            <div key={p} className="grid gap-1 border-b border-border px-5 py-3 last:border-b-0 sm:grid-cols-[4rem_1fr]">
              <span className="text-xs text-muted-foreground">{m}</span>
              <div>
                <p className="break-all font-mono text-sm text-foreground">{p}</p>
                <p className="text-sm text-muted-foreground">{d}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-4 max-w-3xl text-xs text-muted-foreground">Every list is paginated with a cursor and rate limited.</p>
      </Section>

      <Rule />
      <Section>
        <SectionHeader title="Limits" />
        <ul className="mx-auto max-w-2xl space-y-3 border border-border bg-secondary p-6 text-sm">
          {[
            ["Stellar Asset Contract tokens only.", "Waiting depends on SAC error codes, and claiming uses SAC trust."],
            ["No memos.", "Soroban transactions can't carry them. Mora's app blocks addresses that require one (SEP-29); the contract can't, so check before you send."],
            ["Unaudited.", "Testnet only for now. Mainnet follows an audit, with payments capped in the app at first."],
            ["Immutable.", "A bug means a new deployment, announced on this page."],
          ].map(([t, b]) => (
            <li key={t}>
              <span className="text-foreground">{t}</span> <span className="text-muted-foreground">{b}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
