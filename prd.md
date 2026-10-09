# Portaj · Product Requirements Document

Mechanism: **Transit**

Name: **Portaj**, compressed from *portage*, the practice of carrying a boat overland between two waters it cannot sail between. USDC cannot move straight from a smart wallet to an exchange, so Portaj carries it across a short stretch (the user's own transit account) and puts it back in the water. Working title during research: Exit Lane.

Portaj lets a passkey smart-wallet user send USDC to any exchange deposit address with its memo, through their own passkey-derived Stellar account that is created with sponsored reserves, so they need no XLM and no seed phrase.

| Field | Value |
|---|---|
| Builder | Heisbei (Bamigboye Emmanuel Inioluwa), solo |
| Event | Find Your Way: Hackathon (Stellar Passport, "chapter" hackathon on the road to HackMeridian) |
| Track | General Track |
| Submission deadline | 2026-10-12 23:59 UTC = 2026-10-13 00:59 WAT (Africa/Lagos) |
| Demo network | **Stellar testnet** (confirmed acceptable by the builder) |
| Status | Idea selected through the ideaskill pipeline; this PRD is the build spec |
| Research trail | `00-constraints.md` to `07-final-checks.md`, `FINAL_IDEA.md` in this folder |

---

## Table of contents
1. Event context
2. Builder constraints
3. Problem
4. Why the obvious fixes fail
5. Solution and mechanism
6. Why this needs Stellar
7. Users and use cases
8. Functional requirements
9. Transaction specifications
10. Key derivation specification
11. Failure handling and recovery
12. Testnet exchange simulator
13. Non-functional requirements
14. Architecture and stack
15. Screens and copy
16. Demo moment, claim and judge verification
17. Scope
18. Judging criteria mapping
19. Submission requirements and README
20. Risks, kill criteria and open questions
21. Validation message
22. Success measures
23. Appendix A · Event intel in full
24. Appendix B · Stellar primitives and overlap zones
25. Appendix C · Pain bank (all 29 kept, 7 dropped)
26. Appendix D · All 14 candidates and why each lived or died
27. Appendix E · Prior art
28. Appendix F · Scorecard and source verification
29. Appendix G · Runner-up and third place in full
30. Sources

---

## 1. Event context

- **Name:** Find Your Way: Hackathon. Slug `find-your-way-meridian-hackathon`. Type `chapter`. Organizer: Stellar Passport. Status at research time: `submissions_open`, 268 registered participants.
- **Stated goal:** "Find Your Way is a hackathon designed to help builders gain hands-on experience with Stellar and prepare for HackMeridian in Lisbon. Participants will turn ideas into working projects, strengthen their technical and pitching skills, and compete for prizes while building their Stellar Passport."
- **Dates:** start 2026-09-01; submissions open 2026-09-21; deadline 2026-10-12 23:59 UTC; judging 2026-10-12 23:59 UTC to 2026-10-16 22:01 UTC.
- **Prize pool:** 5,000 USDC.
  - General Track: 1st 2,000 · 2nd 1,000 · 3rd 500 · Honorable mention #1 250 · Honorable mention #2 250 (total $4,000).
  - University Track: Best University Project #1 500 · #2 500 (total $1,000). Chile-enrolled students only. **Not eligible.**
- **Judging criteria (General Track, unweighted):** technical execution, meaningful use of Stellar, originality, potential impact, user experience, presentation quality.
- **Judges:** none named anywhere (confirmed by the builder: no judges list on the page). `INFERRED`: Stellar Chile ambassadors and SDF devrel; the organizer's founder is President of the Stellar Ambassador Program in Chile.
- **Sponsors:** none. No sponsor bounties. The only resource linked is https://docs.stellar.org.
- **Feeds into:** HackMeridian, Lisbon, 25 to 26 Oct 2026, up to $30,000 in XLM, Genesis (Idea → MVP) and Scale (Prototype → Product) tracks. HackMeridian FAQ: "Smart contracts, smart accounts, and cross-chain transfers are the top priorities this year." and on docs: "A clear README that shows how your project works, including its specs. That does most of the work for judges."
- **Event type:** `mixed` (SDF summit winners reward novel mechanisms; regional winners reward a named real-world user with a working payment flow; this event's criteria mix both).

Full detail in Appendix A.

## 2. Builder constraints

From `00-constraints.md`, plus answers given after the research:

- **Solo.**
- **Comfortable stack:** Rust / Soroban contracts, TypeScript / Next.js frontend, Stellar SDK (classic operations, Horizon, RPC), passkeys / smart wallets.
- **Rules the builder set for this event:**
  - Minimal.
  - Immediately consumable in real life.
  - Not a "soundbox" (not a showpiece with no real use).
  - Plug-and-play, not siloed.
  - Scoped to win, not to impress.
  - Shipped as a live product with a working frontend reachable from a URL, not a repo that only runs when cloned.
  - A product that scales, not a developer's tool.
  - Mora (the earlier pick) is excluded. Fresh start.
- **Network:** testnet demo is acceptable (confirmed by the builder). Mainnet is optional, never required.
- **Track:** General Track only.
- **Submission:** open-source repo, video pitch 3 minutes max, project description, email, track selection, other links optional, accept Stellar Passport terms. Registration needs a GitHub profile. Live deployment not required by the event, but required by the builder's own rule.
- **No build schedule, task breakdown or day-by-day plan appears in this document**, by the builder's standing preference and the ideaskill rule.

## 3. Problem

### The person
A Stellar user whose wallet is a passkey smart account (a C-address). passkey-kit's smart wallet v0.17.0 was uploaded to Stellar testnet (ledger 4454440) and mainnet (ledger 64229392) on 2026-09-01, so these wallets exist on both networks today. The user holds USDC, for example a bounty or a prize paid into that wallet, and wants naira. In Nigeria the usual route from USDC to naira runs through an exchange's P2P desk, so the user opens their exchange, which shows a Stellar deposit address and a memo.

### The moment
They press send in their smart wallet.

1. A transfer out of a smart wallet is a contract call (`InvokeHostFunction`). The network rejects any memo on it. stellar-core `TransactionFrame::validateSorobanMemo()` returns false when a single `INVOKE_HOST_FUNCTION` transaction carries a memo or a muxed source, with the diagnostic "Soroban transactions are not allowed to use memo or muxed source account", enforced from `ProtocolVersion::V_25`.
2. Without the memo, SDF's own docs say "transfers from contracts are not supported by exchanges today."
3. Switching to a classic wallet hits the reserve wall: a new account needs XLM for its base reserve plus the USDC trustline before it can hold USDC (stellar-protocol discussion #1956: "Withdrawal flows stall, and support burden rises"; Freighter issue #3002: "Activate and transact in Freighter without first holding XLM").

### The loss
Access to their own money. If they send anyway without a memo, the exchange cannot credit it and must handle it by hand; SDF says a missing memo "causes anxiety for the user when they think their funds have been lost."

### Pains this addresses (from the pain bank)
- **P-13** A passkey smart-wallet user cannot withdraw to a centralized exchange, because "transfers from contracts are not supported by exchanges today." High, every smart-wallet user who wants to exit to an exchange.
- **P-14** A smart-wallet user cannot attach the exchange or ramp memo, because "Memos are disallowed when the transaction invokes a contract." High, same moment.
- **P-15** A new Freighter user cannot transact at all until they first acquire XLM. High, every new user.
- **P-09** A first-time recipient of a classic Stellar asset stalls mid-withdrawal when the wallet asks for a trustline and they hold no XLM for the reserve. High, every first-time recipient.

## 4. Why the obvious fixes fail

**Obvious fix A: "Send it to a classic wallet like LOBSTR first, then to the exchange."**
1. A new classic account cannot hold USDC until it has XLM for its reserve and the USDC trustline. Withdrawals stall at exactly that prompt (#1956), and payout programs require the wallet to "hold a small XLM balance" (Drips Wave). The only place to buy XLM is the exchange the user cannot reach.
2. It hands a passkey user a seed phrase for a one-time exit, which is what smart wallets exist to avoid.

**Obvious fix B: "Send to a muxed M-address (CAP-67) instead of using a memo."**
1. The transfer is still a contract call, and exchanges do not credit contract transfers (SDF smart-wallet docs).
2. Muxed IDs are 64-bit numbers, so exchanges that issue text memos cannot be reached at all (rhino.fi docs: muxed addresses and `MEMO_ID` are capped at 64 bits).

**Obvious fix C: "Wait for the protocol to add muxed C-addresses."**
Discussion #1950 is a proposal, not shipped, contested in the thread, and even if shipped, exchanges would still need to start indexing contract transfers.

## 5. Solution and mechanism

### One flow
```
1. User pastes exchange address + memo, signs in with a passkey on Portaj
2. WebAuthn PRF ──► 32 bytes ──► ed25519 key ──► the user's own G address (same passkey, same G every time)
3. Sponsor tx: BeginSponsoring ─► CreateAccount(G, 0 XLM) ─► ChangeTrust(USDC) ─► EndSponsoring
4. Smart wallet (C) ──SEP-41 transfer(C ─► G, amount)──► USDC lands in G
5. G ──classic Payment(USDC) + memo──► exchange deposit address; sponsor fee-bumps the tx
6. Receipt page: three explorer links; G native balance 0; reserves show the sponsor
```

- First exit for a passkey: three transactions (setup, transfer in, payment out).
- Every later exit: two transactions (transfer in, payment out). The G account and trustline already exist.
- G is a **transit** account: USDC sits in it for one ledger between steps 4 and 5. Portaj never holds user keys or user funds.

### Two modes (plug-and-play, not siloed)
- **Mode A · In-app smart wallet.** The user's smart wallet is a passkey-kit wallet created on Portaj. Portaj signs the C → G transfer directly. Target: one passkey prompt per exit (see §10, single-ceremony design). Used for the demo and for judges.
- **Mode B · Bring your own smart wallet.** Passkeys are bound to the domain that created them, so Portaj cannot sign for a wallet that lives on another site. Portaj shows the user's own G address and the exact amount; the user sends USDC from their own wallet app to that G; Portaj detects arrival and asks for one passkey prompt to sign the memo payment out. Works with any C-address wallet without integration.

## 6. Why this needs Stellar

### Differentiator sentence (from 02)
"Stellar can deliver a regulated dollar to a person who has never used the network, convert currencies inside the same transaction, and hand that dollar to a licensed cash-out point, which is impractical elsewhere because trustlines with issuer authorization and clawback, claimable balances, sponsored reserves, path payments over a built-in order book, and the SEP anchor interfaces are protocol-level or standard-level features on Stellar, while on other chains each is a separate app contract or a private integration."

### Port test: PASS
The pain only exists on Stellar: the C/G address split, the memo ban on contract invocations, and reserve-gated trustlines. No other chain needs this product.

### Delete-primitive test: PASS
Without sponsored reserves the user must first buy XLM, which needs an exchange, which is the thing they cannot reach.

### Primitives used
- **Host primitive:** Stellar classic accounts with sponsored reserves (CAP-33) and fee bumps (CAP-15). Without them the user must hold XLM before the G account can exist or hold USDC.
- **Sponsor slot:** the event has no sponsors. The second deep primitive is the smart account (passkey-kit, SEP-41 `transfer` from a C-address). Without it there is no stranded user to serve; with it, the transfer into the user's own G is the only Soroban step.
- Stellar Passport is not integrated (its stamp data could not be read publicly; see Appendix D, C-05).

## 7. Users and use cases

| User | Situation | What Portaj does |
|---|---|---|
| Passkey smart-wallet holder (primary) | Holds USDC in a C-address, wants it on an exchange to sell for naira or other fiat | Moves it with the memo, no XLM, no seed phrase |
| Bounty or prize winner paid into a smart wallet | Same as above, first time touching Stellar | Same, first-run setup is sponsored |
| Hackathon judge | Wants to verify the claim | Creates a testnet passkey wallet in-app, gets test USDC, runs an exit to the testnet exchange simulator, checks three explorer links |

Open question (unresolved by the builder): whether Stellar Passport's embedded wallets are C-addresses. If they are, Passport users are the most direct named population for this product. The Passport architecture page describes "Embedded Stellar wallets created per user and managed server-side (following Stellar's smart-wallet demo model)", which does not settle it.

## 8. Functional requirements

### FR-1 Exit form
- FR-1.1 Inputs: destination address (G or M), memo (type ID or TEXT), amount in USDC.
- FR-1.2 Validate destination with StrKey. Reject C-addresses as destinations (classic payments cannot target contracts).
- FR-1.3 If the destination is an M-address, decode it and treat the muxed ID as the memo for display; send the classic payment to the M-address.
- FR-1.4 Read the destination's account data. If `config.memo_required = 1` (SEP-29) is set and no memo is given, block with a clear message.
- FR-1.5 Amount precision: Stellar USDC has 7 decimals. Validate and display with 7; never assume 6.
- FR-1.6 Asset: Circle USDC only. Testnet issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`. Mainnet issuer configured separately. Never accept a look-alike issuer.

### FR-2 Passkey sign-in and G derivation
- FR-2.1 WebAuthn create or get on Portaj's own domain with the PRF extension (`prf.eval.first` = fixed salt, see §10).
- FR-2.2 Derive the ed25519 key in the browser. The seed never leaves the browser and is never stored.
- FR-2.3 Show the derived G address as "Your exit account".
- FR-2.4 If PRF is not available (`prf.enabled` false, or no `prf.results` on get), switch to the same-session fallback (§10.4) and say so plainly.

### FR-3 Sponsored setup
- FR-3.1 If the G account does not exist, request setup from the sponsor service.
- FR-3.2 Sponsor service builds tx1 (§9.1), signs as sponsor, returns XDR; the browser adds the G signature; sponsor service submits.
- FR-3.3 If the account exists but has no USDC trustline, build tx1 without `CreateAccount`.
- FR-3.4 Rate limit: one sponsored setup per passkey credential ID and per IP window. Refuse when the sponsor balance is below a floor.

### FR-4 Transfer in (C → G)
- FR-4.1 Mode A: build SEP-41 `transfer(C, G, amount)` with passkey-kit `buildTokenTransferHostFunction`, sign with the user's passkey, submit through the relayer path.
- FR-4.2 Mode B: show G and the exact amount; poll RPC/Horizon for the incoming USDC; continue when the G balance reaches the amount.

### FR-5 Payment out (G → exchange)
- FR-5.1 Build tx3 (§9.3): source G, `Payment(USDC, amount)` to destination, memo attached.
- FR-5.2 Sign the inner transaction with the derived G key; wrap in a fee bump paid by the sponsor.
- FR-5.3 Submit; on success G's USDC balance returns to 0.

### FR-6 Receipt
- FR-6.1 Show three explorer links (stellar.expert): setup (first run only), transfer in, payment out.
- FR-6.2 Show G's native balance (0) and that its reserves are sponsored.
- FR-6.3 Show the memo exactly as sent.

### FR-7 The "before" panel
- FR-7.1 A button that tries the naive path: the smart wallet sends USDC to the exchange address with the memo attached.
- FR-7.2 Display the network's rejection verbatim: "Soroban transactions are not allowed to use memo or muxed source account".
- FR-7.3 Optional second attempt without memo: the contract transfer lands on-chain, and the testnet exchange simulator does not credit it (it only credits classic payments with a memo, mirroring real exchanges per SDF docs).

### FR-8 Recovery
- FR-8.1 "Return to my wallet": if USDC is sitting in G, send it back to the user's C-address with a SEP-41 transfer signed by G, fee-bumped by the sponsor.
- FR-8.2 "Resume exit": re-derive G with the same passkey and retry tx3.

### FR-9 Judge onboarding (testnet only)
- FR-9.1 "Create a test smart wallet" with passkey-kit on testnet.
- FR-9.2 "Get test USDC": send a small amount from a sponsor-held testnet USDC stash (funded from https://faucet.circle.com) to the new wallet. Hidden on mainnet.

### FR-10 Testnet exchange simulator (§12)

## 9. Transaction specifications

Libraries: `@stellar/stellar-sdk` 17.2.1 (current, modified 2026-10-01) with `@stellar/stellar-base` 15.0.0; passkey-kit at commit `74210a4` (v0.17.0 smart wallet).

### 9.1 tx1 · Sponsored setup (first run only)
| # | Operation | Source | Notes |
|---|---|---|---|
| 1 | `beginSponsoringFutureReserves({ sponsoredId: G })` | Sponsor | |
| 2 | `createAccount({ destination: G, startingBalance: "0" })` | Sponsor | Zero allowed: stellar-base `create_account.js` uses `isValidAmount(..., true)`; core `CreateAccountOpFrame.cpp` uses `createEntryWithPossibleSponsorship` |
| 3 | `changeTrust({ asset: USDC })` | G | Trustline reserve sponsored |
| 4 | `endSponsoringFutureReserves()` | G | Must be in the same tx |
Transaction source and fee: Sponsor. Signatures: Sponsor + G.
Result: G exists with 0 XLM, USDC trustline, all reserves sponsored.

### 9.2 tx2 · Transfer in (Mode A)
- Single `InvokeHostFunction`: USDC SAC `transfer(from = C, to = G, amount)`.
- Built with passkey-kit `buildTokenTransferHostFunction(tokenContract, from, to, amountInStroops)`.
- Auth: the user's passkey signs the auth entry for C. No memo (the network forbids it).
- Fee: relayer / sponsor.

### 9.3 tx3 · Payment out
- Inner tx: source G, one `payment({ destination, asset: USDC, amount })`, memo = exchange memo (ID or TEXT), signed by the derived G key.
- Outer: `TransactionBuilder.buildFeeBumpTransaction(sponsor, baseFee, innerTx, networkPassphrase)`, signed by sponsor.
- Result: exchange receives a classic payment with its memo. G's native balance stays 0.

### 9.4 tx4 · Return to wallet (recovery)
- Inner tx: source G, `InvokeHostFunction` SAC `transfer(from = G, to = C, amount)`, signed by G (source account auth).
- Fee bump by sponsor.

### 9.5 Not used
No claimable balances, no custom contract of Portaj's own, no anchors.

## 10. Key derivation specification

### 10.1 PRF ceremony
- Relying party: Portaj's domain.
- `extensions.prf.eval.first = SHA-256("portaj:stellar:g-account:v1")`. Fixed per network family; never per transaction.
- On create: check `prf.enabled`; if PRF output is not returned at creation, evaluate it in an immediate `get()` (MDN notes fewer authenticators return PRF on create).

### 10.2 Seed to G
- `seed = HKDF-SHA256(ikm = prf.results.first, salt = "portaj", info = "stellar-ed25519-seed:" + networkPassphraseHash, length = 32)`.
- `Keypair.fromRawEd25519Seed(seed)` (present in stellar-base `lib/keypair.js`).
- Testnet and mainnet derive different G addresses because the info string includes the network.

### 10.3 Single-ceremony design (Mode A, target)
One `navigator.credentials.get` call with `challenge` = the Soroban auth payload hash for tx2 and `extensions.prf.eval` set. The assertion signs tx2; the PRF output derives G, which signs tx3. If the smart-wallet signer and the PRF credential differ, fall back to two prompts.

### 10.4 Fallback when PRF is unavailable
Generate a one-time key with `Keypair.random()` held in memory. Complete tx1 to tx3 in one session. If the session breaks between tx2 and tx3, the funds are in an account whose key is gone, so in fallback mode the UI requires the user to keep the page open and shows a downloadable one-time recovery file containing the secret before tx2 is sent. State this risk plainly on screen.

### 10.5 Supported authenticators (from mera's live tests)
- Works: iCloud Keychain (Safari 18 / iOS 18+, macOS 15+; Chrome 132+ on macOS; Firefox 139+ on macOS), Google Password Manager (Chrome on Android and desktop when signed in, Chrome 132+; Edge on Android), Windows Password Manager (Windows 11 25H2+), 1Password, YubiKey 5C Nano, Proton Pass.
- Does not work: Chrome local profile, Bitwarden, Dashlane.
- Native apps need iOS 18+ or Android 9+.
- Known caveat: Safari cross-device (QR/hybrid) flow returned PRF inconsistently; after 18.2 it returns a different value than on-device. Portaj must warn that the same device should be used, and Mode B recovery depends on it.

## 11. Failure handling and recovery

| Failure | Detection | Handling |
|---|---|---|
| PRF unsupported | `prf.enabled` false / no results | Fallback §10.4 |
| Sponsor out of funds or rate limited | Sponsor service refusal | Plain message; no partial state |
| tx1 fails | Submit result | Nothing moved; retry |
| tx2 fails | Submit result | Nothing moved; retry |
| tx2 succeeds, tx3 fails | G USDC balance > 0 | "Resume exit" (re-derive, resubmit) or "Return to my wallet" (tx4) |
| Destination lacks USDC trustline | tx3 `op_no_trust` | Stop; offer "Return to my wallet" |
| Memo required but missing | SEP-29 data entry | Block before tx2 |
| Wrong issuer / look-alike USDC | Asset check | Block |
| PRF value differs on another device | Derived G has no account | Warn "use the device you started on"; funds remain safe in the original G |

## 12. Testnet exchange simulator

Testnet has no real exchanges, and the builder confirmed a testnet demo is acceptable. Portaj ships a clearly labeled simulator so the "after" is visible on testnet.

- One testnet G deposit account with the SEP-29 data entry `config.memo_required = 1`.
- A page that reads Horizon payments to that account and credits a balance per memo, the way exchanges do.
- **Credits only classic `payment` operations with a memo.** Contract transfers and memo-less payments land on-chain but are not credited, mirroring SDF's statement that exchanges do not support transfers from contracts and the SEP-29 memo flow.
- Label on screen: "Testnet exchange simulator. Real exchanges behave this way per SDF documentation."
- Optional: one recorded mainnet run to a real exchange with a small amount, shown in the video only. Not required.

## 13. Non-functional requirements

- **No custody.** Portaj never stores or transmits the user's G seed or smart-wallet keys. The only server key is the sponsor key.
- **Sponsor key safety.** Held server-side (environment secret). The sponsor service only signs tx1 shapes and fee bumps whose inner tx source is a G it sponsored. It refuses arbitrary transactions.
- **Abuse limits.** Per-credential and per-IP limits on setups; balance floor; testnet live demo by default.
- **Transit guarantee.** After a successful exit, G holds 0 USDC and 0 XLM.
- **Verifiability.** Every step yields an explorer link.
- **Mobile first.** Works at phone width; passkey prompts on iOS and Android.
- **Plain language.** No hype words in UI or README.

## 14. Architecture and stack

```
Browser (Next.js, TypeScript)
  ├─ WebAuthn PRF ──► derive G key (in memory only)
  ├─ passkey-kit (Mode A smart wallet, SEP-41 transfer)
  └─ calls ──► /api/sponsor (serverless)
                  ├─ builds + signs tx1 (sponsor) and fee bumps
                  ├─ rate limits, balance floor
                  └─ submits to Stellar RPC / Horizon
Stellar testnet
  ├─ Circle USDC (classic asset + SAC)
  ├─ passkey-kit smart wallet v0.17.0 (WASM hash 97ce0478…a764e)
  └─ Exchange simulator deposit account (SEP-29 memo_required)
Simulator page ──reads Horizon payments──► credits by memo
```

- Frontend: Next.js + TypeScript, deployed at a public URL.
- Chain: `@stellar/stellar-sdk` 17.2.1, Stellar RPC for Soroban, Horizon for classic payments and account data.
- Wallet: passkey-kit at commit `74210a433abc2943f33f4747aa6d33be98bfa539`.
- No Soroban contract written by Portaj.

## 15. Screens and copy

1. **Home:** "Send USDC from your passkey wallet to any exchange. No XLM. No seed phrase." Buttons: "Exit to an exchange", "Try it on testnet".
2. **Exit form:** address, memo, amount; memo-required check; "Continue with passkey".
3. **Your exit account:** shows G; "Set up (paid by Portaj)" on first run.
4. **Mode B wait screen:** "Send exactly X USDC to your exit account from your wallet." Live balance.
5. **Sending:** step list with live status for each transaction.
6. **Receipt:** three links, "Your exit account holds 0 XLM", memo as sent.
7. **Before panel:** "Try the normal way" with the verbatim network error.
8. **Testnet exchange simulator:** per-memo credited balances, uncredited contract transfers listed separately.
9. **Recovery:** "Resume exit" and "Return to my wallet".

## 16. Demo moment, claim and judge verification

### Demo moment (under 30 seconds, testnet)
- **Before:** a passkey smart wallet sends 20 USDC to the exchange simulator's address with a memo. The network rejects it: "Soroban transactions are not allowed to use memo or muxed source account".
- **After:** same wallet, Portaj, one passkey prompt, two transactions. The simulator shows +20 USDC credited to that memo. Overlay: "XLM held by user: 0. Seed phrases: 0."

### The claim
"With Portaj, a smart-wallet user's USDC cannot be stranded for lack of a memo, a trustline or XLM."

### How a judge checks it
1. The "before" error string matches stellar-core's `validateSorobanMemo` rule.
2. On stellar.expert the user's G shows native balance 0, account and trustline reserves sponsored by the Portaj sponsor.
3. The final payment has the memo, goes to the deposit address, and its fee is paid through a fee bump.
4. They repeat it with their own passkey smart wallet on testnet from the live URL.

### Judge's first 30 seconds
- Video: the before/after above.
- README: one sentence, the claim, three explorer links, a "verify it yourself" list.

## 17. Scope

### In
- Live web app at a public URL.
- Passkey sign-in with PRF, deriving the user's own G key in the browser.
- Sponsored creation of that G account plus USDC trustline, through a sponsor service with a per-passkey rate limit.
- SEP-41 transfer from a passkey-kit smart wallet to the user's G (Mode A) and detection of a user-sent transfer (Mode B).
- Classic USDC payment with memo from G to the exchange address, fee-bumped by the sponsor.
- Receipt page with three explorer links.
- Same-session one-time key fallback when PRF is unavailable.
- Recovery: resume exit, return to wallet.
- Testnet exchange simulator and judge onboarding (test wallet, test USDC).

### Out
- Inbound direction (exchange to smart wallet).
- Assets other than USDC.
- Anchors, MoneyGram, or any direct fiat cash-out.
- An SDK or embed for other wallets.
- Fees, pricing or business model.
- Native mobile app.
- Any custody of user keys or funds by Portaj.
- Stellar Passport integration.

## 18. Judging criteria mapping

| Judging criterion | Weight | How Portaj satisfies it |
|---|---|---|
| Technical execution | unweighted | Two-transaction flow across Soroban and classic: SEP-41 transfer out of a passkey-kit smart wallet, then a classic memo payment from a sponsored 0-XLM account, all verifiable on an explorer |
| Meaningful use of Stellar | unweighted | Built on rules only Stellar has: memos are banned on contract invocations, reserves gate trustlines, and sponsored reserves plus fee bumps let a third party carry them |
| Originality | unweighted | No product found that moves USDC from a Stellar smart account to an exchange memo deposit (prior art: CLEAR) |
| Potential impact | unweighted | Removes a blocker for every smart-wallet user who wants fiat through an exchange; smart accounts are a stated HackMeridian 2026 priority |
| User experience | unweighted | Paste address and memo, one passkey prompt, done. No XLM purchase, no seed phrase, no trustline prompt |
| Presentation quality | unweighted | The "before" is the network's own error string; the "after" is an exchange balance going up. Under 30 seconds |

## 19. Submission requirements and README

### Submission form (from the event's `submission_schema`)
- Project name: Portaj.
- Describe your project.
- Submission Track: General Track.
- Email.
- Link to repo (must be open source).
- Link to video pitch (3 minutes max).
- Other relevant links: live URL, explorer links.
- Accept Stellar Passport Terms and Conditions.

### README must contain
- One sentence of what it does.
- The claim and the "verify it yourself" list (§16).
- The mechanism diagram (§5).
- Specs: transaction shapes (§9), key derivation (§10), recovery (§11).
- Testnet addresses: sponsor, simulator deposit account, USDC issuer.
- Source references proving the problem (stellar-core `validateSorobanMemo`, SDF smart-wallet docs).
- Limits: PRF authenticator list, Safari cross-device caveat, simulator label.

## 20. Risks, kill criteria and open questions

### Kill criteria
- A major exchange starts crediting SAC transfers from C-addresses, or SDF ships muxed C-addresses that exchanges index. Narrow to the inbound direction or drop.
- PRF missing or inconsistent on the demo device (Safari cross-device issue). Use the same-session one-time key and never leave funds in G after the session.
- passkey-kit wallet creation fails on testnet. Use the existing v0.17.0 deployment.
- The sponsor key gets drained by scripted account creation and cannot be rate-limited. Keep the public live demo on testnet.

### Resolved
- Judges list: none published (confirmed by the builder). Remains `UNVERIFIED`; design for Stellar Chile ambassadors and SDF devrel.
- Network: testnet demo is acceptable (confirmed by the builder). Mainnet risk removed.

### Still open (the builder could not find answers)
- Whether Stellar Passport wallets are smart wallets (C-addresses). If yes, Passport users are the named population.
- Whether any exchange already credits transfers from smart wallets. If one does, the core claim breaks for that exchange (kill criterion above). Treat SDF's docs as current until shown otherwise.
- P2P naira reversal window (relevant only to the runner-up).

### Other risks
- Small smart-wallet user base today. Mitigation: the judge can create a wallet and run the flow during judging, so the "needs users" red flag does not fully apply.
- "Do not use PRF to derive encryption keys for data" warnings exist in the passkey community (https://lilting.ch/en/articles/passkeys-prf-extension-encryption-risk). Portaj uses the key only for a transit account that holds funds for one ledger; the risk is stated in the README.

## 21. Validation message

Post in the Stellar developer Discord (https://discord.com/invite/stellardev) and the Stellar Passport organizers' channel. Status: PENDING USER.

> Hi, I'm building Portaj for Find Your Way. Passkey smart-wallet users can't send USDC to exchange deposits, because Soroban transactions can't carry a memo and exchanges don't credit contract transfers. Portaj routes the funds through the user's own passkey-derived G account, created with sponsored reserves (0 XLM, no seed phrase), and pays the exchange with the memo. Is this a smart-account use you'd want to see, and is anyone at SDF already fixing C-address exchange withdrawals?

## 22. Success measures

- During judging: a judge completes an exit on testnet from the live URL without help.
- On every completed exit: G holds 0 USDC and 0 XLM afterwards; memo matches input; three explorer links resolve.
- After the event: Stellar Passport or a passkey-kit wallet team asks to link to Portaj; SDF showcases it under smart accounts.

---

## 23. Appendix A · Event intel in full

### Sources of event data
- Public page (client-rendered, empty without JS): https://demo.stellarpassport.xyz/hackathons/find-your-way-meridian-hackathon
- Full spec as JSON: https://demo.stellarpassport.xyz/api/hackathons/find-your-way-meridian-hackathon
- Only hackathon on the Passport API: https://demo.stellarpassport.xyz/api/hackathons

### Tracks, quoted exactly
General Track:
> "The General Track is open to builders creating projects that use Stellar or contribute meaningfully to its ecosystem. Participants can submit solutions across areas such as payments, financial inclusion, tokenization, smart contracts, developer tools, wallets, identity, commerce, education, and public goods. Projects will be evaluated based on technical execution, meaningful use of Stellar, originality, potential impact, user experience, and presentation quality."

University Track:
> "The University Track recognizes promising student builders currently enrolled at a university in Chile. Participants must create a project using Stellar and submit a pitch video explaining the problem, their solution, how the project works, and how it uses Stellar technology. To qualify, participants must also provide valid proof of current university enrollment in Chile."

### Other event fields
- `team_min` 1, `team_max` 5, `attendance_points` 50, `winner_points` 0. Prize places carry Passport points (1st 500, 2nd 250, 3rd 200, honorable mentions 100, university 250).
- Registration: GitHub profile required.

### Organizer: Stellar Passport
- Passkey onboarding with embedded Stellar wallets and a Soroban StampRegistry of non-transferable participation stamps.
- Built by a long-time Stellar ecosystem member who serves "as President of the Stellar Ambassador Program in Chile", through a US-based studio.
- Deployed at Meridian 2025: "more than 2,000 QR scans and over 450 sign ups in less than two days".
- Success metric: "At least one other Stellar project or program uses Passport data, directly, or through exports, to drive follow-up actions".
- Wish-list: "small event action budgets, simple cash-out flows to external wallets, more advanced quests (send, swap, mint, try an app), and deeper post-event funnels."
- SCF #40, $150.0K Build award.
- Sources: https://communityfund.stellar.org/submissions/recNtjEdsDndBoRBD · https://communityfund.stellar.org/dashboard/submissions/recNtjEdsDndBoRBD · https://bastianstudio.notion.site/stellar-passport-architecture

### HackMeridian (destination event)
- 25 to 26 Oct 2026, ONE16, Lisbon; up to $30,000 in XLM; Genesis and Scale tracks; solo applicants welcome; AI-assisted development allowed; travel support for selected participants.
- Priorities: smart contracts, smart accounts, cross-chain transfers.
- Build page says criteria are published there, but none render: https://www.hackmeridian.com/build
- https://www.hackmeridian.com/ · https://www.hackmeridian.com/faq · https://www.hackmeridian.com/events

### Recent Stellar shipments (last ~90 days)
| Date | Shipment | Source |
|---|---|---|
| 2026-09-28 | Soroban Rust SDK v28: executable references (CAP-85), migration-friendly contract data (CAP-86), sparse events, spec shaking v2 | https://stellar.org/blog/developers/soroban-rust-sdk-v28 |
| 2026-09-24 | Confidential stablecoins, issuer-controlled architecture (OpenZeppelin) | https://stellar.org/blog/developers/practical-confidential-stablecoins-an-issuer-controlled-architecture |
| 2026-09-16 | Protocol 28 "Adapter" mainnet vote (testnet 2026-08-27): CAP-83, CAP-85, CAP-86 | https://stellar.org/blog/developers/introducing-adapter-protocol-28-on-stellar |
| 2026-09-14 | Pyth Pro live on Stellar mainnet, 3,500+ feeds | https://stellar.org/blog/developers/real-time-prices-for-stellars-4b-tokenized-assets-economy |
| 2026-08-24 | Stellar Private Payments developer preview, testnet only | https://stellar.org/blog/developers/developer-preview-stellar-private-payments |
| 2026-07-16 | Monitoring Stellar with Hypernative | https://stellar.org/blog/developers/monitoring-stellar-with-hypernative |
| 2026-07-08 | Soroban SDK 27.0.0: CAP-71 auth delegation (`CustomAccount::delegate_auth`, `get_delegated_signers`) | https://github.com/stellar/rs-soroban-sdk/releases |
| 2026 | Circle CCTP live on Stellar, USDC to and from 23 chains, Hooks | https://stellar.org/blog/foundation-news/circle-cctp-is-live-on-stellar |

stellar-core releases: v28.0.0 Protocol 28 (13 Aug), v27.0.0 Protocol 27 with CAP-0071 (05 Jun), v26.0.0 Protocol 26 with CAP-77 (31 Mar). https://github.com/stellar/stellar-core/releases

### Comparable past winners (event type evidence)
| Event | Winner | What it is | Source |
|---|---|---|---|
| Stellar Builder Summit São Paulo 2026 | QuietBook, 1st Enterprise Compliance & RWA | Confidential book-building: sealed bids, provable winner, atomic settlement | https://developers.stellar.org/meetings/2026/08/13 |
| Stellar Builder Summit São Paulo 2026 | StellarPay, 1st Agentic Payments | One interface for x402, MPP Charge, MPP Channel | same |
| Stellar Builder Summit São Paulo 2026 | Brazil kit, 1st Anchors & Ramps | PIX on/off-ramp aggregating live quotes from competing anchors | same |
| Stellar Builder Summit São Paulo 2026 | Privacy wallet, 1st Privacy | Passkey smart wallet with confidential transfers and a yield-earning shielded pool | same |
| Stellar Builder Summit São Paulo 2026 | Stellar Memory, 1st CLI Plugins & Dev Tooling | Links a Soroban repo to what is live on-chain | same |
| APAC Stellar Hackathon | Most Innovative Track | Wallet for foreigners in Vietnam to pay any merchant via bank QR, settled on Stellar | https://my.linkedin.com/in/ngjupeng |
| APAC Stellar Hackathon | Sobre, 3rd prize Grand Finale | Envelope-based remittance allocation for OFW families | https://ph.linkedin.com/in/reru |
| APAC Stellar Hackathon | PalengkePay, 1st in PH, 5th regional | Market-vendor QR payments, onchain income proof, Soroban escrow credit | https://ph.linkedin.com/in/pejana |

Classification: `mixed`.

## 24. Appendix B · Stellar primitives and overlap zones

Sponsor slot rule: the event has no sponsors, so the "sponsor" in the port and delete tests is the one deep Stellar-native primitive an idea depends on. Stellar Passport counts only if essential.

| ID | Primitive | Essential vs decorative | Known gaps |
|---|---|---|---|
| S1 | Anchor layer (SEP-10/24/31/38, MoneyGram Ramps) | Money leaves or enters a bank or cash point vs a link to someone else's app | SEP-6 one-off deposit model (#1902); memos banned on contract calls break C-address on-ramps (#1950) |
| S2 | Trustlines, issuer auth flags, clawback, claimable balances, sponsored reserves | Safety enforced by protocol vs a plain payment | Trustline/XLM wall (#1956); silent x402 failures (#1935); Freighter #3002, #3011 |
| S3 | Smart accounts (passkeys, policy signers, CAP-71) | A limit the account enforces vs passkey login only | "transfers from contracts are not supported by exchanges today"; no muxed C-addresses (#1950); passkey lockouts |
| S4 | Path payments over SDEX, oracles (Reflector, Pyth Pro) | Atomic cross-asset payment with price check vs showing a price | YieldBlox thin-market oracle drain; 7 vs 6 decimals (#1935) |
| S5 | Privacy (SPP testnet, confidential tokens) | | Small pools leak; deposit retry trap (#428); event leaks (#368) |
| S6 | Circle CCTP | | Classic vs Soroban USDC collision (#1935); CCTP assumes `mintRecipient` is a contract, use `CctpForwarder` |
| S7 | Stellar Passport | | Wallets "managed server-side"; no public stamp API found |

Overlap zones: Z1 paying someone not on Stellar yet (S2 + S1); Z2 narrow keys on a shared account (S3); Z3 issuer-level controls as counterparty protection (S2 + S4); Z4 cross-chain USDC that arrives safely (S6 + S2); Z5 participation as a condition on money (S7 + S2). Portaj sits across S2 and S3.

Facts confirmed in docs:
- AUTH_REQUIRED: "an issuer must approve an account before that account can hold its asset"; revocation "prevents that account from transferring or trading the asset". https://developers.stellar.org/docs/tokens/control-asset-access
- Claimable balance predicates: UNCONDITIONAL, BEFORE_RELATIVE_TIME, BEFORE_ABSOLUTE_TIME, NOT/AND/OR; creator reclaims only if listed. https://developers.stellar.org/docs/learn/encyclopedia/transactions-specialized/claimable-balances
- MoneyGram Ramps went live on Solana on 2026-08-11, so it no longer passes the port test. https://egamers.io/solana-gets-direct-access-to-moneygrams-500000-cash-counters-as-ramps-expands-beyond-stellar/

## 25. Appendix C · Pain bank

Format: person loses thing when moment | source | severity.

| ID | Pain | Source | Severity |
|---|---|---|---|
| P-01 | Nigerian POS agent loses cash handed over when a fake alert shows "success" and the reversal appears hours later | https://humanglemedia.com/fake-alerts-dubious-stunts-the-digital-scams-draining-nigerias-pos-economy | High, daily |
| P-02 | Nigerian P2P seller loses naira and crypto when the buyer files an "unauthorised" dispute after release (₦689,908 case) | https://techcabal.com/2025/03/03/how-p2p-traders-navigate-daily-scams-fraud-and-frozen-accounts/ | High |
| P-03 | P2P seller's crypto locked in escrow by a stalling scammer ("coin locking") | same | Medium |
| P-04 | P2P trader's bank account frozen by a first-time buyer's transfer | same | High |
| P-05 | Lagos freelancer loses ~5% per USD→naira conversion, ~30% of a quarter's billing | https://spendfigo.com/blog/the-lagos-freelancers-guide-to-getting-paid-in-dollars-without-losing-30-to-fees | High |
| P-06 | Freelancer loses weeks of access when a platform freezes the account | same | Medium |
| P-07 | 35 susu savers lose GH¢156,455 when the collector disappears | https://www.modernghana.com/news/1509821/susu-collector-arraigned-for-allegedly-defrauding.html | High |
| P-08 | Ajo member loses her payout on her turn when the holder is unreachable | https://www.legit.ng/people/1558842-turn-cash-lady-cries-ajo-contribution-leader-trance/ | High |
| P-09 | First-time Stellar asset recipient stalls at the trustline/XLM prompt | https://github.com/stellar/stellar-protocol/discussions/1956 | High |
| P-10 | x402 merchant silently loses payments without a USDC trustline | https://github.com/stellar/stellar-protocol/discussions/1935 | Medium |
| P-11 | Facilitator under-quotes Stellar USDC by 10x (7 vs 6 decimals) | same | Medium |
| P-12 | Merchant misses bridged classic USDC while watching Soroban USDC | same | Medium |
| P-13 | Smart-wallet user cannot withdraw to an exchange | https://developers.stellar.org/docs/build/apps/smart-wallets | High |
| P-14 | Smart-wallet user cannot attach a memo to a contract call | https://github.com/stellar/stellar-protocol/discussions/1950 | High |
| P-15 | New Freighter user must acquire XLM first | https://github.com/stellar/freighter/issues/3002 | High |
| P-16 | User claims spam claimable balance, locks 0.5 XLM, gets pulled to scam links | https://stellar.org/blog/how-to-protect-yourself-from-scammers | Medium |
| P-17 | Buyer pays for a look-alike asset | same | Medium |
| P-18 | YieldBlox/Blend depositors lose $10M+ via thin-SDEX oracle manipulation (USTRY ~$1.06 → ~$107) | https://blocksec.com/blog/yieldblox-dao-incident-on-stellar-oracle-misconfiguration-enabled-a-10m-drain | Severe |
| P-19 | Wallet user locked out when passkey and email recovery fail (2026-09-23 review) | https://uk.trustpilot.com/review/lobstr.co | Medium |
| P-20 | User sends USDC to a pre-saved wallet donation address, gets back <20% after a $50 fee | same | Low freq, high severity |
| P-21 | Anchor cannot give reusable receiving instruments (SEP-6 one-off model) | https://github.com/stellar/stellar-protocol/discussions/1902 | Medium |
| P-22 | Privacy-pool deposit trapped after retry | https://github.com/NethermindEth/stellar-private-payments/issues/428 | Low |
| P-23 | Privacy-pool payments linkable in small pools | https://stellar.org/blog/developers/developer-preview-stellar-private-payments | Medium |
| P-24 | Traders lose funds when bot API keys leak (3Commas) | https://www.theblock.co/amp/post/179237/ftx-api-keys-3commas-exploited | Severe |
| P-25 | Telegram bot users drained $523k | https://decrypt.co/224371/solana-telegram-trading-bot-shut-down-users-drained-523k | Severe |
| P-26 | Hackathon winners wait 4+ months for prizes (Safe DAATA) | https://forum.safefoundation.org/t/revisiting-the-prize-distribution-process-of-hackathon-a-call-for-simplification-and-transparency/4721 | Medium |
| P-27 | Incentive budget farmed by fake accounts (Keybase Stellar airdrop ended early) | https://decrypt.co/14672/keybase-ends-stellar-airdrop-thanks-hordes-crappy-fake-accounts | High |
| P-28 | `BUILDER-OBSERVED` Creator paying giveaway winners in USDC loses hours to failed payments (no trustline/XLM) | builder edge | Medium |
| P-29 | `BUILDER-OBSERVED` Trader must hand a bot/manager a key that can also withdraw | builder edge; P-24, P-25 | High |

Dropped (with reasons): "Onboarding is hard" (vague); "Users want privacy" (vague); Aid Assist recipients lack restrictions (no loss, no moment); OFW lump-sum remittances (pain inferred from a solution); CAP-85 partial upgrades (protocol admin, solved by Protocol 28); SPP fee not shown, #458 (no loss); partnership impersonation DMs (generic).

Totals: 29 kept, 27 with external sources.

## 26. Appendix D · All 14 candidates

| ID | Idea | Port | Delete | Outcome and reason |
|---|---|---|---|---|
| C-01 | Held Release: P2P USDC goes into a claimable balance the buyer claims after the bank-reversal window; seller can reclaim inside it | PASS | PASS | Runner-up (22). Seller reclaim creates a new way to cheat buyers; timelock escrow is portable; buyers need Stellar wallets |
| C-02 | **Portaj** | PASS | PASS | **Winner (23)** |
| C-03 | Esusu Lock: each daily deposit locked as a claimable balance for the saver until month-end; collector never holds the pot | PASS (weak) | PASS | Third (19). Crowded (Esusu on Celo live); savers need a cash-in route |
| C-04 | Turn Lock: ajo round contributions claimable only by that round's recipient | PASS (weak) | PASS | Dropped: does not touch the real ajo failure (members who already collected stop paying) |
| C-05 | Stamp Budget: event budget released only to wallets with the Passport stamp | PASS | PASS | Killed: no public stamp read found (feasibility 0); on the organizer's own roadmap |
| C-06 | Agent Leash: delegated signer pays only x402 receivers with trustlines | FAIL | PASS | Dropped: EVM session keys do the same; crowded category |
| C-07 | Cashier Key: attendant can only refund the original payer within 10 minutes | FAIL | PASS | Dropped: portable; misses the actual fake-alert loss |
| C-08 | Ledger Till: "paid" only from the ledger with per-sale muxed ID | FAIL | FAIL | Dropped: any chain; muxed IDs swappable |
| C-09 | Depth Ejector: measure SDEX depth behind Blend oracles; withdraw-only key pulls deposits | PASS | PASS | Killed: Blend withdraw and oracle mapping unverified, exceeds a solo 3-day budget (feasibility 0) |
| C-10 | Trade-only Key: bot signer limited to swaps to owner within an oracle band | FAIL | PASS | Dropped: EVM session keys plus Chainlink |
| C-11 | Code Cash: hash-locked USDC claimed by a POS agent with the pickup code | FAIL | PASS | Dropped: HTLCs are standard elsewhere; MoneyGram Ramps now on Solana |
| C-12 | Envelope Asset: AUTH_REQUIRED voucher spendable only at an approved school | PASS (weak) | PASS | Dropped: pain sourced only from a solution; needs merchants onboarded |
| C-13 | Naira Lane: SEP-38 quotes across NGN anchors replace P2P | PASS | PASS | Killed: no live NGN anchor with SEP-24/38 (feasibility 0) |
| C-14 | Inbox Guard: filter claimable-balance spam and look-alike assets | PASS | PASS | Dropped: wallets already resolve asset lists (Freighter #3004); demo is a filtered list |

## 27. Appendix E · Prior art

### For Portaj (verdict CLEAR)
- Classic G wallets that send to exchanges with a memo (Vesseo "Transfer to exchange"): need XLM, a trustline and a seed phrase. https://help.vesseoapp.com/hc/en-us/articles/31454573016215
- Drips Wave Stellar withdrawals: wallet must be a G-address, "must hold a small XLM balance", must have the USDC trustline; $1 test then full withdrawal; up to 1 to 3 business days. https://docs.drips.network/wave/withdrawing-rewards
- mera: PRF-derived keys for EVM and Solana, 2026-08-05; not Stellar, no sponsored reserves, no exchange flow. https://www.category.xyz/blogs/mera-crypto-onboarding-with-only-a-passkey-on-any-network
- Muxed C-address proposal: discussion only. https://github.com/stellar/stellar-protocol/discussions/1950
- SEP-29 memo-required flow (exchange side). https://stellar.org/blog/developers/fixing-memo-less-payments
- rhino.fi: muxed `M…` preferred, no separate memo field, trustline required, 64-bit limit. https://docs.rhino.fi/interacting-with-stellar
- Circle CCTP on Stellar: assumes `mintRecipient` is a contract; use `CctpForwarder`; 7-decimal USDC. https://developers.circle.com/cctp/references/stellar

Gap: nothing takes USDC out of a Stellar smart account into an exchange memo deposit for a user who holds no XLM and no seed phrase.

### For the other survivors
- C-01: Trustless Work (Soroban escrow infra) https://docs.trustlesswork.com/trustless-work/getting-started/about-trustless-work; Stellar CLI claimable balance guide https://developers.stellar.org/docs/build/guides/cli/tx-new-create-claimable-balance; exchange P2P escrow. Verdict CROWDED; angle: none mirror the bank reversal window on the crypto leg without a contract or custodian.
- C-03: Esusu on Celo (3,370+ wallet connections, 13+ groups, 25+ unique participants, mainnet `0xA590a71bA8E750aAC5726252E61a5172a48E35E1`) https://forum.celo.org/t/project-complete-esusu-almond-2025-grant-completion-report/12939; ETHGlobal Esusu https://ethglobal.com/showcase/esusu-5wa6a; CeloSave https://www.karmahq.xyz/project/celosave/about; Ajo https://www.karmahq.xyz/project/ajo-1/about. Verdict CROWDED (narrow angle).
- C-05: Passport wish-list; human.tech onchain stamps https://docs.passport.human.tech/building-with-passport/stamps/smart-contracts/integrating-onchain-stamp-data. CLEAR, roadmap risk.
- C-09: Hypernative, Blockaid https://blockaid.io/blog/73-quarantined-how-blockaid-and-stellar-validators-contained-a-10m-price-manipulation-attack, The Strategists https://communityfund.stellar.org/submissions/reckfq6k2nbFdORy0. CROWDED.
- C-13: São Paulo PIX kit; Globachain https://communityfund.stellar.org/submissions/recFXRB2XM6kLXBFU; Cowrie https://stellar.org/blog/ecosystem/cowries-cross-border-payment-services-for-nigeria-powered-by-stellar. CROWDED.

## 28. Appendix F · Scorecard and source verification

### Scorecard (0 to 3, event type mixed, no weighting)
| # | Criterion | C-02 Portaj | C-01 Held Release | C-03 Esusu Lock | C-05 | C-09 | C-13 |
|---|---|---|---|---|---|---|---|
| 1 | Specificity | 2 | 3 | 3 | 2 | 3 | 3 |
| 2 | Host essential | 3 | 2 | 1 | 3 | 3 | 3 |
| 3 | Sponsor essential | 3 | 3 | 3 | 3 | 3 | 3 |
| 4 | Demo moment | 3 | 3 | 2 | 2 | 2 | 2 |
| 5 | Feasibility | 2 | 3 | 3 | 0 | 0 | 0 |
| 6 | Defensible claim | 3 | 3 | 3 | 2 | 2 | 1 |
| 7 | Novelty | 3 | 2 | 1 | 3 | 2 | 2 |
| 8 | Judging fit | 2 | 2 | 2 | 3 | 2 | 2 |
| 9 | After-life | 2 | 1 | 1 | 2 | 2 | 2 |
| | Total | **23** | 22 | 19 | killed | killed | killed |

Portaj notes: specificity 2 because the person is sourced to SDF docs and stellar-core rather than a named individual's loss; feasibility 2 because PRF on unsupported authenticators needs a fallback; judging fit 2 because impact depends on smart-wallet adoption. With testnet now confirmed, the mainnet risk on the demo is gone.

### Source verification for Portaj
| Dependency | Where | Result |
|---|---|---|
| Memo ban on contract calls | stellar-core `src/transactions/TransactionFrame.cpp`, `validateSorobanMemo()`, gated from `ProtocolVersion::V_25`, commit `ba6a4e6e` | Confirmed |
| Sponsored zero-balance account | stellar-core `CreateAccountOpFrame.cpp` (`createEntryWithPossibleSponsorship`); stellar-base 15.0.0 `create_account.js`, `begin_sponsoring_future_reserves.js`, `end_sponsoring_future_reserves.js` | Confirmed |
| Fee bump | stellar-base `transaction_builder.js` `buildFeeBumpTransaction` | Confirmed |
| Key from seed | stellar-base `keypair.js` `fromRawEd25519Seed`, `random` | Confirmed |
| SEP-29 data entry | stellar-base `manageData` | Confirmed |
| Smart wallet transfer to G | passkey-kit `src/sac.ts` `buildTokenTransferHostFunction` | Confirmed |
| Smart wallet deployed | passkey-kit `docs/deployments-2026-09-01.md`: WASM hash `97ce047884106b1c6c3bb40b8973cc48db1c4dad95c9e20462bf2c701daa764e`, soroban-sdk 27.0.0, testnet ledger 4454440, mainnet ledger 64229392 | Confirmed |
| PRF support | MDN; mera authenticator table; Apple forum Safari caveat | Confirmed with caveats |
| Testnet USDC | Issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`, faucet https://faucet.circle.com | Confirmed (Circle docs) |
| Exchange credits classic payment with memo | SEP-29 blog, SDF smart-wallet docs | Docs-level; modeled by the testnet simulator |

### Final checklist (all true)
- Every fact has a URL or is marked `UNVERIFIED`.
- Passes port and delete-primitive tests.
- Hits no generic red flag in full.
- Demo under 30 seconds; claim judges can check.
- Core verified in current source; fits a solo build with margin if the PRF fallback stays minimal.
- Maps to the (unweighted) criteria, strongest on meaningful use of Stellar and technical execution.
- At most two deep primitives, both essential.
- No build schedule, task breakdown or day-by-day plan.

## 29. Appendix G · Runner-up and third place

### Runner-up: Held Release (C-01, 22)
- Sentence: for a Nigerian P2P USDC seller, the crypto leg is reclaimable for as long as the naira leg can be reversed, using claimable balances with time predicates.
- Mechanism: buyer pays naira → seller creates entry `{ buyer: NOT(before T+w), seller: before T+w }` → reversal inside w lets the seller reclaim and the buyer's claim fails → otherwise the buyer claims after T+w in any Stellar wallet.
- Claim: "a chargeback inside the window cannot take both the naira and the USDC."
- Why the obvious fix fails: reversals land after the naira already looks final; holding USDC in the seller's own account gives the buyer no proof; platform escrow protects the buyer and is abused for coin locking.
- Kill criteria: seller reclaim abuse cannot be bounded; reversal windows longer than buyers will wait; buyers will not hold Stellar wallets.
- Validation message: "Hi, I'm testing Held Release for Nigerian P2P sellers: the USDC goes into a claimable balance the buyer can claim only after the bank-reversal window, while the seller can reclaim inside it. Does this match how you want claimable balances used, and have you seen sellers ask for it?"

### Third: Esusu Lock (C-03, 19)
- Sentence: each daily esusu deposit becomes claimable only by the saver after month-end; the collector's fee is a separate entry; the collector never holds the pot.
- Claim: "a collector cannot disappear with the month's savings."
- Why the obvious fix fails: onchain savings groups remove the collector whose visits drive saving (Esusu on Celo: 3,370+ connections, 25+ unique participants); a vault contract asks a trader to trust unreadable code.
- Kill criteria: cash-in puts the collector back in custody of the cash leg; no cash-in route at judging time.
- Validation message: "Hi, I'm exploring claimable balances as daily-savings locks for esusu groups, so the collector keeps the discipline role but never holds the pot. Is this a use you'd want to see?"

---

## 30. Sources

Event and host
- https://demo.stellarpassport.xyz/hackathons/find-your-way-meridian-hackathon
- https://demo.stellarpassport.xyz/api/hackathons/find-your-way-meridian-hackathon
- https://demo.stellarpassport.xyz/api/hackathons
- https://demo.stellarpassport.xyz/api/events
- https://www.hackmeridian.com/
- https://www.hackmeridian.com/build
- https://www.hackmeridian.com/faq
- https://www.hackmeridian.com/events
- https://communityfund.stellar.org/submissions/recNtjEdsDndBoRBD
- https://communityfund.stellar.org/dashboard/submissions/recNtjEdsDndBoRBD
- https://bastianstudio.notion.site/stellar-passport-architecture
- https://developers.stellar.org/meetings/2026/08/13
- https://my.linkedin.com/in/ngjupeng
- https://ph.linkedin.com/in/reru
- https://ph.linkedin.com/in/pejana

Stellar shipments and docs
- https://stellar.org/blog/developers/soroban-rust-sdk-v28
- https://stellar.org/blog/developers/introducing-adapter-protocol-28-on-stellar
- https://stellar.org/blog/developers/practical-confidential-stablecoins-an-issuer-controlled-architecture
- https://stellar.org/blog/developers/real-time-prices-for-stellars-4b-tokenized-assets-economy
- https://stellar.org/blog/developers/developer-preview-stellar-private-payments
- https://stellar.org/blog/developers/monitoring-stellar-with-hypernative
- https://stellar.org/blog/foundation-news/circle-cctp-is-live-on-stellar
- https://github.com/stellar/rs-soroban-sdk/releases
- https://github.com/stellar/stellar-core/releases
- https://developers.stellar.org/docs/build/apps/smart-wallets
- https://developers.stellar.org/docs/tokens/control-asset-access
- https://developers.stellar.org/docs/learn/fundamentals/transactions/list-of-operations
- https://developers.stellar.org/docs/learn/fundamentals/anchors
- https://developers.stellar.org/docs/tools/ramps/moneygram.md
- https://developers.stellar.org/docs/learn/encyclopedia/transactions-specialized/claimable-balances
- https://stellar.org/blog/developers/fixing-memo-less-payments
- https://stellar.org/blog/how-to-protect-yourself-from-scammers
- https://developers.circle.com/stablecoins/quickstart-transfer-usdc-stellar
- https://developers.circle.com/cctp/references/stellar
- https://egamers.io/solana-gets-direct-access-to-moneygrams-500000-cash-counters-as-ramps-expands-beyond-stellar/

Pains and discussions
- https://github.com/stellar/stellar-protocol/discussions/1950
- https://github.com/stellar/stellar-protocol/discussions/1956
- https://github.com/stellar/stellar-protocol/discussions/1935
- https://github.com/stellar/stellar-protocol/discussions/1902
- https://github.com/stellar/freighter/issues/3002
- https://github.com/stellar/freighter/issues/3011
- https://github.com/stellar/freighter/issues/3004
- https://github.com/NethermindEth/stellar-private-payments/issues/428
- https://github.com/NethermindEth/stellar-private-payments/issues/368
- https://techcabal.com/2025/03/03/how-p2p-traders-navigate-daily-scams-fraud-and-frozen-accounts/
- https://spendfigo.com/blog/the-lagos-freelancers-guide-to-getting-paid-in-dollars-without-losing-30-to-fees
- https://humanglemedia.com/fake-alerts-dubious-stunts-the-digital-scams-draining-nigerias-pos-economy
- https://www.modernghana.com/news/1509821/susu-collector-arraigned-for-allegedly-defrauding.html
- https://www.legit.ng/people/1558842-turn-cash-lady-cries-ajo-contribution-leader-trance/
- https://blocksec.com/blog/yieldblox-dao-incident-on-stellar-oracle-misconfiguration-enabled-a-10m-drain
- https://uk.trustpilot.com/review/lobstr.co
- https://www.theblock.co/amp/post/179237/ftx-api-keys-3commas-exploited
- https://decrypt.co/224371/solana-telegram-trading-bot-shut-down-users-drained-523k
- https://forum.safefoundation.org/t/revisiting-the-prize-distribution-process-of-hackathon-a-call-for-simplification-and-transparency/4721
- https://decrypt.co/14672/keybase-ends-stellar-airdrop-thanks-hordes-crappy-fake-accounts
- https://docs.drips.network/wave/withdrawing-rewards
- https://docs.rhino.fi/interacting-with-stellar
- https://help.vesseoapp.com/hc/en-us/articles/31454573016215

Source verification
- https://github.com/stellar/stellar-core/blob/ba6a4e6e322a8069b85bdf48a35d971a2d72cc81/src/transactions/TransactionFrame.cpp
- https://github.com/stellar/stellar-core/blob/ba6a4e6e322a8069b85bdf48a35d971a2d72cc81/src/transactions/CreateAccountOpFrame.cpp
- https://www.npmjs.com/package/@stellar/stellar-base
- https://github.com/stellar/passkey-kit/blob/74210a433abc2943f33f4747aa6d33be98bfa539/src/sac.ts
- https://github.com/stellar/passkey-kit/tree/74210a433abc2943f33f4747aa6d33be98bfa539
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions
- https://mera.category.xyz/authenticator-support/
- https://developer.apple.com/forums/thread/774112
- https://lilting.ch/en/articles/passkeys-prf-extension-encryption-risk

Prior art
- https://www.category.xyz/blogs/mera-crypto-onboarding-with-only-a-passkey-on-any-network
- https://docs.trustlesswork.com/trustless-work/getting-started/about-trustless-work
- https://developers.stellar.org/docs/build/guides/cli/tx-new-create-claimable-balance
- https://forum.celo.org/t/project-complete-esusu-almond-2025-grant-completion-report/12939
- https://ethglobal.com/showcase/esusu-5wa6a
- https://www.karmahq.xyz/project/celosave/about
- https://www.karmahq.xyz/project/ajo-1/about
- https://docs.passport.human.tech/building-with-passport/stamps/smart-contracts/integrating-onchain-stamp-data
- https://blockaid.io/blog/73-quarantined-how-blockaid-and-stellar-validators-contained-a-10m-price-manipulation-attack
- https://communityfund.stellar.org/submissions/reckfq6k2nbFdORy0
- https://communityfund.stellar.org/submissions/recFXRB2XM6kLXBFU
- https://stellar.org/blog/ecosystem/cowries-cross-border-payment-services-for-nigeria-powered-by-stellar
