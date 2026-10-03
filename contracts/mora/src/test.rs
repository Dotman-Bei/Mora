//! Tests for every row of PRD §11.2 and every guarantee in §11.6, plus the
//! attacks listed in §19 M1 (early return, double claim, wrong claimer).
//!
//! Recipients are real classic accounts (G-addresses) written straight into
//! the test ledger, so the SAC returns the same error codes it does on chain.
#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    contract, contractimpl,
    events::Event as _,
    testutils::{
        storage::Persistent as _, Address as _, Events as _, Ledger as _, MockAuth, MockAuthInvoke,
    },
    token::{StellarAssetClient, TokenClient},
    vec,
    xdr::{
        self, AccountEntry, AccountEntryExt, AccountId, AlphaNum4, Asset, ContractExecutable,
        ContractIdPreimage, CreateContractArgs, HostFunction, LedgerEntry, LedgerEntryData,
        LedgerEntryExt, LedgerKey, LedgerKeyAccount, LedgerKeyTrustLine, PublicKey, ScAddress,
        SequenceNumber, Thresholds, TrustLineAsset, TrustLineEntry, TrustLineEntryExt, Uint256,
    },
    Address, Env, IntoVal, TryFromVal,
};
use std::rc::Rc;

const BASE_RESERVE: u32 = 5_000_000; // 0.5 XLM in stroops
const START: u32 = 1_000;
const MAX_TTL: u32 = 3_110_400;
const GRACE: u32 = 17_280;
const MAX_ITEMS: u32 = 10;
const XLM: i128 = 10_000_000;

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

struct T {
    env: Env,
    mora: Address,
    client: MoraClient<'static>,
    sac: Address,
    asset: Asset,
    sender: Address,
    next_key: core::cell::Cell<u8>,
}

impl T {
    fn new() -> Self {
        let env = Env::default();
        env.ledger().with_mut(|li| {
            li.sequence_number = START;
            li.base_reserve = BASE_RESERVE;
            li.max_entry_ttl = MAX_TTL;
            li.min_persistent_entry_ttl = 4_096;
            li.min_temp_entry_ttl = 16;
        });
        env.mock_all_auths();

        let mora = env.register(Mora, (GRACE, MAX_ITEMS));
        let client = MoraClient::new(&env, &mora);

        let admin = Address::generate(&env);
        let sac_c = env.register_stellar_asset_contract_v2(admin);
        let sac = sac_c.address();
        let asset = sac_c.asset();

        // A contract-address sender: holds SAC balances without a trustline.
        let sender = Address::generate(&env);
        StellarAssetClient::new(&env, &sac).mint(&sender, &(1_000 * XLM));

        T {
            env,
            mora,
            client,
            sac,
            asset,
            sender,
            next_key: core::cell::Cell::new(1),
        }
    }

    fn token(&self) -> TokenClient<'_> {
        TokenClient::new(&self.env, &self.sac)
    }

    fn deadline(&self) -> u32 {
        self.env.ledger().sequence() + 100
    }

    fn account_id(&self) -> AccountId {
        let n = self.next_key.get();
        self.next_key.set(n + 1);
        let mut k = [0u8; 32];
        k[0] = 0xA0;
        k[31] = n;
        AccountId(PublicKey::PublicKeyTypeEd25519(Uint256(k)))
    }

    fn addr(&self, id: &AccountId) -> Address {
        Address::try_from_val(&self.env, &ScAddress::Account(id.clone())).unwrap()
    }

    /// A classic account that exists, with `xlm` stroops and `subentries`.
    fn account(&self, xlm: i64) -> (AccountId, Address) {
        let id = self.account_id();
        let key = Rc::new(LedgerKey::Account(LedgerKeyAccount {
            account_id: id.clone(),
        }));
        let entry = Rc::new(LedgerEntry {
            last_modified_ledger_seq: 0,
            data: LedgerEntryData::Account(AccountEntry {
                account_id: id.clone(),
                balance: xlm,
                seq_num: SequenceNumber(0),
                num_sub_entries: 0,
                inflation_dest: None,
                flags: 0,
                home_domain: Default::default(),
                thresholds: Thresholds([1, 0, 0, 0]),
                signers: Default::default(),
                ext: AccountEntryExt::V0,
            }),
            ext: LedgerEntryExt::V0,
        });
        self.env
            .host()
            .add_ledger_entry(&key, &entry, None)
            .unwrap();
        let a = self.addr(&id);
        (id, a)
    }

    /// An account that does not exist on the ledger.
    fn missing_account(&self) -> Address {
        let id = self.account_id();
        self.addr(&id)
    }

    fn tl_asset(&self) -> TrustLineAsset {
        match &self.asset {
            Asset::CreditAlphanum4(a) => TrustLineAsset::CreditAlphanum4(AlphaNum4 {
                asset_code: a.asset_code.clone(),
                issuer: a.issuer.clone(),
            }),
            _ => panic!("expected alphanum4"),
        }
    }

    /// Add a trustline for the test asset. `flags`: 1 = authorized.
    fn trustline(&self, id: &AccountId, limit: i64, flags: u32) {
        let key = Rc::new(LedgerKey::Trustline(LedgerKeyTrustLine {
            account_id: id.clone(),
            asset: self.tl_asset(),
        }));
        let entry = Rc::new(LedgerEntry {
            last_modified_ledger_seq: 0,
            data: LedgerEntryData::Trustline(TrustLineEntry {
                account_id: id.clone(),
                asset: self.tl_asset(),
                balance: 0,
                limit,
                flags,
                ext: TrustLineEntryExt::V0,
            }),
            ext: LedgerEntryExt::V0,
        });
        self.env
            .host()
            .add_ledger_entry(&key, &entry, None)
            .unwrap();
    }

    /// A ready recipient: account with an authorized trustline.
    fn ready(&self) -> Address {
        let (id, a) = self.account(10 * XLM as i64);
        self.trustline(&id, i64::MAX, 1);
        a
    }

    /// Exists, plenty of XLM, no trustline.
    fn no_trustline(&self) -> (AccountId, Address) {
        self.account(10 * XLM as i64)
    }

    fn parcel_total(&self) -> i128 {
        // Solvency is checked against the parcels this test created.
        self.token().balance(&self.mora)
    }

    fn native_sac(&self) -> Address {
        let create = HostFunction::CreateContract(CreateContractArgs {
            contract_id_preimage: ContractIdPreimage::Asset(Asset::Native),
            executable: ContractExecutable::StellarAsset,
        });
        let v = self.env.host().invoke_function(create).unwrap();
        Address::try_from_val(&self.env, &v).unwrap()
    }
}

// ---------------------------------------------------------------------------
// send (§11.2 row 1)
// ---------------------------------------------------------------------------

#[test]
fn send_delivers_to_ready_recipient() {
    let t = T::new();
    let to = t.ready();
    let out = t
        .client
        .send(&t.sender, &t.sac, &to, &(5 * XLM), &t.deadline());
    // Events are only kept for the last invocation, so read them first.
    let evs = t.env.events().all().filter_by_contract(&t.mora);
    assert_eq!(out, Outcome::Delivered);
    assert_eq!(t.token().balance(&to), 5 * XLM);
    assert_eq!(t.token().balance(&t.mora), 0);
    assert_eq!(t.client.parcel(&t.sender, &to, &t.sac), None);
    assert_eq!(
        evs,
        [Delivered {
            from: t.sender.clone(),
            to: to.clone(),
            token: t.sac.clone(),
            amount: 5 * XLM
        }
        .to_xdr(&t.env, &t.mora)]
    );
}

/// F1: the contract catches SAC error 13 and keeps running.
#[test]
fn send_parks_when_trustline_missing() {
    let t = T::new();
    let (_, to) = t.no_trustline();
    let rf = t.deadline();
    let out = t.client.send(&t.sender, &t.sac, &to, &(5 * XLM), &rf);
    let evs = t.env.events().all().filter_by_contract(&t.mora);
    assert_eq!(out, Outcome::Parked(TRUSTLINE_MISSING));
    assert_eq!(
        t.client.parcel(&t.sender, &to, &t.sac),
        Some(Parcel {
            amount: 5 * XLM,
            refund_after: rf
        })
    );
    assert_eq!(t.token().balance(&t.mora), 5 * XLM);
    assert_eq!(
        evs,
        [Parked {
            from: t.sender.clone(),
            to: to.clone(),
            token: t.sac.clone(),
            amount: 5 * XLM,
            reason: TRUSTLINE_MISSING,
            refund_after: rf,
            parcel_total: 5 * XLM,
        }
        .to_xdr(&t.env, &t.mora)]
    );
}

#[test]
fn send_parks_when_account_missing() {
    let t = T::new();
    let to = t.missing_account();
    let out = t.client.send(&t.sender, &t.sac, &to, &XLM, &t.deadline());
    match out {
        // The SAC reports a missing account as a missing trustline for credit
        // assets (DECISIONS.md D-002).
        Outcome::Parked(code) => assert_eq!(code, TRUSTLINE_MISSING),
        o => panic!("unexpected {:?}", o),
    }
    assert_eq!(t.token().balance(&t.mora), XLM);
}

#[test]
fn send_parks_when_not_authorized_by_issuer() {
    let t = T::new();
    let (id, to) = t.no_trustline();
    t.trustline(&id, i64::MAX, 0); // exists, not authorized
    let out = t.client.send(&t.sender, &t.sac, &to, &XLM, &t.deadline());
    assert_eq!(out, Outcome::Parked(BALANCE_DEAUTHORIZED));
}

#[test]
fn send_parks_when_trustline_limit_too_low() {
    let t = T::new();
    let (id, to) = t.no_trustline();
    t.trustline(&id, XLM as i64, 1); // limit 1 unit
    let out = t
        .client
        .send(&t.sender, &t.sac, &to, &(2 * XLM), &t.deadline());
    assert_eq!(out, Outcome::Parked(BALANCE_ERROR));
}

#[test]
fn second_send_adds_to_parcel_and_keeps_later_deadline() {
    let t = T::new();
    let (_, to) = t.no_trustline();
    let late = t.env.ledger().sequence() + 500;
    let early = t.env.ledger().sequence() + 100;
    t.client.send(&t.sender, &t.sac, &to, &XLM, &late);
    t.client.send(&t.sender, &t.sac, &to, &(2 * XLM), &early);
    assert_eq!(
        t.client.parcel(&t.sender, &to, &t.sac),
        Some(Parcel {
            amount: 3 * XLM,
            refund_after: late
        })
    );
    assert_eq!(t.token().balance(&t.mora), 3 * XLM);
}

#[test]
fn parcel_lives_until_return_ledger_plus_grace() {
    let t = T::new();
    let (_, to) = t.no_trustline();
    let rf = t.deadline();
    t.client.send(&t.sender, &t.sac, &to, &XLM, &rf);
    let ttl = t.env.as_contract(&t.mora, || {
        t.env.storage().persistent().get_ttl(&DataKey::Parcel(
            t.sender.clone(),
            to.clone(),
            t.sac.clone(),
        ))
    });
    assert_eq!(t.env.ledger().sequence() + ttl, rf + GRACE);
}

#[test]
fn send_rejects_bad_amounts_and_deadlines() {
    let t = T::new();
    let to = t.ready();
    let now = t.env.ledger().sequence();
    assert_eq!(
        t.client.try_send(&t.sender, &t.sac, &to, &0, &t.deadline()),
        Err(Ok(Error::InvalidAmount.into()))
    );
    assert_eq!(
        t.client
            .try_send(&t.sender, &t.sac, &to, &-1, &t.deadline()),
        Err(Ok(Error::InvalidAmount.into()))
    );
    assert_eq!(
        t.client.try_send(&t.sender, &t.sac, &to, &XLM, &now),
        Err(Ok(Error::DeadlineInPast.into()))
    );
    assert_eq!(
        t.client
            .try_send(&t.sender, &t.sac, &to, &XLM, &(now + MAX_TTL)),
        Err(Ok(Error::DeadlineBeyondMaxTtl.into()))
    );
    // Exactly at the network limit is fine; one ledger past it is not.
    let max = t.env.as_contract(&t.mora, || t.env.storage().max_ttl());
    let ok = now + max - GRACE;
    assert_eq!(
        t.client.try_send(&t.sender, &t.sac, &to, &XLM, &(ok + 1)),
        Err(Ok(Error::DeadlineBeyondMaxTtl.into()))
    );
    assert_eq!(
        t.client.send(&t.sender, &t.sac, &to, &XLM, &ok),
        Outcome::Delivered
    );
}

#[test]
fn send_aborts_when_sender_cannot_pay() {
    let t = T::new();
    let to = t.ready();
    let res = t
        .client
        .try_send(&t.sender, &t.sac, &to, &(10_000 * XLM), &t.deadline());
    assert!(res.is_err());
    assert_eq!(t.token().balance(&to), 0);
    assert_eq!(t.token().balance(&t.mora), 0);
}

#[test]
fn send_requires_sender_auth() {
    let t = T::new();
    let to = t.ready();
    let attacker = Address::generate(&t.env);
    t.env.set_auths(&[]);
    t.env.mock_auths(&[MockAuth {
        address: &attacker,
        invoke: &MockAuthInvoke {
            contract: &t.mora,
            fn_name: "send",
            args: (&t.sender, &t.sac, &to, XLM, t.deadline()).into_val(&t.env),
            sub_invokes: &[],
        },
    }]);
    let res = t
        .client
        .try_send(&t.sender, &t.sac, &to, &XLM, &t.deadline());
    assert!(res.is_err());
    assert_eq!(t.token().balance(&to), 0);
}

// ---------------------------------------------------------------------------
// send_many (§11.2 row 2) and isolation (§11.6)
// ---------------------------------------------------------------------------

#[test]
fn send_many_isolates_each_payee() {
    let t = T::new();
    let a = t.ready();
    let (_, b) = t.no_trustline();
    let c = t.ready();
    let d = t.missing_account();
    let e = t.ready();
    let payees = vec![
        &t.env,
        Payee {
            to: a.clone(),
            amount: 50 * XLM,
        },
        Payee {
            to: b.clone(),
            amount: 50 * XLM,
        },
        Payee {
            to: c.clone(),
            amount: 50 * XLM,
        },
        Payee {
            to: d.clone(),
            amount: 50 * XLM,
        },
        Payee {
            to: e.clone(),
            amount: 50 * XLM,
        },
    ];
    let before = t.token().balance(&t.sender);
    let out = t
        .client
        .send_many(&t.sender, &t.sac, &payees, &t.deadline());
    assert_eq!(out.get(0).unwrap(), Outcome::Delivered);
    assert_eq!(out.get(1).unwrap(), Outcome::Parked(TRUSTLINE_MISSING));
    assert_eq!(out.get(2).unwrap(), Outcome::Delivered);
    assert!(matches!(out.get(3).unwrap(), Outcome::Parked(_)));
    assert_eq!(out.get(4).unwrap(), Outcome::Delivered);
    for r in [&a, &c, &e] {
        assert_eq!(t.token().balance(r), 50 * XLM);
    }
    assert_eq!(before - t.token().balance(&t.sender), 250 * XLM);
    assert_eq!(t.token().balance(&t.mora), 100 * XLM);
}

#[test]
fn send_many_enforces_max_items() {
    let t = T::new();
    let mut payees = Vec::new(&t.env);
    for _ in 0..=MAX_ITEMS {
        payees.push_back(Payee {
            to: t.ready(),
            amount: XLM,
        });
    }
    assert_eq!(
        t.client
            .try_send_many(&t.sender, &t.sac, &payees, &t.deadline()),
        Err(Ok(Error::TooManyItems.into()))
    );
    assert_eq!(
        t.client
            .try_send_many(&t.sender, &t.sac, &Vec::new(&t.env), &t.deadline()),
        Err(Ok(Error::TooManyItems.into()))
    );
}

#[test]
fn send_many_rejects_any_bad_amount() {
    let t = T::new();
    let payees = vec![
        &t.env,
        Payee {
            to: t.ready(),
            amount: XLM,
        },
        Payee {
            to: t.ready(),
            amount: 0,
        },
    ];
    assert_eq!(
        t.client
            .try_send_many(&t.sender, &t.sac, &payees, &t.deadline()),
        Err(Ok(Error::InvalidAmount.into()))
    );
}

#[test]
fn send_many_rejects_overflowing_total() {
    let t = T::new();
    let payees = vec![
        &t.env,
        Payee {
            to: t.ready(),
            amount: i128::MAX,
        },
        Payee {
            to: t.ready(),
            amount: 1,
        },
    ];
    assert_eq!(
        t.client
            .try_send_many(&t.sender, &t.sac, &payees, &t.deadline()),
        Err(Ok(Error::InvalidAmount.into()))
    );
}

// ---------------------------------------------------------------------------
// claim (§11.2 row 3)
// ---------------------------------------------------------------------------

/// F2: `trust` inside `claim` creates the trustline and the transfer lands in
/// one call.
#[test]
fn claim_adds_trustline_and_pays() {
    let t = T::new();
    let (_, to) = t.no_trustline();
    t.client
        .send(&t.sender, &t.sac, &to, &(5 * XLM), &t.deadline());
    let res = t.client.claim(&t.sender, &to, &t.sac);
    let evs = t.env.events().all().filter_by_contract(&t.mora);
    assert_eq!(res, ClaimResult::Claimed(5 * XLM, true));
    assert_eq!(t.token().balance(&to), 5 * XLM);
    assert_eq!(t.token().balance(&t.mora), 0);
    assert_eq!(t.client.parcel(&t.sender, &to, &t.sac), None);
    assert_eq!(
        evs,
        [Claimed {
            from: t.sender.clone(),
            to: to.clone(),
            token: t.sac.clone(),
            amount: 5 * XLM,
            trustline_created: true
        }
        .to_xdr(&t.env, &t.mora)]
    );
}

#[test]
fn claim_without_trustline_needed() {
    let t = T::new();
    let (id, to) = t.no_trustline();
    t.client.send(&t.sender, &t.sac, &to, &XLM, &t.deadline());
    t.trustline(&id, i64::MAX, 1); // recipient added the asset themselves
    assert_eq!(
        t.client.claim(&t.sender, &to, &t.sac),
        ClaimResult::Claimed(XLM, false)
    );
    assert_eq!(t.token().balance(&to), XLM);
}

#[test]
fn claim_twice_pays_once() {
    let t = T::new();
    let (_, to) = t.no_trustline();
    t.client.send(&t.sender, &t.sac, &to, &XLM, &t.deadline());
    assert!(matches!(
        t.client.claim(&t.sender, &to, &t.sac),
        ClaimResult::Claimed(..)
    ));
    assert_eq!(t.client.claim(&t.sender, &to, &t.sac), ClaimResult::Empty);
    assert_eq!(t.token().balance(&to), XLM);
}

#[test]
fn claim_with_nothing_waiting_is_empty() {
    let t = T::new();
    let to = t.ready();
    assert_eq!(t.client.claim(&t.sender, &to, &t.sac), ClaimResult::Empty);
}

#[test]
fn claim_blocked_when_issuer_has_not_authorized() {
    let t = T::new();
    let (id, to) = t.no_trustline();
    t.trustline(&id, i64::MAX, 0);
    t.client.send(&t.sender, &t.sac, &to, &XLM, &t.deadline());
    assert_eq!(
        t.client.claim(&t.sender, &to, &t.sac),
        ClaimResult::Blocked(BALANCE_DEAUTHORIZED)
    );
    // Still waiting, money still held.
    assert!(t.client.parcel(&t.sender, &to, &t.sac).is_some());
    assert_eq!(t.token().balance(&t.mora), XLM);
}

#[test]
fn claim_blocked_when_recipient_cannot_afford_trustline_reserve() {
    let t = T::new();
    // Exactly the 2-reserve minimum: no room for a trustline's extra reserve.
    let (_, to) = t.account(2 * BASE_RESERVE as i64);
    t.client.send(&t.sender, &t.sac, &to, &XLM, &t.deadline());
    match t.client.claim(&t.sender, &to, &t.sac) {
        ClaimResult::Blocked(code) => assert_ne!(code, 0),
        r => panic!("unexpected {:?}", r),
    }
    assert!(t.client.parcel(&t.sender, &to, &t.sac).is_some());
    assert_eq!(t.token().balance(&t.mora), XLM);
}

#[test]
fn claim_blocked_when_account_missing() {
    let t = T::new();
    let to = t.missing_account();
    t.client.send(&t.sender, &t.sac, &to, &XLM, &t.deadline());
    assert!(matches!(
        t.client.claim(&t.sender, &to, &t.sac),
        ClaimResult::Blocked(_)
    ));
    assert_eq!(t.token().balance(&t.mora), XLM);
}

/// Wrong claimer: only `to` can claim, and `to` comes from the call, so an
/// attacker naming themselves finds nothing.
#[test]
fn wrong_claimer_cannot_take_payment() {
    let t = T::new();
    let (_, to) = t.no_trustline();
    t.client.send(&t.sender, &t.sac, &to, &XLM, &t.deadline());
    let attacker = t.ready();

    // Attacker claims as themselves: different key, nothing there.
    assert_eq!(
        t.client.claim(&t.sender, &attacker, &t.sac),
        ClaimResult::Empty
    );

    // Another attacker signs a claim naming the real recipient: auth fails.
    // (mock_auths needs a contract-address signer.)
    let signer = Address::generate(&t.env);
    t.env.set_auths(&[]);
    t.env.mock_auths(&[MockAuth {
        address: &signer,
        invoke: &MockAuthInvoke {
            contract: &t.mora,
            fn_name: "claim",
            args: (&t.sender, &to, &t.sac).into_val(&t.env),
            sub_invokes: &[],
        },
    }]);
    assert!(t.client.try_claim(&t.sender, &to, &t.sac).is_err());
    assert_eq!(t.token().balance(&attacker), 0);
    assert_eq!(t.token().balance(&t.mora), XLM);
}

#[test]
fn claim_many_takes_everything_claimable() {
    let t = T::new();
    let (_, to) = t.no_trustline();
    let sender2 = Address::generate(&t.env);
    StellarAssetClient::new(&t.env, &t.sac).mint(&sender2, &(10 * XLM));
    t.client.send(&t.sender, &t.sac, &to, &XLM, &t.deadline());
    t.client
        .send(&sender2, &t.sac, &to, &(2 * XLM), &t.deadline());
    let stranger = Address::generate(&t.env);
    let items = vec![
        &t.env,
        ParcelRef {
            from: t.sender.clone(),
            token: t.sac.clone(),
        },
        ParcelRef {
            from: sender2.clone(),
            token: t.sac.clone(),
        },
        ParcelRef {
            from: stranger,
            token: t.sac.clone(),
        },
    ];
    let res = t.client.claim_many(&to, &items);
    assert_eq!(res.get(0).unwrap(), ClaimResult::Claimed(XLM, true));
    assert_eq!(res.get(1).unwrap(), ClaimResult::Claimed(2 * XLM, false));
    assert_eq!(res.get(2).unwrap(), ClaimResult::Empty);
    assert_eq!(t.token().balance(&to), 3 * XLM);
    assert_eq!(t.token().balance(&t.mora), 0);
}

#[test]
fn claim_many_enforces_max_items() {
    let t = T::new();
    let to = t.ready();
    let mut items = Vec::new(&t.env);
    for _ in 0..=MAX_ITEMS {
        items.push_back(ParcelRef {
            from: t.sender.clone(),
            token: t.sac.clone(),
        });
    }
    assert_eq!(
        t.client.try_claim_many(&to, &items),
        Err(Ok(Error::TooManyItems.into()))
    );
}

// ---------------------------------------------------------------------------
// deliver (§11.2 row 5)
// ---------------------------------------------------------------------------

#[test]
fn deliver_still_blocked_then_moves_once_ready() {
    let t = T::new();
    let (id, to) = t.no_trustline();
    t.client.send(&t.sender, &t.sac, &to, &XLM, &t.deadline());
    assert_eq!(
        t.client.deliver(&t.sender, &to, &t.sac),
        DoorResult::StillBlocked(TRUSTLINE_MISSING)
    );
    assert!(t.client.parcel(&t.sender, &to, &t.sac).is_some());

    t.trustline(&id, i64::MAX, 1);
    assert_eq!(
        t.client.deliver(&t.sender, &to, &t.sac),
        DoorResult::Moved(XLM)
    );
    assert_eq!(t.token().balance(&to), XLM);
    assert_eq!(t.client.deliver(&t.sender, &to, &t.sac), DoorResult::Empty);
}

#[test]
fn deliver_needs_no_auth() {
    let t = T::new();
    let (id, to) = t.no_trustline();
    t.client.send(&t.sender, &t.sac, &to, &XLM, &t.deadline());
    t.trustline(&id, i64::MAX, 1);
    t.env.set_auths(&[]);
    assert_eq!(
        t.client.deliver(&t.sender, &to, &t.sac),
        DoorResult::Moved(XLM)
    );
}

// ---------------------------------------------------------------------------
// refund (§11.2 row 6), no early return (§11.6)
// ---------------------------------------------------------------------------

#[test]
fn refund_blocked_until_after_return_ledger() {
    let t = T::new();
    let (_, to) = t.no_trustline();
    let rf = t.deadline();
    t.client.send(&t.sender, &t.sac, &to, &XLM, &rf);
    let before = t.token().balance(&t.sender);

    assert_eq!(
        t.client.try_refund(&t.sender, &to, &t.sac),
        Err(Ok(Error::RefundNotYetAllowed.into()))
    );
    t.env.ledger().set_sequence_number(rf);
    assert_eq!(
        t.client.try_refund(&t.sender, &to, &t.sac),
        Err(Ok(Error::RefundNotYetAllowed.into()))
    );
    t.env.ledger().set_sequence_number(rf + 1);
    t.env.set_auths(&[]); // anyone may return it
    assert_eq!(
        t.client.refund(&t.sender, &to, &t.sac),
        DoorResult::Moved(XLM)
    );
    let evs = t.env.events().all().filter_by_contract(&t.mora);
    assert_eq!(t.token().balance(&t.sender), before + XLM);
    assert_eq!(t.token().balance(&t.mora), 0);
    assert_eq!(t.client.parcel(&t.sender, &to, &t.sac), None);
    assert_eq!(
        evs,
        [Returned {
            from: t.sender.clone(),
            to: to.clone(),
            token: t.sac.clone(),
            amount: XLM
        }
        .to_xdr(&t.env, &t.mora)]
    );
}

#[test]
fn refund_with_nothing_waiting_is_empty() {
    let t = T::new();
    let to = t.ready();
    assert_eq!(t.client.refund(&t.sender, &to, &t.sac), DoorResult::Empty);
}

#[test]
fn claim_after_return_date_still_works_until_returned() {
    let t = T::new();
    let (_, to) = t.no_trustline();
    let rf = t.deadline();
    t.client.send(&t.sender, &t.sac, &to, &XLM, &rf);
    t.env.ledger().set_sequence_number(rf + 10);
    assert_eq!(
        t.client.claim(&t.sender, &to, &t.sac),
        ClaimResult::Claimed(XLM, true)
    );
    assert_eq!(t.client.refund(&t.sender, &to, &t.sac), DoorResult::Empty);
}

/// Three exits: money goes only to `to` or `from`, which come from the key.
#[test]
fn refund_pays_only_original_sender() {
    let t = T::new();
    let (_, to) = t.no_trustline();
    let rf = t.deadline();
    t.client.send(&t.sender, &t.sac, &to, &XLM, &rf);
    t.env.ledger().set_sequence_number(rf + 1);
    let attacker = Address::generate(&t.env);
    // Naming someone else as `from` reads a different (empty) key.
    assert_eq!(t.client.refund(&attacker, &to, &t.sac), DoorResult::Empty);
    assert_eq!(t.token().balance(&attacker), 0);
    assert_eq!(t.token().balance(&t.mora), XLM);
}

// ---------------------------------------------------------------------------
// Solvency (§11.6)
// ---------------------------------------------------------------------------

#[test]
fn balance_always_covers_parcels() {
    let t = T::new();
    let mut waiting: std::vec::Vec<(Address, AccountId)> = std::vec::Vec::new();
    let mut expected: i128 = 0;
    for i in 0..6 {
        let (id, to) = t.no_trustline();
        let amt = (i + 1) as i128 * XLM;
        t.client.send(&t.sender, &t.sac, &to, &amt, &t.deadline());
        expected += amt;
        waiting.push((to, id));
        assert_eq!(t.parcel_total(), expected);
    }
    // Claim one, deliver one, return one.
    let (c, _) = &waiting[0];
    if let ClaimResult::Claimed(a, _) = t.client.claim(&t.sender, c, &t.sac) {
        expected -= a;
    }
    assert_eq!(t.parcel_total(), expected);
    let (d, did) = &waiting[1];
    t.trustline(did, i64::MAX, 1);
    if let DoorResult::Moved(a) = t.client.deliver(&t.sender, d, &t.sac) {
        expected -= a;
    }
    assert_eq!(t.parcel_total(), expected);
    t.env.ledger().set_sequence_number(t.deadline() + 1);
    let (r, _) = &waiting[2];
    if let DoorResult::Moved(a) = t.client.refund(&t.sender, r, &t.sac) {
        expected -= a;
    }
    assert_eq!(t.parcel_total(), expected);
    let sum: i128 = waiting
        .iter()
        .filter_map(|(to, _)| t.client.parcel(&t.sender, to, &t.sac))
        .map(|p| p.amount)
        .sum();
    assert_eq!(sum, expected);
}

// ---------------------------------------------------------------------------
// XLM (F3)
// ---------------------------------------------------------------------------

/// F3: XLM through the SAC from a contract activates a new account when the
/// amount covers the minimum balance; smaller amounts wait.
#[test]
fn xlm_activates_new_account_when_large_enough() {
    let t = T::new();
    let xlm = t.native_sac();
    let (_, sender) = t.account(1_000 * XLM as i64);
    let big = t.missing_account();
    let small = t.missing_account();
    let payees = vec![
        &t.env,
        Payee {
            to: big.clone(),
            amount: 2 * BASE_RESERVE as i128,
        },
        Payee {
            to: small.clone(),
            amount: BASE_RESERVE as i128,
        },
    ];
    let out = t.client.send_many(&sender, &xlm, &payees, &t.deadline());
    assert_eq!(out.get(0).unwrap(), Outcome::Delivered);
    assert_eq!(
        out.get(1).unwrap(),
        Outcome::Parked(INSUFFICIENT_ACCOUNT_RESERVE)
    );
    let x = TokenClient::new(&t.env, &xlm);
    assert_eq!(x.balance(&big), 2 * BASE_RESERVE as i128);
    assert_eq!(x.balance(&t.mora), BASE_RESERVE as i128);
}

// ---------------------------------------------------------------------------
// Unknown errors abort (§11.7)
// ---------------------------------------------------------------------------

/// A token that accepts deposits into Mora but fails every other transfer
/// with a code that is not recipient-side.
#[contract]
pub struct RogueToken;

#[contractimpl]
impl RogueToken {
    pub fn transfer(e: Env, from: Address, to: Address, _amount: i128) {
        let _ = from;
        let mora: Address = e.storage().instance().get(&0u32).unwrap();
        if to != mora {
            soroban_sdk::panic_with_error!(&e, soroban_sdk::Error::from_contract_error(4));
        }
    }
    pub fn set_mora(e: Env, mora: Address) {
        e.storage().instance().set(&0u32, &mora);
    }
}

#[test]
fn unknown_transfer_error_aborts_not_parks() {
    let t = T::new();
    let rogue = t.env.register(RogueToken, ());
    RogueTokenClient::new(&t.env, &rogue).set_mora(&t.mora);
    let to = t.ready();
    assert_eq!(
        t.client
            .try_send(&t.sender, &rogue, &to, &XLM, &t.deadline()),
        Err(Ok(Error::UnexpectedTransferError.into()))
    );
}

// ---------------------------------------------------------------------------
// Instance stays reachable, config recorded
// ---------------------------------------------------------------------------

#[test]
fn config_is_recorded() {
    let t = T::new();
    assert_eq!(
        t.client.config(),
        Config {
            grace_ledgers: GRACE,
            max_items: MAX_ITEMS
        }
    );
}

#[test]
fn constructor_rejects_zero_max_items() {
    let env = Env::default();
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        env.register(Mora, (GRACE, 0u32));
    }));
    assert!(res.is_err());
}

#[allow(dead_code)]
fn _unused(_: xdr::ScVal) {}
