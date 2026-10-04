# Testnet end-to-end run (PRD §19 M2, M7)

October 3, 2026. The `/try` walkthrough driven in Chrome against a local
production build, on Stellar testnet, contract
`CAHCJV5S5LJIL53YPNS4YTO2QWK65RYJG56SMSMYIPU45RVHV4YZZ3SF`. Every step is a
real transaction.

| Time | Step | Result |
|---|---|---|
| 0 s | Create demo keys, Friendbot funds sender and two recipients | Done |
| 22 s | Faucet pays 100 TESTUSD through Mora | Waiting · no TESTUSD trustline |
| 22 s | Sender claims with one signature | Claimed, TESTUSD added in the same transaction |
| 38 s | `send_many` 10 TESTUSD to three recipients, one signature, 5-minute window | 1 delivered, 2 waiting, 0 failed |
| 49 s | Recipient without TESTUSD claims | Claimed, trustline created |
| 344 s | Return the unclaimed payment after the window | Returned to sender |

Also verified the same day:

- Claim page reads a waiting payment straight from the contract, and shows
  "Claimed by the recipient" with its transaction for a finished one, found from
  RPC events with no Mora server involved.
- A payment sent by a separate contract (`partner-example`,
  `CA6HYBTE232ZHCA5GUNHFIXXDY6SD2HP6OCOD4SNBNYPCNWP4RCH5EO3`) appears in the
  Mora inbox (M5), via RPC history while the index is not yet configured.
- Faucet API: fresh address → waiting; repeat → refused with the waiting link;
  account with trustline → delivered.

## On the public URL

Same day, the full walkthrough on **https://mora-chi.vercel.app/try**:
without Mora 0 of 3 paid; with Mora 1 delivered and 2 waiting; the recipient
without TESTUSD claimed (trustline added in the same signature); the
unclaimed payment returned after the 5-minute window (339 s). The live
faucet API also paid a fresh address through Mora (waiting).

Still open: a claim signed on a **phone** wallet (F5), which needs the
WalletConnect project ID.

## Index live (M5)

October 4, 2026: Supabase connected through the Vercel integration, migration
applied, first sync indexed 30 testnet events. Checked against the chain:
the deployer's history reads 1 claimed, 1 delivered, 4 waiting, which matches
every payment it sent; the partner contract's payment is listed in its
recipient's inbox; the M0 recipient's inbox is empty (claimed). The live
Inbox now reads from the index, and the landing page shows
"Testnet so far · 5 delivered · 16 waited · 7 claimed · 2 returned".
