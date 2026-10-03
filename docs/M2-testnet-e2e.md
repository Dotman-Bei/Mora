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

Still open for M2 as written: the same run on the **public URL**, and a claim
signed on a **phone** (F5).
