# Mora

**Payments that wait.** Send money to anyone on Stellar. If they can't receive it yet, it waits for them, and it comes back to you if they never take it.

*Mora* is Latin for "delay". *Mora creditoris* is the delay when the person being paid isn't ready to take the money.

## The problem

On Stellar an account has to add an asset (a trustline) before it can hold it. When a payout contract or smart wallet sends USDC to someone who hasn't, the transfer fails, and if it was one line of a payout run, the whole run fails with it. Classic claimable balances solved this in 2020, but contracts and smart wallets can't create them.

## What Mora does

Every payment sent through Mora ends in exactly one of three places:

| Outcome | When | What the recipient does |
|---|---|---|
| **Delivered** | They could receive it | Nothing. It's in their wallet. |
| **Waiting** | They couldn't yet | Opens the link, signs once. Mora adds the asset (SAC `trust`, Protocol 26) and pays in the same transaction. |
| **Returned** | Nobody claimed it by the return date | Nothing. It goes back to the sender. |

One shared Soroban contract per network, with no admin, no upgrade path and no fee. Any wallet or payout app can send through it, and every recipient claims in the same Mora inbox.

## Status

| | Testnet | Mainnet |
|---|---|---|
| Mora contract | [`CAHCJV5S…ZZ3SF`](https://stellar.expert/explorer/testnet/contract/CAHCJV5S5LJIL53YPNS4YTO2QWK65RYJG56SMSMYIPU45RVHV4YZZ3SF) | Deployment kit ready ([scripts/deploy-mainnet.sh](scripts/deploy-mainnet.sh)); owner deploys |
| Parameters | `grace_ledgers` 120,960 · `max_items` 30 | same |
| Assets | XLM, TESTUSD (test asset) | XLM, USDC, EURC (Circle) |
| Demo-only `baseline-payout` | [`CDS2BXVY…5HISB`](https://stellar.expert/explorer/testnet/contract/CDS2BXVY2D7GA25SVKP4FPSADST5AI6DUODJUG3UPZ4P7MFW7KR5HISB) | n/a |
| Example partner contract | [`CA6HYBTE…H5EO3`](https://stellar.expert/explorer/testnet/contract/CA6HYBTE232ZHCA5GUNHFIXXDY6SD2HP6OCOD4SNBNYPCNWP4RCH5EO3) | n/a |

Evidence: [docs/M0-feasibility.md](docs/M0-feasibility.md) (F1–F4, F6 verified on chain) and [docs/M2-testnet-e2e.md](docs/M2-testnet-e2e.md) (browser-driven run: delivered, waiting, claimed with trustline, returned). The mainnet pilot (PRD §16) hasn't run yet, so there are no pilot numbers here.

## Try it

- **`/try`**: no wallet needed. Demo keys in the tab, real testnet transactions: the same payout fails without Mora (0 of 3 paid), then succeeds with it (1 delivered, 2 waiting), a recipient claims, and the last payment returns after 5 minutes.
- **`/send`**: pay one person or paste a list. Each row is checked before you sign (Ready, Will wait: no USDC trustline, Blocked: needs a memo…).
- **`/claim?network=&from=&to=&asset=`**: the link senders share. It reads the contract directly, so it works even if every Mora server is down.
- **`/inbox`**, **`/activity`**, **`/integrate`**.

## How it's built

```
Browser (Next.js 16)
 ├─ Stellar Wallets Kit ── signs ───────────► Stellar RPC ──► Mora contract ──► SACs
 ├─ mora-sdk: build, simulate, read ────────► Stellar RPC (pooled, with fallback)
 └─ /api/v1/* (stateless functions)
      ├─ ingest, sync, daily cron ─────────► Stellar RPC events
      ├─ parcels, stats ◄──────────────────── Postgres index (Supabase)
      └─ faucet (testnet key only) ────────► Mora contract (testnet)
```

| Path | What |
|---|---|
| [contracts/mora](contracts/mora) | The contract (Rust, soroban-sdk 28). 35 tests against real classic accounts and trustlines. |
| [contracts/baseline-payout](contracts/baseline-payout) | "Without Mora": plain transfers, demo only. |
| [contracts/partner-example](contracts/partner-example) | The one-line integration, tested against the deployed wasm. |
| [packages/mora-sdk](packages/mora-sdk) | TypeScript SDK the app is built on: readiness, builders, parsing, links, probes. |
| [src/app](src/app) | Pages and API routes. |
| [supabase/migrations](supabase/migrations) | Index schema. |
| [deployments](deployments) | Contract IDs and parameters per network. Nothing is hard-coded elsewhere. |
| [DECISIONS.md](DECISIONS.md) | Where the network or SDK disagreed with the PRD, and what was done. |

### Contract

```rust
fn send(from, token, to, amount, refund_after) -> Outcome          // Delivered | Parked(code)
fn send_many(from, token, payees, refund_after) -> Vec<Outcome>    // one pull, max_items payees
fn claim(from, to, token) -> ClaimResult                           // trust() on error 13, then retry
fn claim_many(to, items) -> Vec<ClaimResult>
fn deliver(from, to, token) -> DoorResult                          // anyone, once they're ready
fn refund(from, to, token) -> DoorResult                           // anyone, after refund_after
fn parcel(from, to, token) -> Option<Parcel>
```

Only recipient-side SAC errors make a payment wait: 6, 10, 11, 13 and 14 (14 added after reading the host source; see D-001). Anything else aborts, so unknown failures are never hidden as "waiting". Guarantees, all tested: solvency per token, three exits only (to `to` or back to `from`, both from the storage key), no early return, isolation inside a batch, no privileged role.

## Run it locally

Needs Node 22, pnpm 10, and for contracts Rust (`wasm32v1-none` target) plus stellar-cli 28.

```bash
pnpm install
cp .env.example .env.local     # fill in what you have; everything is optional for testnet browsing
pnpm dev                       # http://localhost:3000

pnpm test                      # app + sdk unit tests
MORA_LIVE=1 pnpm --filter mora-sdk test   # live testnet/mainnet read checks

cd contracts && cargo test && stellar contract build
```

### Environment

| Variable | Needed for |
|---|---|
| `NEXT_PUBLIC_TESTNET_RPC_URLS`, `NEXT_PUBLIC_MAINNET_RPC_URLS` | RPC providers, comma-separated, primary first |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Phone wallets via WalletConnect |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | The index (Inbox/Activity/landing numbers). Without it, they fall back to 7 days of RPC history plus this browser's sends |
| `MORA_FAUCET_SECRET` | Testnet faucet. The only key on any server, and testnet only |
| `CRON_SECRET` | Daily `/api/cron/sync` |

### Deploy

1. Create a Supabase project and run [supabase/migrations/0001_index.sql](supabase/migrations/0001_index.sql).
2. Import the repo into Vercel and set the variables above. [vercel.json](vercel.json) schedules the daily sync.
3. Mainnet: fund a key you control, then `./scripts/deploy-mainnet.sh <key-name> <rpc-url>`. It refuses to deploy any wasm other than the one verified on testnet, and writes the contract ID to `deployments/mainnet.json`.

## What Mora doesn't protect

- **The contract is unaudited.** Mainnet payments are capped in the app (100 USDC, 100 EURC, 500 XLM per batch). Contracts calling Mora directly are not capped.
- **`trust` creates a trustline with no limit.**
- **Assets that need issuer approval** wait until the issuer approves.
- **A recipient needs an active account with a little free XLM to claim**, except for XLM payments large enough to activate the account (2 × base reserve).
- **After the return date plus grace**, an unreturned payment's storage can be archived. Returning or claiming it then costs a small extra restore fee, which the app shows before signing.
- **Memos:** Soroban transactions can't carry them. The app blocks addresses that require one (SEP-29); the contract can't, so partners must check.

## Design

The interface follows the monochrome editorial system in [frontend.md](frontend.md): Hedvig Letters Serif headlines over Hedvig Letters Sans, one weight, square corners and hairlines, no brand colour. The only colour is the product's own status marks. Light and dark themes, reduced motion respected, no trackers.

---

Built for the Find Your Way hackathon (General Track) on Stellar. Product spec: [prd.md](prd.md).
