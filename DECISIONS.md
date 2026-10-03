# Decisions

Where the network, the installed SDKs, or the two spec documents disagreed with
the PRD, the network wins (PRD §22.2). Each entry says what was found, where,
and what was done.

## D-001 · Error 14 is a recipient-side code

**Found:** `soroban-env-host 28.0.2`, `stellar_asset_contract/balance.rs`. An XLM
transfer to an account that doesn't exist creates the account when the amount
is at least `2 × base_reserve` (F3 holds). Below that, the SAC fails with
`InsufficientAccountReserve = 14`, not `AccountMissingError = 6`.

**Impact:** with the PRD's set {6, 10, 11, 13}, a small XLM payment to an
inactive account would abort the whole batch, breaking principle 1.

**Done:** 14 joins the recipient-side set. Such a payment waits like any other
(PRD §11.3 updated in spirit). Test: `xlm_activates_new_account_when_large_enough`.

## D-002 · Credit assets report a missing account as error 13

**Found:** a USDC-style SAC transfer to a G-address with no account returns
`TrustlineMissingError = 13`, not 6 (test `send_parks_when_account_missing`).

**Impact:** the contract's `Parked(code)` can't tell "no trustline" from "account
not active" for credit assets.

**Done:** the readiness preview reads the account entry itself, and so does the
claim page, so the "Will wait: account not active" chip still appears. On
claim, `trust` on a missing account fails and the claim simulates as
`Blocked`, so no signature is ever requested for it.

## D-003 · Network is on Protocol 29

**Found:** testnet `getVersionInfo` reports protocol 29 (stellar-core 29.0.0).
The PRD targets Protocol 26 or later. `soroban-sdk 28.0.0` and
`stellar-cli 28.1.0` are the current releases and are used.

## D-004 · Claim keeps a created trustline when the retry is blocked

If `trust` succeeds but the retried transfer is still blocked (typically
error 11, an asset that needs issuer approval), the claim returns `Blocked(11)`
and the new trustline stays. That is the useful outcome: the issuer can now
approve the trustline, and the next claim succeeds. The app simulates first
and only asks for a signature when the simulation returns `Claimed`.

## D-005 · `config()` read-only function

Added `config() -> Config` so the deployment parameters (`grace_ledgers`,
`max_items`) can be read from the chain rather than only from deployment
files (PRD §11.1, §22.3).

## D-006 · Constructor rejects `max_items = 0`

New error `InvalidConfig = 7`. A zero `max_items` would deploy a contract on
which `send_many` and `claim_many` can never succeed.

## D-007 · Frontend: frontend.md overrides the PRD's visual notes

The owner asked that the frontend follow `frontend.md` without deviation. Two
PRD lines conflict with it:

- PRD §8 "every amount is in monospace with tabular figures"; frontend.md §3
  "no monospace exists, `font-mono` maps to the sans face". **Done:** amounts use
  `font-mono` (mapped to Hedvig Letters Sans) with `tabular-nums`, so figures
  still align without introducing a monospace face.
- PRD §14 "one accent colour"; frontend.md §2 "there is no brand colour; the only
  colour on the page is borrowed from the product UI". **Done:** no brand accent.
  Colour appears only inside product UI: the Delivered / Waiting / Returned
  status marks, the way Midday's product screens carry category colours.

## D-008 · `max_items` is set by the event-size cap, not CPU

**Found:** simulation accepted `send_many` with 123 payees, but on-chain
submissions failed from 44 with `resource_limit_exceeded`. Testnet caps contract
events at `tx_max_contract_events_size_bytes = 16384` (return value included),
and simulation does not enforce it. A delivered payee costs ~476 event bytes
(the SAC's own `transfer` event plus Mora's `delivered`); a parked one ~276.

**Done:** Mora's event data is now a single value or a vec instead of a map
(topics unchanged from §11.5). Measured on chain, worst case all delivered:
30 succeeds, 32 fails. Testnet deploys with `max_items = 30`. The app chunks
longer lists (P1) and never relies on simulation alone for batch size.
Scripts: `scripts/measure-max-items.mjs`, `scripts/measure-event-bytes.mjs`,
`scripts/submit-send-many.mjs`.

## D-009 · `grace_ledgers = 120960`

Equal to testnet's `min_persistent_ttl` (7 days at the probed 5.0 s close
time). A parcel stays restorable-free for a week after its return date.
