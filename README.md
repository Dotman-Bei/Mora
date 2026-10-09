# Portaj

Portaj lets a passkey smart-wallet user send USDC to any exchange deposit address with its memo, through their own passkey-derived Stellar account created with sponsored reserves, so they need no XLM and no seed phrase.

**Live (testnet):** https://portaj.vercel.app · **App:** https://portaj.vercel.app/app · **Track:** General · Find Your Way hackathon (Stellar Passport)

## The claim

> With Portaj, a smart-wallet user's USDC cannot be stranded for lack of a memo, a trustline or XLM.

A transfer out of a smart wallet (a C-address) is a contract call, and the network rejects any memo on it (stellar-core [`validateSorobanMemo`](https://github.com/stellar/stellar-core/blob/ba6a4e6e322a8069b85bdf48a35d971a2d72cc81/src/transactions/TransactionFrame.cpp)). Exchanges need the memo, and per [SDF's smart-wallet docs](https://developers.stellar.org/docs/build/apps/smart-wallets) "transfers from contracts are not supported by exchanges today". A classic wallet would fix that, but it needs XLM for its reserve and trustline before it can hold USDC.

### Verify it yourself

1. Open **[Wallet](https://portaj.vercel.app/app)**: press **Create test wallet**, then **Get test USDC**.
2. Open **[Carry](https://portaj.vercel.app/app/carry)** and press **Try the normal way** (right column). The network answers `Transaction contains a memo. Soroban transactions do not support memos.` (simulation) and `txMalformed` (-16) (submission). Nothing moves.
3. In the left column, choose **Use the exchange simulator's address and memo**, enter an amount and press **Continue with passkey**. The first time, press **Set up (paid by Portaj)**; then **Send**. You get a receipt with three explorer links.
4. On stellar.expert your transit account shows 0 XLM, with account and trustline reserves sponsored by `GAD3TLO2X27OQROVNDWKBMKZF5XFBMKZMN6GJMX6UAVR2FXSBWO4THCA`. The payment out carries the memo, goes to the deposit address, and its fee is paid by a fee bump.
5. **[Exchange](https://portaj.vercel.app/app/exchange)** credits it under your memo. A memo-less contract transfer (**Send without the memo**, under the rejection) is listed as not credited.

**One carry, already on testnet** (first carry for a passkey, 5 USDC, memo ID `356409`):

| Step | Transaction |
|---|---|
| Setup: transit account created with 0 XLM, USDC trustline, reserves sponsored | [`0f0b1e10…`](https://stellar.expert/explorer/testnet/tx/0f0b1e10d4540c08d83e5dd19f8f98e71517a8df74eda01199ea40ae03961413) |
| Transfer in: smart wallet (C) → transit account (G), passkey-signed | [`72fa4bcb…`](https://stellar.expert/explorer/testnet/tx/72fa4bcb6b8531b7fb723f21e8329798d55535c7fb2343fb374174ead69b2a80) |
| Payment out: G → simulator deposit, memo ID `356409`, fee bump by the sponsor | [`47cf0d74…`](https://stellar.expert/explorer/testnet/tx/47cf0d749698ccc1c98d54b1f9c44ae64bbe55cdab8f513fcdf3dbe166ba1102) |
| The transit account afterwards: 0 XLM, 0 USDC, sponsored | [`GD2VSQSN…`](https://stellar.expert/explorer/testnet/account/GD2VSQSNHIRGIMB5YM6P3AA7T26ANEN7OSMG4HCU6OR3WAUKVFJVY3YO) |

## How it works

The app has four screens: **Wallet** (your passkey smart wallet, its USDC and C-address; on testnet, a test wallet and test USDC), **Carry** (address, memo, amount, one passkey prompt; on testnet, the normal way's rejection beside it), **Receipts** (every carry with its explorer links, the memo as sent and the 0 XLM proof; unfinished carries are resumed or returned here) and **Exchange** (the labelled testnet simulator, hidden on mainnet). The G account is called the *transit account*: USDC sits in it for one ledger.

```
1. User pastes exchange address + memo, signs in with a passkey on Portaj
2. WebAuthn PRF ──► 32 bytes ──► ed25519 key ──► the user's own G address
3. Sponsor tx: BeginSponsoring ─► CreateAccount(G, 0 XLM) ─► ChangeTrust(USDC) ─► EndSponsoring
4. Smart wallet (C) ──SEP-41 transfer(C ─► G, amount)──► USDC lands in G
5. G ──classic Payment(USDC) + memo──► exchange deposit address; sponsor fee-bumps the tx
6. Receipt page: three explorer links; G native balance 0; reserves show the sponsor
```

First carry: three transactions, two passkey prompts. Every later carry: two transactions, one prompt. USDC sits in G for about a ledger. Portaj never holds user keys or funds; the only server key is the sponsor's.

**Two modes.** *Wallet on Portaj*: a passkey-kit wallet created on Portaj; Portaj signs the C → G transfer. *Another wallet*: passkeys belong to the site that made them, so the user sends USDC to their transit account from their own wallet app, and Portaj pays it out with the memo.

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
| tx2 lands, tx3 fails | **Resume carry** or **Return to my wallet** (on the screen, or under [Receipts](https://portaj.vercel.app/app/receipts#recover)) |
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
