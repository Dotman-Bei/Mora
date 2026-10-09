# Portaj

Portaj lets a passkey smart-wallet user send USDC to any exchange deposit address with its memo, through their own passkey-derived Stellar account created with sponsored reserves, so they need no XLM and no seed phrase.

**Live (testnet):** https://mora-chi.vercel.app · **Track:** General · Find Your Way hackathon (Stellar Passport)

## The claim

> With Portaj, a smart-wallet user's USDC cannot be stranded for lack of a memo, a trustline or XLM.

A transfer out of a smart wallet (a C-address) is a contract call, and the network rejects any memo on it (stellar-core [`validateSorobanMemo`](https://github.com/stellar/stellar-core/blob/ba6a4e6e322a8069b85bdf48a35d971a2d72cc81/src/transactions/TransactionFrame.cpp)). Exchanges need the memo, and per [SDF's smart-wallet docs](https://developers.stellar.org/docs/build/apps/smart-wallets) "transfers from contracts are not supported by exchanges today". A classic wallet would fix that, but it needs XLM for its reserve and trustline before it can hold USDC.

### Verify it yourself

1. Open [/try](https://mora-chi.vercel.app/try): create a test passkey wallet, get test USDC, press **Send with the memo**. The network answers `Transaction contains a memo. Soroban transactions do not support memos.` (simulation) and `txMalformed` (-16) (submission).
2. Press **Exit to the simulator**. One passkey prompt later you get three explorer links.
3. On stellar.expert your exit account shows 0 XLM, with account and trustline reserves sponsored by `GAD3TLO2X27OQROVNDWKBMKZF5XFBMKZMN6GJMX6UAVR2FXSBWO4THCA`.
4. The payment out carries the memo, goes to the deposit address, and its fee is paid by a fee bump.
5. [/exchange](https://mora-chi.vercel.app/exchange) credits it under your memo. The memo-less contract transfer from step 1 is listed as not credited.

## How it works

```
1. User pastes exchange address + memo, signs in with a passkey on Portaj
2. WebAuthn PRF ──► 32 bytes ──► ed25519 key ──► the user's own G address
3. Sponsor tx: BeginSponsoring ─► CreateAccount(G, 0 XLM) ─► ChangeTrust(USDC) ─► EndSponsoring
4. Smart wallet (C) ──SEP-41 transfer(C ─► G, amount)──► USDC lands in G
5. G ──classic Payment(USDC) + memo──► exchange deposit address; sponsor fee-bumps the tx
6. Receipt page: three explorer links; G native balance 0; reserves show the sponsor
```

First exit: three transactions, two passkey prompts. Every later exit: two transactions, one prompt. USDC sits in G for about a ledger. Portaj never holds user keys or funds; the only server key is the sponsor's.

**Two modes.** *Wallet on Portaj*: a passkey-kit wallet created on Portaj; Portaj signs the C → G transfer. *Another wallet*: passkeys belong to the site that made them, so the user sends USDC to their exit account from their own wallet app, and Portaj pays it out with the memo.

### Transactions

| | Source | Operations | Signed by |
|---|---|---|---|
| tx1 setup (first run) | Sponsor | `beginSponsoringFutureReserves(G)` · `createAccount(G, 0)` · `changeTrust(USDC)` from G · `endSponsoringFutureReserves` from G | Sponsor + G |
| tx2 transfer in | Sponsor (relay) | `invokeHostFunction`: USDC SAC `transfer(C, G, amount)`, no memo | Passkey signs C's auth entry; sponsor signs the envelope |
| tx3 payment out | G, fee bump by sponsor | `payment(USDC, amount)` to the exchange, memo ID or text | G (inner) + sponsor (fee bump) |
| tx4 return | G, fee bump by sponsor | SAC `transfer(G, C, balance)`, or a USDC payment to a G wallet | G + sponsor |

The sponsor service (`src/lib/server/sponsor.ts`) signs only these shapes: it relays a transfer only if it is a USDC transfer from a C-address into an account it sponsors, refuses any source-account authorization, and fee-bumps only single-operation transactions whose source is an account it sponsors. Rate limits per IP and per passkey credential; refuses below a 20 XLM floor.

### Key derivation

```
salt = SHA-256("portaj:stellar:g-account:v1")          // prf.eval.first, on every ceremony
seed = HKDF-SHA256(ikm = prf.results.first, salt = "portaj",
                   info = "stellar-ed25519-seed:" + hex(SHA-256(networkPassphrase)), 32)
G    = Keypair.fromRawEd25519Seed(seed)
```

Computed in the browser, never stored or sent. Same passkey → same G; testnet and mainnet differ. If the authenticator has no PRF, Portaj uses a one-time key held in the tab and makes the user save a recovery file before anything moves.

### Recovery

| Failure | Handling |
|---|---|
| PRF unsupported | One-time key; recovery file first; keep the page open |
| Sponsor low or rate-limited | Plain message, nothing moved |
| tx1 or tx2 fails | Nothing moved; retry |
| tx2 lands, tx3 fails | **Resume exit** or **Return to my wallet** (on the screen, or at /recover) |
| Exchange has no USDC trustline | Blocked before signing |
| SEP-29 memo required, memo missing | Blocked before signing |
| Look-alike USDC | Only Circle's issuer accepted |
| Different device, different PRF | Derived account doesn't exist; use the original device |

## Testnet addresses

| | |
|---|---|
| Sponsor | `GAD3TLO2X27OQROVNDWKBMKZF5XFBMKZMN6GJMX6UAVR2FXSBWO4THCA` |
| Exchange simulator deposit (`config.memo_required = 1`) | `GCMGLKBKAKL7G6XTSWPQN56MMR4KCSTMNBSSUK3IRAKSJWUA6JV4AYE4` |
| USDC issuer (Circle) | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
| USDC SAC | `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` |
| passkey-kit wallet WASM | `97ce047884106b1c6c3bb40b8973cc48db1c4dad95c9e20462bf2c701daa764e` |

## Limits

- **Testnet only.** No real exchange runs on testnet; the simulator credits only classic USDC payments with a memo. Real exchanges behave this way per SDF documentation.
- **PRF support.** Works: iCloud Keychain (Safari 18 / iOS 18+, macOS 15+), Google Password Manager (Chrome 132+), Windows Hello (Windows 11 25H2+), 1Password, YubiKey 5, Proton Pass. Doesn't: Chrome local profile, Bitwarden, Dashlane.
- **Safari cross-device** (QR) can return a different PRF value than on-device. Use the device you started on.
- The PRF-derived key signs for a transit account holding funds for one ledger; it is not used to encrypt data ([the usual warning](https://lilting.ch/en/articles/passkeys-prf-extension-encryption-risk) is about that).

## Run it

```bash
pnpm install
pnpm setup:testnet        # sponsor + USDC stash + simulator; writes src/lib/testnet.json and .env.local
pnpm dev                  # http://localhost:3000

pnpm test                 # unit tests (amounts, addresses, memos, key derivation)
node e2e/live.mjs         # full flow in Chrome with a virtual PRF passkey, real testnet
node e2e/api.mjs          # sponsor API checks
node e2e/responsive.mjs http://localhost:3000
```

Deploy: set `SPONSOR_SECRET` (and optionally `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, then run `supabase/migrations/0001_rate.sql`). See `.env.example`.

Stack: Next.js 16, React 19, Tailwind v4, `@stellar/stellar-sdk` 16.3.1, passkey-kit 0.19.1. No Portaj-written contract. Decisions where the build departs from the PRD: [DECISIONS.md](DECISIONS.md).
