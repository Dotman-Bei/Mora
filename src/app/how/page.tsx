import type { Metadata } from "next";
import type { ReactNode } from "react";
import { accountUrl, SIMULATOR_DEPOSIT, SPONSOR, USDC, WALLET_WASM_HASH } from "@/lib/config";

export const metadata: Metadata = {
  title: "How it works",
  description: "Portaj's transactions, key derivation and recovery, with the testnet addresses to check them against.",
};

const FLOW = `1. You paste the exchange address + memo and sign in with a passkey
2. WebAuthn PRF ──► 32 bytes ──► ed25519 key ──► your own G address
3. tx1  Sponsor: BeginSponsoring ─► CreateAccount(G, 0 XLM) ─► ChangeTrust(USDC) ─► EndSponsoring
4. tx2  Smart wallet (C) ── SEP-41 transfer(C ─► G, amount) ──► USDC lands in G
5. tx3  G ── classic Payment(USDC) + memo ──► exchange; the sponsor fee-bumps it
6. Receipt: three explorer links; G holds 0 XLM; its reserves show the sponsor`;

const TXS: [string, string, string][] = [
  ["tx1 · setup (first exit only)", "Sponsor", "beginSponsoringFutureReserves(G) · createAccount(G, 0) · changeTrust(USDC) from G · endSponsoringFutureReserves from G. Signed by the sponsor and by G."],
  ["tx2 · transfer in", "Sponsor (relay)", "One invokeHostFunction: USDC SAC transfer(C, G, amount). Your passkey signs the wallet's auth entry. No memo: the network forbids it here."],
  ["tx3 · payment out", "G, fee-bumped by the sponsor", "One payment(USDC, amount) to the exchange, memo attached (ID or text). G signs the inner transaction; the sponsor's fee bump pays the fee."],
  ["tx4 · return (recovery)", "G, fee-bumped by the sponsor", "SAC transfer(G, C, balance) back to the smart wallet, or a plain USDC payment to a G wallet."],
];

const FAILURES: [string, string][] = [
  ["PRF unsupported", "A one-time key held in the tab. You save a recovery file before any money moves, and keep the page open."],
  ["Sponsor low on funds or rate-limited", "A plain message. Nothing moved."],
  ["tx1 or tx2 fails", "Nothing moved. Try again."],
  ["tx2 lands, tx3 fails", "USDC is in your exit account. Resume the exit, or return it to your wallet."],
  ["Exchange has no USDC trustline", "Blocked before you sign."],
  ["Memo required but missing (SEP-29)", "Blocked before you sign."],
  ["Look-alike USDC", "Only Circle's issuer is accepted."],
  ["Different device, different PRF value", "The derived account won't exist. Use the device you started on; the funds stay in the original account."],
];

export default function HowPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-14 pb-24 pt-28 sm:pt-32">
      <header className="space-y-3">
        <h1 className="font-serif text-3xl sm:text-4xl">How it works</h1>
        <p className="text-sm text-muted-foreground">
          A transfer out of a smart wallet is a contract call, and the network rejects any memo on a contract call. Exchanges also don&apos;t credit contract transfers. So Portaj makes the last leg a classic payment from an account that is yours, created for you with sponsored reserves.
        </p>
      </header>

      <Block title="One flow">
        <pre className="overflow-x-auto border border-border bg-secondary p-4 font-mono text-xs leading-relaxed text-foreground">{FLOW}</pre>
        <p className="text-sm text-muted-foreground">First exit: three transactions. After that: two. USDC sits in your exit account for about one ledger. Portaj never holds your keys or your money; the only server key is the sponsor&apos;s.</p>
      </Block>

      <Block title="Transactions">
        <dl className="border border-border">
          {TXS.map(([name, source, body]) => (
            <div key={name} className="space-y-1 border-b border-border p-4 last:border-b-0">
              <dt className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm text-foreground">{name}</span>
                <span className="text-xs text-muted-foreground">Source: {source}</span>
              </dt>
              <dd className="text-sm text-muted-foreground">{body}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-muted-foreground">
          The sponsor service signs only these shapes. It relays a transfer only when it is a USDC transfer from a C-address into an account it sponsors, refuses any source-account authorization, and fee-bumps only single-operation transactions whose source is an account it sponsors.
        </p>
      </Block>

      <Block title="Your exit account's key">
        <pre className="overflow-x-auto border border-border bg-secondary p-4 font-mono text-xs leading-relaxed text-foreground">{`salt  = SHA-256("portaj:stellar:g-account:v1")      // WebAuthn prf.eval.first
seed  = HKDF-SHA256(ikm  = prf.results.first,
                    salt = "portaj",
                    info = "stellar-ed25519-seed:" + hex(SHA-256(network passphrase)),
                    len  = 32)
G     = Keypair.fromRawEd25519Seed(seed)`}</pre>
        <p className="text-sm text-muted-foreground">
          Same passkey, same G, every time. Testnet and mainnet give different accounts. The seed is computed in your browser and never stored or sent. Every passkey prompt on Portaj asks for the PRF value, so the prompt that signs the transfer in also unlocks the key that signs the payment out: one prompt per exit once your account exists.
        </p>
      </Block>

      <Block title="When something fails">
        <dl className="border border-border">
          {FAILURES.map(([k, v]) => (
            <div key={k} className="grid gap-1 border-b border-border p-4 last:border-b-0 sm:grid-cols-[14rem_1fr] sm:gap-4">
              <dt className="text-sm text-foreground">{k}</dt>
              <dd className="text-sm text-muted-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </Block>

      <Block title="Testnet addresses">
        <dl className="border border-border">
          <Addr label="Sponsor" value={SPONSOR} />
          <Addr label="Exchange simulator deposit" value={SIMULATOR_DEPOSIT} />
          <Addr label="USDC issuer (Circle, testnet)" value={USDC.issuer} />
          <Addr label="USDC contract (SAC)" value={USDC.sac} />
          <div className="space-y-1 p-4">
            <dt className="text-xs text-muted-foreground">Smart wallet WASM (passkey-kit)</dt>
            <dd className="break-all font-mono text-xs text-foreground">{WALLET_WASM_HASH}</dd>
          </div>
        </dl>
      </Block>

      <Block title="Verify it yourself">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            On <span className="text-foreground">Carry</span>, &ldquo;Try the normal way&rdquo; returns the network&apos;s own rejection. It matches stellar-core&apos;s{" "}
            <Ext href="https://github.com/stellar/stellar-core/blob/ba6a4e6e322a8069b85bdf48a35d971a2d72cc81/src/transactions/TransactionFrame.cpp">validateSorobanMemo</Ext> rule.
          </li>
          <li>On stellar.expert, your exit account shows 0 XLM, with the account and trustline reserves sponsored by the address above.</li>
          <li>The payment out carries the memo, goes to the deposit address, and its fee is paid by a fee bump.</li>
          <li>The exchange simulator credits it under your memo. A memo-less or contract transfer shows up as not credited.</li>
        </ol>
      </Block>

      <Block title="Limits">
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Testnet only. No real exchange runs on testnet, so the simulator stands in for one. Real exchanges behave this way per SDF documentation.</li>
          <li>PRF works with iCloud Keychain (Safari 18 / iOS 18+, macOS 15+), Google Password Manager (Chrome 132+), Windows Hello on Windows 11 25H2+, 1Password, YubiKey 5 and Proton Pass. It doesn&apos;t with a Chrome local profile, Bitwarden or Dashlane.</li>
          <li>Safari&apos;s cross-device (QR) flow can return a different PRF value than on-device. Use the device you started on.</li>
          <li>
            A PRF-derived key is a signing key for a transit account that holds funds for one ledger, not an encryption key for data.{" "}
            <Ext href="https://lilting.ch/en/articles/passkeys-prf-extension-encryption-risk">The usual warning</Ext> is about the second.
          </li>
          <li>Exits from your own smart wallet on another site (Another wallet) need you to send the USDC to your exit account yourself.</li>
        </ul>
      </Block>

      <Block title="Sources">
        <ul className="space-y-2 text-sm">
          <li>
            <Ext href="https://developers.stellar.org/docs/build/apps/smart-wallets">SDF smart wallet docs</Ext> <span className="text-muted-foreground">· &ldquo;transfers from contracts are not supported by exchanges today&rdquo;</span>
          </li>
          <li>
            <Ext href="https://github.com/stellar/stellar-protocol/discussions/1950">stellar-protocol #1950</Ext> <span className="text-muted-foreground">· muxed C-addresses, a proposal</span>
          </li>
          <li>
            <Ext href="https://github.com/stellar/stellar-protocol/discussions/1956">stellar-protocol #1956</Ext> <span className="text-muted-foreground">· the trustline and XLM wall</span>
          </li>
          <li>
            <Ext href="https://stellar.org/blog/developers/fixing-memo-less-payments">SEP-29: fixing memo-less payments</Ext>
          </li>
          <li>
            <Ext href="https://github.com/stellar/passkey-kit">passkey-kit</Ext>
          </li>
        </ul>
      </Block>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-serif text-2xl text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Addr({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 border-b border-border p-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>
        <a href={accountUrl(value)} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-foreground underline-offset-4 hover:underline">
          {value}
        </a>
      </dd>
    </div>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-4">
      {children}
    </a>
  );
}
