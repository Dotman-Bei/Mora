# M0 feasibility (PRD §19)

Run October 3, 2026 on Stellar testnet (protocol 29), soroban-sdk 28.0.0,
stellar-cli 28.1.0. Contract `CAHCJV5S5LJIL53YPNS4YTO2QWK65RYJG56SMSMYIPU45RVHV4YZZ3SF`.

| Check | Result | Evidence |
|---|---|---|
| F1 contract catches SAC error 13 and keeps running | **Pass** | `send` to a fresh account returned `{"Parked":13}`; unit tests `send_parks_when_trustline_missing`, `send_many_isolates_each_payee` |
| F2 `trust` inside `claim`, one transaction | **Pass** | recipient's single `claim` returned `{"Claimed":["50000000",true]}`, balance 5 TESTUSD; unit test `claim_adds_trustline_and_pays` |
| F3 XLM from a contract activates a new account | **Pass** | 1 XLM to a nonexistent G-address: `"Delivered"`, Horizon shows the account with 1.0000000 XLM. 0.1 XLM: `{"Parked":14}` (D-001) |
| F4 constructor and storage-life APIs | **Pass** | `__constructor`, `storage().max_ttl()`, `persistent().extend_ttl` in soroban-sdk 28.0.0; `config()` reads back `{"grace_ledgers":120960,"max_items":30}` |
| F5 phone wallet signs a Soroban call | **Open** | needs a real device (owner) |
| F6 `max_items` and fees | **Measured** | worst case 30 per signature (D-008). Fees by simulation, all payees parked: 1 payee 0.076 XLM, 10 payees 0.235 XLM, 20 payees 0.41 XLM |

Network parameters probed, not assumed: average close 5.0 s over 200 ledgers,
base reserve 0.5 XLM, `max_entry_ttl` 3,110,400, `min_persistent_ttl` 120,960.
