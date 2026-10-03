# Mora

**Payments that wait.** Send money to anyone on Stellar. If they can't receive it yet, it waits for them, and it comes back to you if they never take it.

*Mora* is Latin for "delay." Roman law used *mora creditoris* for the delay that happens when the person being paid isn't ready to take the money. Mora is the product for that moment.

| | |
|---|---|
| What it is | A payouts product for anyone who pays people on Stellar: a live web app, with one shared Soroban contract underneath that other wallets and payout apps can send through too |
| Who uses it | People and teams who pay others (payroll, contributors, grants, prizes, friends), and the people they pay |
| Networks | Stellar Mainnet (beta, capped) and Testnet |
| Live URL | `OWNER DECISION` (§21) |
| Event | Find Your Way: Hackathon, General Track. Submission closes October 5, 2026, 4:00 p.m., timezone unconfirmed (§18.1) |
| Doc | v0.3, October 3, 2026. Renamed from Duro. |

---

## 1. What Mora is

On Stellar, an account has to opt in to an asset (a trustline) before it can hold it. When a payroll tool or a smart wallet sends USDC to someone who hasn't opted in, the payment fails. If that payment was one line of a payout run, the whole run fails with it, and nobody gets paid.

Mora fixes this at the moment of payment. Every payment sent through Mora ends in exactly one of three places:

| Outcome | When | What the recipient does |
|---|---|---|
| **Delivered** | The recipient could receive it | Nothing. It's in their wallet. |
| **Waiting** | They couldn't receive it yet | Opens the link, signs once. Mora adds the asset to their wallet and hands over the money in the same transaction. |
| **Returned** | Nobody claimed it before the return date | Nothing. It goes back to the sender. |

**Mora is a product, not a developer tool.** The people it serves are the ones who pay and the ones who get paid. They use the app and never touch the contract. The shared contract is how Mora grows beyond its own app: any wallet or payout app can send through it, and their recipients claim in the same Mora inbox.

---

## 2. The problem

Ada pays five contributors 50 USDC each from her team's payout tool. Kunle's wallet never added USDC. The transfer to Kunle fails, the whole payout rolls back, and all five go unpaid. Ada can drop Kunle and pay him later by hand, ask him to add USDC and retry, or change tools.

### 2.1 Why existing fixes don't cover it

- **Claimable balances** solved this for classic Stellar in 2020, but they are a classic operation. Contracts and smart wallets (C-addresses) can't create them.
- **The SAC `trust` function** (Protocol 26, CAP-73) lets a contract create a trustline, but the account holder still has to authorize it. A payer can't sign for the payee.
- **There is no "does this trustline exist" check** in CAP-73's final design (stellar-protocol PR #1860). A contract finds out by making a call fail, and an off-chain check can go stale before the payment lands.
- **Every team writes its own fallback.** Three public Soroban projects opened issues about this within about three weeks, each with a different workaround (Appendix A).

### 2.2 Evidence

| ID | Evidence | Status |
|---|---|---|
| E1 to E3 | Lokt-In #43, SorobanKit #12, Surge #1: payouts abort or strand on a payee without a trustline | VERIFIED, observed Oct 3, 2026. Some may be bounty-program repos: a recurrence signal, not a usage number. |
| E4 | SDF's wallet-backend notes the SAC `trust` call emits no event, so its indexer misses SAC-created trustlines | VERIFIED |
| E5 | Share of active mainnet accounts with no Circle USDC trustline | To measure (Appendix B). Publish numerator and denominator. |
| E6 | Mora's own mainnet pilot: real people paid through the live app (§16) | Created during the build |

---

## 3. Who it's for

| User | Role | What they do in Mora | What they get |
|---|---|---|---|
| Payout operator (team, DAO, hackathon, freelancer platform, payroll) | Primary customer | Pastes a list, signs once | No failed runs, and one place to see who has been paid and who hasn't |
| Sender | Primary customer | Pays a friend or freelancer from Freighter, LOBSTR, xBull, or another Stellar wallet | A payment that can't fail because the other side wasn't ready |
| Recipient | Primary user | Opens a link on their phone, signs once | The money and the asset in their own wallet, in one step |
| Partner app (wallet, payroll tool, payout contract) | Distribution channel | Sends through the Mora contract instead of a plain transfer | Mora's guarantee for their users, plus a claim page and inbox they don't have to build |

Partners are a channel, not the customer. Mora succeeds when people pay people with it.

---

## 4. Product principles

1. A payment never fails because the recipient wasn't ready.
2. Recipients use the wallet they already have. No Mora account, no sign-up, no email.
3. The chain is the source of truth. The app's index tells it where to look; every amount on screen is read from the contract before it's shown.
4. Mora's operators can never move anyone's money. Servers hold no mainnet key, and the contract has no admin and no upgrade path.
5. No noise. No notifications, no feed, no token. The only message Mora sends is a link, and the sender chooses to share it.
6. Built to scale from the first commit. Every v1 choice has to survive far more users without a rewrite (§10.3).

---

## 5. How Mora grows

- **Every waiting payment is an invitation.** A recipient who wasn't ready arrives through a link, claims with one signature, and leaves knowing a product they can use to pay their own people. The problem Mora solves is also how it finds new users.
- **One inbox across apps.** Every app that pays through the shared contract adds to the same inbox. The more apps send through Mora, the more the inbox is worth to recipients, and the more reason the next app has to integrate.
- **Revenue comes later, and never from the contract.** The contract stays fee-free and immutable. If Mora charges, it charges payout operators for app features (saved recipient lists, scheduled payouts, approvals, exports), never a cut of anyone's payment. Not in v1.

---

## 6. Product surfaces

```
/              landing
/send          pay one person or a list
/claim?...     one waiting payment (the link senders share)
/inbox         everything waiting for an address
/activity      everything an address has sent
/integrate     for wallets and payout apps that want to send through Mora
/try           testnet walkthrough without a wallet (P1)
```

Every page has a network switch (Mainnet beta / Testnet), a Connect Wallet button using Stellar Wallets Kit, and on mainnet a persistent banner: "Beta. The contract is unaudited. Payments are capped."

### 6.1 Landing `/`

- Headline: "Payments that wait." One sentence under it from §1.
- The three outcomes (Delivered, Waiting, Returned) as three short tiles.
- Two buttons: **Send a payment** and **Check for payments**.
- Three short sections below: for payout operators, for recipients, for partner apps.
- One line of live numbers from the index, per network: delivered, waited, claimed, returned (P1).

### 6.2 Send `/send`

**Asset.** Picked from the connected wallet's balances, limited to supported assets (§9).

**Recipients.** Either one address and amount, or a pasted list, one `address, amount` per line, or addresses only with "same amount for all". G- and C-addresses are accepted. M-addresses are rejected with an explanation. Duplicate addresses are merged with a notice. Amounts use exact 7-decimal integer math, never floats.

**Readiness preview.** Before anything is signed, each row gets a chip, read live from the network:

| Chip | Meaning |
|---|---|
| Ready | Will be delivered |
| Will activate account | XLM only: the amount is enough to create their account (Protocol 26; depends on F3) |
| Will wait: no {ASSET} trustline | Will wait until they claim |
| Will wait: account not active | Will wait; they need to fund their account before claiming |
| Will wait: needs issuer approval | Asset requires issuer authorization |
| Blocked: needs a memo | The address requires a memo (SEP-29), which usually means an exchange. Soroban transactions can't carry memos, so Mora refuses to send rather than lose the deposit. |
| Invalid | Not a valid address |

Under the table: "Preview. The network decides when you send."

Optional (P2): a "Without Mora" line that simulates the same payments as plain transfers and shows which would fail.

**Return window.** 7, 14, or 30 days, limited by the network's maximum storage lifetime (probed, not hardcoded). Testnet adds a 5-minute option for demos. Shown as a date estimate. Note: "Sending again to someone already waiting adds to that payment and moves its return date to the later one."

**Review.** Totals, network fee estimate from simulation, beta cap check on mainnet. One signature.

**Result.** One row per recipient: Delivered, or Waiting with its reason and two actions, **Copy link** and **Share** (Web Share API on phones, WhatsApp, X, and email intents on desktop). Summary line: "3 delivered, 2 waiting, 0 failed."

**Large lists.** Each signature covers up to the measured `max_items` (§11). Longer lists split automatically into several signatures with a progress view (P1, needed for real payroll sizes). Until then, the cap is shown.

**Errors.** Insufficient balance is caught in the preview. A rejected signature shows "Nothing was sent. Nothing left your wallet."

### 6.3 Claim link `/claim?network=&from=&to=&asset=`

The page senders share, and for most recipients their first contact with Mora. It reads the waiting payment straight from the contract, with no index involved, so a link works even if every Mora server is down.

- **Payment card:** amount, asset (code, issuer domain for known assets, full issuer address), sender, why it's waiting, return date.
- **Connected wallet is the recipient:** a **Claim** button. Before signing, the page simulates the claim and explains anything that will happen: "Claiming adds USDC to your wallet. Stellar sets aside 0.5 XLM of your balance while USDC stays added." The reserve figure is read from the network. If their free XLM is too low, the page says exactly how much they need instead of offering a button that would fail.
- **Connected wallet is someone else:** "This payment is for G…ABCD. Switch to that account in your wallet."
- **No wallet:** wallet picker, plus links to install LOBSTR or Freighter.
- **Return date passed:** a **Return to sender** button, available to anyone.
- **After a successful claim:** one quiet line, "Pay your own people with Mora," linking to `/send`. This is the growth loop in §5; it is not a pop-up.

| State | Shown |
|---|---|
| Loading | Skeleton card |
| Waiting | Card + Claim |
| Claimed | "Claimed by the recipient" with transaction link |
| Returned | "Returned to the sender" with transaction link |
| Nothing here | "Nothing is waiting under this link." |
| Blocked at simulation | The reason in plain words; no signature requested |
| Network unreadable | `UNKNOWN` and a retry. Never "nothing here". |

Phone-first. Phone wallets connect through WalletConnect or Freighter mobile.

### 6.4 Inbox `/inbox` (P1)

- Connect a wallet, or paste any address for a read-only view.
- Every payment waiting for that address, from every sender and every app that uses Mora, each one confirmed against the contract before it's listed. Paginated.
- **Claim all**: one signature for everything claimable, using `claim_many`.
- Footer: "Checked at ledger N."

### 6.5 Activity `/activity` (P1)

- Everything the connected address has sent through Mora: recipient, amount, status, return date. Paginated.
- Filters: Waiting, Delivered, Claimed, Returned.
- Actions per payment: **Copy link**; **Return** after the return date; **Deliver now** when a waiting recipient has since become ready (P2, sender pays the fee).
- **Export CSV** for operators reconciling a payout (P2).
- If the index is cut, Activity falls back to payments sent from this browser, kept in local storage and re-checked against the contract.

### 6.6 Integrate `/integrate`

For wallets and payout apps. This page brings partners to Mora; it is not where the product lives.

- What partners get: their users' failed payments become waiting payments that claim in Mora.
- The one-line change (`token.transfer` to `mora.send`) for contracts, and the `mora-sdk` snippet for apps.
- Contract ID per network with explorer links, and deployment parameters.
- The claim link format, so partners can send their users straight to Mora.
- Public read API (§12), so wallets can show "you have payments waiting".
- Limits: SAC assets only, no memos, unaudited.

### 6.7 Testnet faucet

"Get 100 TESTUSD" on `/try` and on the landing page when the network switch is on Testnet. The faucet pays **through Mora**. A new tester doesn't have a TESTUSD trustline, so their first experience is a payment waiting for them that they claim with one signature. Rate limited per address and IP.

### 6.8 Try it `/try` (testnet, P1)

For anyone without a Stellar wallet, including judges. One click creates two keypairs that live only in the tab, labeled "Demo keys. This tab only. Testnet." Friendbot funds them, then a guided walkthrough runs real testnet transactions: claim from the faucet, send to three demo recipients (two not ready), switch to a recipient and claim, then return the last one after a 5-minute window. Every step links its transaction. Nothing is simulated.

---

## 7. Core flows

**A. Sender pays a list**

1. Sender connects a wallet, picks an asset, pastes recipients.
2. App reads account, trustline, and SEP-29 data entries for every recipient in one RPC call and shows the readiness preview.
3. App builds `send_many`, simulates it, and shows fees and expected outcomes.
4. Sender signs once. App submits and waits for the result.
5. App posts the transaction hash to `/api/v1/ingest`, which reads the confirmed transaction from RPC and indexes its Mora events.
6. Results screen shows outcomes and share links.

**B. Recipient claims**

1. Recipient opens the link. The page reads `parcel(from, to, token)` from the contract.
2. Recipient connects a wallet. The page simulates `claim`.
3. If the simulation returns Claimed, the page asks for one signature. If it returns Blocked, the page shows why and asks for nothing.
4. One signature. Inside the transaction, Mora calls the SAC `trust` function if needed and transfers.
5. Success screen: amount received, and "USDC was added to your wallet" when a trustline was created.

**C. Money comes back**

After the return date, anyone presses **Return to sender** on the link or in Activity. The contract sends the payment only to its original sender.

**D. A partner app sends through Mora**

Their contract calls `mora.send`. Mora's events reach the index through the regular sync (§10.4). Their users find the payment in Mora's inbox or through the claim link the partner generates. Mora never needs to know the partner exists.

---

## 8. Words the product uses

| Use | Never |
|---|---|
| Delivered | Paid, sent (for anything waiting) |
| Waiting (with a reason) | Pending, failed, stuck |
| Claimed | |
| Returned | Refunded, reversed |
| Ready to return (date passed) | Expired |
| `UNKNOWN` (network unreadable) | "Nothing here", "0" |

Every amount is in monospace with tabular figures. Every status has a transaction link once it exists.

---

## 9. Networks, assets, limits

| Network | Assets (v1) | Notes |
|---|---|---|
| Testnet | XLM, TESTUSD | TESTUSD is issued by a Mora testnet account and labeled as a test asset everywhere |
| Mainnet (beta) | XLM, USDC, EURC (Circle) | Issuer addresses kept in one config file with source links, and checked at startup against each SAC's `name()` |

- **Beta caps (mainnet, enforced in the app):** per batch total, defaults 100 USDC, 100 EURC, 500 XLM (`OWNER DECISION`). They exist because the contract is unaudited, and they come off only after an audit (§17.1). Partners calling the contract directly are not capped; `/integrate` says the contract is unaudited.
- **Batch size:** `max_items` from the testnet measurement, set at deployment.
- **Return windows:** §6.2.
- **Fees:** senders pay their transaction fees; recipients pay the claim fee. Fee sponsorship is on the scale roadmap (§17.1).

---

## 10. System architecture

```
Browser: Next.js app
 ├─ Stellar Wallets Kit ── signs ─────────────────► Stellar RPC ──► Mora contract ──► SACs
 ├─ mora-sdk: build, simulate, read parcels ─────► Stellar RPC
 └─ /api/v1/* (Vercel functions, stateless)
      ├─ ingest(txHash)   getTransaction ────────► Stellar RPC
      ├─ sync()           getEvents from cursor ─► Stellar RPC
      ├─ parcels, stats   read ◄──────────────── Postgres index
      └─ faucet           testnet key only ──────► Mora contract (testnet)
```

### 10.1 Stack

- **App:** Next.js (App Router), TypeScript strict, Tailwind v4, deployed on Vercel. Read the installed Next.js docs before using its APIs.
- **Wallets:** Stellar Wallets Kit, now published on JSR as `@creit-tech/stellar-wallets-kit`. Confirm at install that its modules cover Freighter (extension and mobile), LOBSTR, WalletConnect, and xBull.
- **Chain:** `@stellar/stellar-sdk`; TypeScript client generated from the deployed contract with `stellar contract bindings typescript`.
- **Index:** Supabase Postgres.
- **Contract:** Rust with the installed `soroban-sdk` that supports Protocol 26 or later.
- **RPC:** testnet public RPC; mainnet provider chosen from the providers list on developers.stellar.org, set by env var, with a second provider as fallback (`OWNER DECISION`).
- **Error tracking:** one hosted error tracker on the app and API routes (P1).

### 10.2 Demo-only piece

A tiny `baseline-payout` contract on testnet that pays a list with plain SAC transfers. It exists only to show the failure Mora prevents (§18.2) and is labeled "Without Mora" wherever it appears. It is not part of the product.

### 10.3 Built to scale

| Concern | v1 (hackathon) | At scale (no rewrite needed) |
|---|---|---|
| Index freshness | After-write, on-read, and daily sync (§10.4) | A continuous ingestion worker on the same cursor and tables |
| RPC | One provider plus a fallback | Paid tier, two providers, cached reads |
| Large payouts | `max_items` per signature, automatic splitting in P1 | Same splitting, plus saved lists and scheduled runs for operators |
| Reads | Paginated from day one | Read replicas behind the same queries |
| Abuse | Rate limits per IP and address | Per-sender limits, and inbox filtering of senders who only send dust |
| Contract | Unaudited, capped in the app | Audited, caps lifted |
| Operations | Error tracking | Alerts on ingestion lag and RPC errors, a public status page |

Rules for v1 that keep this path open:

- Every list query is paginated and indexed on network plus address.
- Ingestion is idempotent and cursor-based per network, so a dedicated worker can replace the triggers without touching the tables.
- All RPC access goes through one module with provider fallback.
- API functions are stateless; nothing lives in server memory.
- Claiming never depends on Mora's servers: the link reads the contract directly.

### 10.4 Keeping the index current in v1

Stellar ledgers are final when they close, so there are no reorgs to handle. RPC only keeps events for a limited window (another entry in this hackathon measured 7 days on testnet). The index stays complete with three triggers:

1. **After write:** the app posts every transaction hash it submits; ingest reads that transaction directly. Instant for app users.
2. **On read:** Inbox, Activity, and the landing numbers call `sync` first, which pulls new events since the stored cursor. Rate limited.
3. **Daily cron:** a Vercel cron calls `sync` once a day, far inside the RPC window, so no event is ever missed even if nobody visits. It also keeps the free Supabase project from pausing. Check current Vercel and Supabase free-plan limits at setup.

Rule: the index lists candidates; the browser reads every amount from the contract before showing it.

---

## 11. Smart contract

One contract per network, deployed once, shared by everyone. No admin, no upgrade function, no fee.

### 11.1 Interface (shape; confirm names against the installed SDK)

```rust
fn __constructor(e: Env, grace_ledgers: u32, max_items: u32);

fn send(e: Env, from: Address, token: Address, to: Address, amount: i128, refund_after: u32) -> Outcome;
fn send_many(e: Env, from: Address, token: Address, payees: Vec<Payee>, refund_after: u32) -> Vec<Outcome>;
fn claim(e: Env, from: Address, to: Address, token: Address) -> ClaimResult;
fn claim_many(e: Env, to: Address, items: Vec<ParcelRef>) -> Vec<ClaimResult>;
fn deliver(e: Env, from: Address, to: Address, token: Address) -> DoorResult;
fn refund(e: Env, from: Address, to: Address, token: Address) -> DoorResult;
fn parcel(e: Env, from: Address, to: Address, token: Address) -> Option<Parcel>;

// Parcel   { amount: i128, refund_after: u32 }         stored under (from, to, token)
// Payee    { to: Address, amount: i128 }
// ParcelRef{ from: Address, token: Address }
// Outcome     = Delivered | Parked(u32)                 u32 = SAC error code
// ClaimResult = Claimed(i128, bool) | Blocked(u32) | Empty     bool = trustline created
// DoorResult  = Moved(i128) | StillBlocked(u32) | Empty
```

The constructor values are set once at deployment and recorded with the contract ID.

### 11.2 Behaviour

| Function | Auth | Behaviour |
|---|---|---|
| `send` | `from` | Validate. Pull `amount` from `from` into Mora. Try to transfer it to `to`. Success: `Delivered`. Recipient-side error (§11.3): add to the parcel, set its return ledger to the later of old and new, extend its storage life to the return ledger plus `grace_ledgers`, return `Parked(code)`. Any other error aborts. |
| `send_many` | `from` | Checked sum, one pull for the total, then the `send` logic per payee. At most `max_items`. One payee's recipient-side error never changes another's outcome. |
| `claim` | `to` | Try the transfer. Success: `Claimed(amount, false)`. Error 13: call SAC `trust(to)`, try again; success is `Claimed(amount, true)`. Errors 6, 10, 11, or a failed retry: `Blocked(code)`. No parcel: `Empty`. |
| `claim_many` | `to` | `claim` logic per item, one signature, at most `max_items`. |
| `deliver` | none | Try the transfer to `to`. Success removes the parcel: `Moved`. Recipient-side error: no change, `StillBlocked(code)`. |
| `refund` | none | Only after `refund_after`, else aborts with `RefundNotYetAllowed`. Try the transfer to `from`. Same results as `deliver`. |
| `parcel` | none | Read-only. |

Every state-changing call also extends the contract instance's life so the shared deployment stays reachable.

### 11.3 Recipient-side SAC errors (the only ones that make a payment wait)

| Code | SAC name | Meaning |
|---|---|---|
| 6 | `AccountMissingError` | Recipient account doesn't exist (and, for XLM, the amount was too small to create it) |
| 10 | `BalanceError` | Recipient's trustline limit would be exceeded |
| 11 | `BalanceDeauthorizedError` | Issuer hasn't authorized the recipient |
| 13 | `TrustlineMissingError` | No trustline |

Anything else aborts the call, so unknown failures are never hidden as "waiting". Code 10 was added after the original research (which listed 6, 11, and 13) to cover recipients whose trustline limit is too low.

### 11.4 Errors

`InvalidAmount`, `DeadlineInPast`, `DeadlineBeyondMaxTtl`, `TooManyItems`, `RefundNotYetAllowed`, `UnexpectedTransferError`.

### 11.5 Events

Mora emits its own events, which the index depends on and which also cover the trustline creation the SAC doesn't report (E4).

| Event | Topics | Data |
|---|---|---|
| `delivered` | `mora, delivered, from, to, token` | `amount` |
| `parked` | `mora, parked, from, to, token` | `amount, reason, refund_after, parcel_total` |
| `claimed` | `mora, claimed, from, to, token` | `amount, trustline_created` |
| `moved` | `mora, moved, from, to, token` | `amount` (from `deliver`) |
| `returned` | `mora, returned, from, to, token` | `amount` |

### 11.6 Guarantees

- **Solvency:** for each token, Mora's balance is at least the sum of its parcels.
- **Three exits:** a parcel's money can go only to `to` (claim, deliver) or `from` (refund). Both come from the storage key, never from the caller.
- **No early return:** `refund` cannot succeed at or before `refund_after`.
- **Isolation:** inside a batch, one recipient's problem doesn't change anyone else's outcome.
- **No privileged role:** nobody can pause, drain, upgrade, or redirect.

### 11.7 Decisions

- **SAC assets only.** Waiting keys on SAC error codes, and claiming uses SAC `trust`.
- **Pull, then push.** The sender authorizes one transfer into Mora whether the payment lands or waits. Costs two transfers per payment.
- **Unknown errors abort.** Parking them would hide bugs.
- **No on-chain list per recipient.** It would let anyone fill an inbox with dust. Discovery uses links and the index.
- **Return dates in ledgers.** Matches storage-life rules. The app converts using probed close times, since Protocol 28 changed ledger timing.
- **Immutable.** A bug means a new deployment, announced on `/integrate`.

---

## 12. Public API

Read endpoints are public so wallets can show "payments waiting". Responses are index candidates, and say so; callers should confirm with `parcel()`. Every list endpoint is paginated with a cursor and rate limited.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/parcels?network=&to=&cursor=` | Waiting payments for a recipient |
| GET | `/api/v1/parcels?network=&from=&cursor=` | Payments sent by an address |
| GET | `/api/v1/stats?network=` | Counts for the landing page |
| POST | `/api/v1/ingest` | `{ network, txHash }`: index a confirmed transaction; idempotent |
| GET | `/api/v1/sync?network=` | Pull new events since the cursor; rate limited |
| POST | `/api/v1/faucet` | `{ address }`: testnet only, pays TESTUSD through Mora |

Index tables: `mora_events` (raw, unique on network, tx hash, event index), `mora_parcels` (current state per parcel), `mora_sync` (cursor per network).

---

## 13. `mora-sdk`

The app is built on it, and partners get the same package. It is a means of distribution, not a product of its own.

- `readiness(addresses, asset, network)`: the preview chips from §6.2.
- `buildSend`, `buildSendMany`, `buildClaim`, `buildClaimMany`, `buildDeliver`, `buildRefund`: simulated transactions ready to sign.
- `getParcel`, `parseOutcome`, `parseClaimResult`.
- `claimLink({ network, from, to, asset })`.
- `probeNetwork()`: current ledger, recent close time, base reserve, max storage life.

Publishing to npm is P2. Until then it lives in the repo and `/integrate` shows the snippet.

---

## 14. Quality bar

- **Phone first.** The claim page is the most important screen and the most likely to be opened on a phone over a slow connection. It loads without the Send code.
- **Phone wallets.** Signing a Soroban transaction from a phone wallet is tested on a real device before launch (§19, F5).
- **No keys in the browser except demo keys** on `/try`, held in memory and labeled. No key on any server except the testnet faucet key.
- **Accessibility:** keyboard reachable, visible focus, readable contrast, reduced-motion respected.
- **No third-party trackers.**
- **Design:** one focal component, the payment card, used on the claim page, inbox, and activity. Monospace numbers. One accent color. Visual reference is an `OWNER DECISION`.

---

## 15. Security and trust

| Threat | Protection |
|---|---|
| Someone redirects a waiting payment | Exits pay only `to` or `from`, taken from storage |
| Recipient claims twice | Parcel removed in the same call that pays it |
| Sender pulls back early | Return blocked until the return ledger |
| Spam: dust payments to many addresses | Spammer pays fees and storage; no on-chain inbox to fill; the app lists only supported assets |
| Sending to an exchange without a memo | App blocks SEP-29 addresses; `/integrate` warns partners that the contract can't enforce this |
| Fake assets in the inbox | v1 lists only supported assets by exact issuer |

What Mora doesn't protect, said in the app and README:

- The contract is unaudited. Mainnet use is capped in the app.
- `trust` creates a trustline with no limit.
- Assets that need issuer approval wait until the issuer approves.
- A recipient needs an active account with a little free XLM to claim, except XLM payments large enough to activate the account.
- After the return date plus grace, an unreturned payment's storage can be archived. Returning it then costs a small extra restore fee, which the app shows before signing.

---

## 16. Launch proof and metrics

**Mainnet pilot.** Using only the live app, the builder pays a small amount of USDC (for example 1 USDC) to a group of real people, at least some of whom don't have USDC added. Publish, with transaction hashes and denominators:

- how many were delivered and how many waited
- how many claimed, and median time to claim
- how many were returned
- aborted batches (target: 0)

Label it "builder-run pilot". It shows the product working for real people; it is not organic usage. Start it as soon as mainnet send and claim work, because people take hours to respond.

**Product metrics after launch:**

- weekly active senders and payout operators
- payments by outcome, and the share of waiting payments that get claimed
- median time to claim
- recipients who later send with Mora (the growth loop in §5)
- partner apps sending through the contract
- aborted batches (target: 0)

---

## 17. Scope

| Priority | In it |
|---|---|
| **P0** | Contract on testnet and mainnet; landing; `/send` (single and list) with readiness preview; `/claim` link page with claim and return; `/integrate` with contract IDs and the one-line change; testnet faucet through Mora; beta caps and unaudited banner; mainnet pilot; `baseline-payout` on testnet for the demo |
| **P1** | Index, `/inbox` with Claim all, `/activity`, landing numbers, public read API, automatic splitting of long lists, `/try`, error tracking |
| **P2** | "Without Mora" line in the preview; Deliver now; federation names (`name*lobstr.co`); CSV upload and export; npm publish |
| **P3** | Muxed and memo support; more assets |

**Cut order if behind:** `/try`, then P2 items, then landing numbers, then automatic list splitting (show the cap instead), then the public API docs, then the index (Activity falls back to this browser's history; claiming works through links). Never cut: landing, send, claim link, return, mainnet, a minimal `/integrate`.

### 17.1 After the hackathon: scale roadmap

Not part of v1. Listed so v1 choices don't block it.

- Audit the contract, then lift the beta caps.
- Continuous ingestion worker, paid RPC tier, alerts, and a public status page (§10.3).
- Team workspaces for payout operators: saved recipient lists, scheduled payouts, approvals, exports.
- Fee sponsorship so recipients with no XLM can claim, the biggest onboarding gap in emerging markets.
- Cash-out: after claiming, hand recipients to a local anchor to withdraw to their bank.
- Spanish, Portuguese, and other local-language copy for the markets Mora pays into.

---

## 18. Hackathon

### 18.1 Facts

| | | Status |
|---|---|---|
| Dates | September 1 to October 12, 2026 | VERIFIED, stellarpassport.xyz |
| General Track | US$4,000: 1st $2,000, 2nd $1,000, 3rd $500, two honorable mentions $250 | VERIFIED |
| University Track | Chilean university students only | VERIFIED; not eligible |
| Teams | 1 to 5 | VERIFIED |
| Submission close | October 5, 4:00 p.m. | Date VERIFIED, **timezone not stated**. Organizers appear Santiago-based; if Chile time, about 20:00 Lagos time. Confirm on the page. |
| Registration | A Stellar Passport account alone doesn't register you; register on the hackathon page and create or join a team | VERIFIED |
| Judging criteria | Not visible | **UNKNOWN**; paste into §18.3 when found |

### 18.2 Demo (3 minutes, the product in a live browser)

1. **0:00** "Without Mora": the `baseline-payout` contract pays five testnet recipients, two without a trustline. The whole run fails. **0 of 5 paid.**
2. **0:20** `/send` on mainnet, the same shape of list: the preview marks two as "Will wait: no USDC trustline". One signature. Result: 3 delivered, 2 waiting. Share one link to WhatsApp.
3. **1:00** On a phone: the recipient opens the link, connects LOBSTR, taps Claim, signs once. USDC appears in their wallet.
4. **1:50** `/activity`: a testnet payment with a 5-minute window is returned to the sender.
5. **2:20** `/integrate`: a payment sent by another contract shows up in the same inbox.
6. **2:45** Pilot numbers with denominators. **5 of 5 resolved, 0 aborted, 1 signature to claim.**

### 18.3 Judging criteria mapping

Replace with the real criteria. Default mapping until then:

| Likely criterion | Where Mora answers it |
|---|---|
| Innovation | First shared fix for a failure every Soroban payout app hits; first use of SAC `trust` in the field |
| Technical execution | §11 contract, §10 architecture, tests |
| Real-world impact | Live on mainnet, pilot with real people (§16), growth loop (§5) |
| Use of Stellar | Protocol 26 SAC `trust`, SAC error semantics, storage-life rules, constructors |
| UX | One signature to send a list, one to claim, phone wallets |

For a technical judge, one line: "a dead-letter queue for Stellar payments."

### 18.4 Positioning

| Project | Relation |
|---|---|
| Classic claimable balances | Same promise, unavailable to contracts and smart wallets |
| Authline (SCF) | CAP-73 onboarding for issuers and exchanges; Mora covers payers. Complementary. |
| Per-project fallbacks (Appendix A) | What Mora replaces |
| stellar-address-kit | Deposit routing, a different problem |
| Visible entries in this hackathon | Tessera and VLock (voting). No overlap. |

---

## 19. Milestones

Ordered. Each one is passed when its check is true in the hosted app, not just locally.

| Milestone | Passed when |
|---|---|
| **M0 Feasibility** | F1: a contract catches SAC error 13 and keeps running. F2: `trust` inside `claim` with recipient auth creates the trustline and the transfer lands, one transaction. F3: XLM through the SAC from a contract activates a new account when large enough. F4: constructor and storage-life APIs confirmed in the installed SDK. F5: a phone wallet signs a Soroban call. F6: `max_items` and fees measured on testnet. |
| **M1 Contract** | Mora and `baseline-payout` deployed on testnet; tests cover every row of §11.2, every guarantee in §11.6, and early-return, double-claim, and wrong-claimer attempts. |
| **M2 Testnet app** | On the public URL, a stranger can get TESTUSD from the faucet, send a list, share a link, claim on a phone, and return a payment. |
| **M3 Mainnet** | Contract deployed with measured parameters. A real USDC payment is sent, waits, and is claimed through the public URL. Caps and banner live. |
| **M4 Pilot** | §16 pilot run and published. |
| **M5 Index** | Inbox, Activity, Claim all, landing numbers, public API live. A payment sent by a separate test contract appears in the inbox. |
| **M6 Integrate** | Snippets on `/integrate` verified by actually running them. |
| **M7 Try it** | `/try` completes end to end on testnet. |
| **M8 Submit** | README, video, and submission filed before the confirmed close. Feature work stops two hours before it. |

---

## 20. Risks and kill criteria

| If | Then |
|---|---|
| F1 fails (error can't be caught) | Mora can't be built as designed. Stop and pick the runner-up idea. |
| F2 fails (`trust` can't run inside claim) | Claiming becomes two steps: add the asset in your wallet, then Claim. Say so on the claim page. |
| F3 fails (XLM from a contract doesn't activate new accounts) | XLM to inactive accounts waits like any other asset. Remove the "Will activate account" chip. |
| F5 fails (phone wallets can't sign) | Launch with desktop wallets, show the limitation on the claim page, keep testing phone wallets. |
| Mainnet deployment and storage costs exceed the XLM budget | Measure Mora's real cost on testnet first; extend mainnet storage life only as far as needed. Another entry measured 181.70 XLM to keep a 21 KB contract alive 180 days on testnet, so budget for it. |
| Mainnet RPC provider rate limits | Second provider in env, switched without redeploying |
| A shared payer-side fallback already exists | Reposition Mora as the product layer on top of it, or stop |

---

## 21. Owner decisions

| Decision | Default |
|---|---|
| Domain or Vercel subdomain | `mora` on Vercel, if available |
| npm package name | `mora-sdk`, if available |
| Mainnet beta caps | 100 USDC, 100 EURC, 500 XLM per batch |
| Mainnet RPC providers | First free option on the developers.stellar.org list, plus one fallback |
| XLM budget for mainnet deployment and storage | Set after the testnet measurement |
| Pilot size and amount | 10 people, 1 USDC each |
| Can a sender cancel before the return date? | No |
| Visual style reference | Clean, light and dark, Stellar-native accent |
| Revenue model | None in v1 (§5) |

---

## 22. Rules for the coding agent

1. Read this PRD first. Follow the Git commit rules in §23, and cite PRD sections in commit messages.
2. Confirm every SDK function name against installed source before using it. If the network or SDK disagrees with this PRD, the network wins; record it in `DECISIONS.md`.
3. Never hardcode ledger close time, max storage life, base reserve, or contract IDs. Probe them or read them from deployment files.
4. Never show an amount the contract hasn't confirmed. Never show "paid" for a waiting payment. Unreadable network state is `UNKNOWN`.
5. No mainnet key on any server. No key in source, logs, or URLs.
6. Nothing labeled live may be mocked. Test assets, demo keys, and `baseline-payout` are labeled on screen.
7. Paginate every list and keep API functions stateless (§10.3).
8. Every money-moving change comes with a test that tries to break it.
9. Report finished work as the files changed and the commands run, with their output.

---

## 23. Git commit rules

Git commits are a required part of the development process. During the build, commit changes continuously instead of waiting until the entire project is finished.

### 23.1 Commit frequency

For a normal build, aim for 50+ meaningful commits across the development process.

Do NOT create 50 meaningless commits just to reach the number. Every commit should represent a real, completed development step.

Make a commit whenever you complete a logical unit of work, such as:

- Creating a new page
- Creating or modifying a component
- Adding a feature
- Implementing an API endpoint
- Adding database functionality
- Adding authentication logic
- Adding validation
- Adding error handling
- Connecting frontend to backend
- Adding a utility/helper
- Adding a configuration
- Refactoring a specific section
- Fixing a bug
- Improving an existing feature
- Adding tests
- Fixing failing tests
- Improving responsiveness
- Fixing accessibility issues
- Updating documentation
- Completing a route
- Completing a major UI section
- Integrating an external service

### 23.2 Commit process

After completing each logical development unit:

1. Check the current changes.
2. Verify that the changes work.
3. Stage only the relevant files.
4. Create a descriptive commit.
5. Continue building from the committed state.

Use conventional commit messages where appropriate:

- `feat: add dashboard`
- `feat: add wallet connection`
- `feat: implement transaction history`
- `fix: resolve wallet connection error`
- `refactor: simplify auth middleware`
- `test: add dashboard tests`
- `style: improve mobile layout`
- `docs: update setup instructions`

### 23.3 Important rules

- Do NOT wait until the end of the project to commit everything.
- Do NOT make one giant commit containing the entire project.
- Do NOT create fake changes solely to increase the commit count.
- Do NOT repeatedly modify and commit the same thing without a meaningful reason.
- Keep commits small, focused, and logically separated.
- Before moving to the next major feature, make sure the previous feature has been committed.
- If a task contains several independent steps, commit each completed step separately.
- If you encounter and fix a bug during development, commit the fix separately.
- If you make a meaningful refactor, commit it separately.

### 23.4 Target

For a substantial project, aim for 50+ meaningful commits by the time the build is complete, distributed naturally throughout development.

The commit history should clearly show the progression of the project from initial setup → individual features → integrations → fixes → testing → polish → final state.

At the end of the build, run `git log` and verify that the history accurately reflects the development process.

---

## 24. Definition of done

On mainnet, from the public URL:

- A sender pays a list of people with one signature and never sees a failed batch.
- A recipient on a phone who has never heard of Mora opens a link, signs once, and has the money and the asset in their own wallet.
- A payment nobody claims goes back to its sender.
- A different contract sends through Mora, and its payment shows up in the same inbox.
- Every number on the landing page and in the README links to a transaction.

---

## Appendix A: references

- Hackathon: https://demo.stellarpassport.xyz/hackathons/find-your-way-meridian-hackathon
- Event listing with prizes and dates: https://stellarpassport.xyz/
- Lokt-In #43: https://github.com/Lokt-In/loktin/issues/43
- SorobanKit #12: https://github.com/SorobanKit/sorobanKit/issues/12
- Surge #1: https://github.com/Surge-Org/Surge/issues/1
- wallet-backend #731 (SAC `trust` emits no event): https://github.com/stellar/wallet-backend/issues/731
- CAP-73 interface simplification: https://github.com/stellar/stellar-protocol/pull/1860
- SAC docs (trust function, error codes): https://developers.stellar.org/docs/tokens/stellar-asset-contract
- Protocol 26 Yardstick guide: https://stellar.org/blog/foundation-news/stellar-yardstick-protocol-26-upgrade-guide
- Soroban transactions can't carry memos: https://developers.stellar.org/docs/learn/fundamentals/contract-development/contract-interactions/stellar-transaction
- Tessera (storage-life and RPC retention measurements): https://github.com/ThaisFReis/tessera
- Authline (SCF): https://communityfund.stellar.org/project/authline-stellar-asset-onboarding-yh4
- Stellar Wallets Kit: https://github.com/Creit-Tech/Stellar-Wallets-Kit

## Appendix B: measuring E5

Hubble public BigQuery dataset. Confirm table and column names against the current schema first.

```sql
WITH active AS (
  SELECT DISTINCT source_account AS account_id
  FROM `crypto-stellar.crypto_stellar.history_transactions`
  WHERE closed_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)),
usdc AS (
  SELECT account_id FROM `crypto-stellar.crypto_stellar.trust_lines_current`
  WHERE asset_code = 'USDC'
    AND asset_issuer = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN')
SELECT COUNTIF(u.account_id IS NULL) AS cannot_receive,
       COUNT(*) AS active_accounts,
       COUNTIF(u.account_id IS NULL) / COUNT(*) AS share
FROM active a LEFT JOIN usdc u USING (account_id);
```
