# Decisions

Where the network, the installed libraries, or `frontend.md` disagreed with the
PRD, the network wins. Each entry says what was found, where, and what was done.

## D-001 · stellar-sdk 16.3.1, not 17.2.1

PRD §9 names `@stellar/stellar-sdk` 17.2.1. passkey-kit 0.19.1 (the current
release, built for the v0.17.0+ smart wallet with WASM hash `97ce0478…a764e`)
declares `@stellar/stellar-sdk ^16.3.0` as a peer and passes SDK 16 XDR objects
across its API. Mixing majors gives two XDR registries. **Done:** the app uses
16.3.1, one copy in the tree.

## D-002 · The memo rejection shown is what RPC returns

PRD FR-7.2 quotes stellar-core's diagnostic, "Soroban transactions are not
allowed to use memo or muxed source account". Over Stellar RPC on testnet
(protocol 29) that string is not returned:

- `simulateTransaction`: `Transaction contains a memo. Soroban transactions do not support memos.`
- `sendTransaction`: status `ERROR`, result `txMalformed` (-16), fee charged 0,
  no diagnostic events.

**Done:** the before panel shows both real responses verbatim and cites
`TransactionFrame::validateSorobanMemo` (stellar-core `ba6a4e6e`) as the rule
behind them, with the core string quoted as the rule's log text. The naive
attempt is built by the sponsor with the wallet's transfer and the memo; the
memo check runs before authorization, so it needs no passkey signature and
nothing can move.

## D-003 · Test USDC comes from the testnet DEX, not faucet.circle.com

FR-9.2 funds the stash from Circle's faucet, which is captcha-gated and can't be
scripted. Testnet has a Circle USDC order book. **Done:** `scripts/setup-testnet.mjs`
buys the stash with a strict-send path payment (3,600 XLM → 3,364 USDC on
2026-10-09). Same issuer, same asset.

## D-004 · One prompt per exit, two on the very first

§10.3 asks for one ceremony that signs tx2 and yields PRF. tx2's auth payload
contains G, so G must be known before that ceremony. **Done:** every WebAuthn
call on the page carries the PRF extension (a wrapper on
`navigator.credentials`), and G's public key is remembered per passkey in the
browser. First exit: one prompt derives G (needed to co-sign tx1), one signs
tx2. Every later exit: one prompt; the PRF output from the tx2 signature is
derived and checked against the remembered G before tx2 is relayed. On a
mismatch nothing is sent. The e2e test asserts the single prompt.

## D-005 · No separate connect ceremony after creating or re-opening a wallet

`kit.connectWallet` always runs a proof ceremony. For a wallet this browser
created and verified (`confirmWalletCreation`), Portaj points the kit at it
directly; the next signature is checked by the wallet contract on chain. Sign-in
from another browser still uses `connectWallet` with the public passkey indexer.

## D-006 · Wallet deploys and tx2 go through Portaj's sponsor, not a relayer service

passkey-kit's server path expects the OpenZeppelin Channels relayer. The
`{func, auth}` shape works with any fee payer. **Done:** the sponsor builds the
envelope around the passkey-signed host function, simulates, and submits. It
accepts only a USDC SAC `transfer` from a C-address into an account it sponsors,
or a `createContractV2` of the passkey-kit wallet WASM, and refuses any
source-account authorization, so nothing can spend as the sponsor.

## D-007 · Frontend: frontend.md overrides the PRD's visual notes

Kept from the earlier build, by the owner's instruction to keep the present
frontend. Amounts use `font-mono` (mapped to the sans face) with tabular
figures; no brand accent; colour appears only in product UI (status dots).

## D-008 · Logo

Same mark geometry as before (14×12 grid: rail, block, rail), now read as the
portage: the water left, the load carried overland, the water reached. Colour
version uses the Waiting colour (`#884c07` / `#f5b13d`) in the favicon, app icon
and social card; the header keeps the one-colour mark. Wordmark: `portaj`.

## D-009 · Landing hero: the Halide design, as given (owner's choice)

The Halide hero stays as the owner chose it (dark ground in both themes,
Syncopate, orange accent, grain, angled CTA), scoped under `.halide-body`, with
Portaj's copy in its slots and the CTA linking to /exit. One CTA in the hero;
"Try it on testnet" sits under the first section.

## D-010 · Rate limits fall back to memory

FR-3.4 limits run on a Supabase table (`portaj_rate`). Without Supabase
configured, or before the migration runs, they count per serverless instance,
which is weaker but never unlimited. On-chain checks hold regardless: one
account per derived G, and the sponsor refuses below a 20 XLM floor.
