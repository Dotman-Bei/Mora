//! Mora: payments that wait.
//!
//! One shared contract per network. A payment sent through Mora is either
//! delivered straight away, or (when the recipient can't receive it yet) parked
//! under `(from, to, token)` until the recipient claims it or, after the return
//! ledger, anyone returns it to the sender.
//!
//! No admin, no upgrade path, no fee (PRD §11).
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error,
    token::{StellarAssetClient, TokenClient},
    xdr::ScErrorType,
    Address, Env, InvokeError, Vec,
};

#[cfg(test)]
mod test;

// ---------------------------------------------------------------------------
// Types (PRD §11.1)
// ---------------------------------------------------------------------------

/// A waiting payment, stored under `(from, to, token)`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Parcel {
    pub amount: i128,
    /// Ledger after which anyone may return the parcel to `from`.
    pub refund_after: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Payee {
    pub to: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ParcelRef {
    pub from: Address,
    pub token: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Outcome {
    Delivered,
    /// Parked with the SAC error code that made it wait.
    Parked(u32),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ClaimResult {
    /// Amount received, and whether a trustline was created for it.
    Claimed(i128, bool),
    Blocked(u32),
    Empty,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DoorResult {
    Moved(i128),
    StillBlocked(u32),
    Empty,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub grace_ledgers: u32,
    pub max_items: u32,
}

#[contracttype]
#[derive(Clone)]
#[allow(clippy::large_enum_variant)]
enum DataKey {
    Config,
    Parcel(Address, Address, Address),
}

// ---------------------------------------------------------------------------
// Errors (PRD §11.4)
// ---------------------------------------------------------------------------

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
    DeadlineInPast = 2,
    DeadlineBeyondMaxTtl = 3,
    TooManyItems = 4,
    RefundNotYetAllowed = 5,
    UnexpectedTransferError = 6,
    InvalidConfig = 7,
}

// ---------------------------------------------------------------------------
// Recipient-side SAC errors (PRD §11.3). The only codes that make a payment
// wait. Anything else aborts, so unknown failures are never hidden.
// ---------------------------------------------------------------------------

pub const ACCOUNT_MISSING: u32 = 6;
pub const BALANCE_ERROR: u32 = 10;
pub const BALANCE_DEAUTHORIZED: u32 = 11;
pub const TRUSTLINE_MISSING: u32 = 13;
/// XLM below the new-account minimum sent to an inactive account. Not in the
/// original PRD list; see DECISIONS.md (D-001).
pub const INSUFFICIENT_ACCOUNT_RESERVE: u32 = 14;

fn is_recipient_side(code: u32) -> bool {
    matches!(
        code,
        ACCOUNT_MISSING
            | BALANCE_ERROR
            | BALANCE_DEAUTHORIZED
            | TRUSTLINE_MISSING
            | INSUFFICIENT_ACCOUNT_RESERVE
    )
}

// ---------------------------------------------------------------------------
// Events (PRD §11.5). Topics: mora, <name>, from, to, token.
// ---------------------------------------------------------------------------

#[contractevent(topics = ["mora", "delivered"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Delivered {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    #[topic]
    pub token: Address,
    pub amount: i128,
}

#[contractevent(topics = ["mora", "parked"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Parked {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    #[topic]
    pub token: Address,
    pub amount: i128,
    pub reason: u32,
    pub refund_after: u32,
    pub parcel_total: i128,
}

#[contractevent(topics = ["mora", "claimed"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claimed {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    #[topic]
    pub token: Address,
    pub amount: i128,
    pub trustline_created: bool,
}

#[contractevent(topics = ["mora", "moved"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Moved {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    #[topic]
    pub token: Address,
    pub amount: i128,
}

#[contractevent(topics = ["mora", "returned"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Returned {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    #[topic]
    pub token: Address,
    pub amount: i128,
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct Mora;

#[contractimpl]
impl Mora {
    /// Set once at deployment. There is no way to change these afterwards.
    pub fn __constructor(e: Env, grace_ledgers: u32, max_items: u32) {
        if max_items == 0 {
            panic_with_error!(&e, Error::InvalidConfig);
        }
        e.storage().instance().set(
            &DataKey::Config,
            &Config {
                grace_ledgers,
                max_items,
            },
        );
        bump_instance(&e);
    }

    /// Pay one person. Delivered if they can receive it, parked otherwise.
    pub fn send(
        e: Env,
        from: Address,
        token: Address,
        to: Address,
        amount: i128,
        refund_after: u32,
    ) -> Outcome {
        from.require_auth();
        let cfg = config(&e);
        check_amount(&e, amount);
        check_deadline(&e, &cfg, refund_after);

        pull(&e, &token, &from, amount);
        let outcome = push(&e, &cfg, &from, &token, &to, amount, refund_after);
        bump_instance(&e);
        outcome
    }

    /// Pay a list with one signature and one pull. One payee's problem never
    /// changes another payee's outcome.
    pub fn send_many(
        e: Env,
        from: Address,
        token: Address,
        payees: Vec<Payee>,
        refund_after: u32,
    ) -> Vec<Outcome> {
        from.require_auth();
        let cfg = config(&e);
        if payees.is_empty() || payees.len() > cfg.max_items {
            panic_with_error!(&e, Error::TooManyItems);
        }
        check_deadline(&e, &cfg, refund_after);

        let mut total: i128 = 0;
        for p in payees.iter() {
            check_amount(&e, p.amount);
            total = total
                .checked_add(p.amount)
                .unwrap_or_else(|| panic_with_error!(&e, Error::InvalidAmount));
        }

        pull(&e, &token, &from, total);
        let mut outcomes = Vec::new(&e);
        for p in payees.iter() {
            outcomes.push_back(push(&e, &cfg, &from, &token, &p.to, p.amount, refund_after));
        }
        bump_instance(&e);
        outcomes
    }

    /// The recipient takes a waiting payment. Adds the asset to their account
    /// first when that's what is missing, all in one transaction.
    pub fn claim(e: Env, from: Address, to: Address, token: Address) -> ClaimResult {
        to.require_auth();
        let result = claim_one(&e, &from, &to, &token);
        bump_instance(&e);
        result
    }

    /// `claim` for several parcels, one signature.
    pub fn claim_many(e: Env, to: Address, items: Vec<ParcelRef>) -> Vec<ClaimResult> {
        to.require_auth();
        let cfg = config(&e);
        if items.is_empty() || items.len() > cfg.max_items {
            panic_with_error!(&e, Error::TooManyItems);
        }
        let mut results = Vec::new(&e);
        for item in items.iter() {
            results.push_back(claim_one(&e, &item.from, &to, &item.token));
        }
        bump_instance(&e);
        results
    }

    /// Anyone can push a waiting payment to its recipient once they're ready.
    pub fn deliver(e: Env, from: Address, to: Address, token: Address) -> DoorResult {
        let key = DataKey::Parcel(from.clone(), to.clone(), token.clone());
        let Some(parcel) = read_parcel(&e, &key) else {
            return DoorResult::Empty;
        };
        let result = match try_pay(&e, &token, &to, parcel.amount) {
            Ok(()) => {
                e.storage().persistent().remove(&key);
                Moved {
                    from,
                    to,
                    token,
                    amount: parcel.amount,
                }
                .publish(&e);
                DoorResult::Moved(parcel.amount)
            }
            Err(code) => DoorResult::StillBlocked(code),
        };
        bump_instance(&e);
        result
    }

    /// After the return ledger, anyone can send a parcel back to its sender.
    pub fn refund(e: Env, from: Address, to: Address, token: Address) -> DoorResult {
        let key = DataKey::Parcel(from.clone(), to.clone(), token.clone());
        let Some(parcel) = read_parcel(&e, &key) else {
            return DoorResult::Empty;
        };
        if e.ledger().sequence() <= parcel.refund_after {
            panic_with_error!(&e, Error::RefundNotYetAllowed);
        }
        let result = match try_pay(&e, &token, &from, parcel.amount) {
            Ok(()) => {
                e.storage().persistent().remove(&key);
                Returned {
                    from,
                    to,
                    token,
                    amount: parcel.amount,
                }
                .publish(&e);
                DoorResult::Moved(parcel.amount)
            }
            Err(code) => DoorResult::StillBlocked(code),
        };
        bump_instance(&e);
        result
    }

    /// Read-only view of a waiting payment.
    pub fn parcel(e: Env, from: Address, to: Address, token: Address) -> Option<Parcel> {
        read_parcel(&e, &DataKey::Parcel(from, to, token))
    }

    /// The deployment parameters, recorded with the contract ID.
    pub fn config(e: Env) -> Config {
        config(&e)
    }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

fn config(e: &Env) -> Config {
    e.storage().instance().get(&DataKey::Config).unwrap()
}

fn read_parcel(e: &Env, key: &DataKey) -> Option<Parcel> {
    e.storage().persistent().get(key)
}

fn check_amount(e: &Env, amount: i128) {
    if amount <= 0 {
        panic_with_error!(e, Error::InvalidAmount);
    }
}

/// The return ledger must be in the future, and a parcel must be able to live
/// until it plus the grace period without exceeding the network's max TTL.
fn check_deadline(e: &Env, cfg: &Config, refund_after: u32) {
    let now = e.ledger().sequence();
    if refund_after <= now {
        panic_with_error!(e, Error::DeadlineInPast);
    }
    if parcel_extend_to(e, cfg, refund_after) > e.storage().max_ttl() {
        panic_with_error!(e, Error::DeadlineBeyondMaxTtl);
    }
}

/// Ledgers from now that a parcel must stay live for.
fn parcel_extend_to(e: &Env, cfg: &Config, refund_after: u32) -> u32 {
    let live_until = (refund_after as u64) + (cfg.grace_ledgers as u64);
    let rel = live_until.saturating_sub(e.ledger().sequence() as u64);
    u32::try_from(rel).unwrap_or(u32::MAX)
}

/// Sender to Mora. Any failure here is the sender's problem, so it aborts.
fn pull(e: &Env, token: &Address, from: &Address, amount: i128) {
    TokenClient::new(e, token).transfer(from, e.current_contract_address(), &amount);
}

/// Mora to `to`. `Err(code)` only for a recipient-side SAC error; any other
/// failure aborts the whole call.
fn try_pay(e: &Env, token: &Address, to: &Address, amount: i128) -> Result<(), u32> {
    let res = TokenClient::new(e, token).try_transfer(&e.current_contract_address(), to, &amount);
    match res {
        Ok(Ok(())) => Ok(()),
        Err(Ok(err)) if err.is_type(ScErrorType::Contract) && is_recipient_side(err.get_code()) => {
            Err(err.get_code())
        }
        Err(Err(InvokeError::Contract(code))) if is_recipient_side(code) => Err(code),
        _ => panic_with_error!(e, Error::UnexpectedTransferError),
    }
}

/// Deliver, or park under `(from, to, token)`.
fn push(
    e: &Env,
    cfg: &Config,
    from: &Address,
    token: &Address,
    to: &Address,
    amount: i128,
    refund_after: u32,
) -> Outcome {
    match try_pay(e, token, to, amount) {
        Ok(()) => {
            Delivered {
                from: from.clone(),
                to: to.clone(),
                token: token.clone(),
                amount,
            }
            .publish(e);
            Outcome::Delivered
        }
        Err(code) => {
            let key = DataKey::Parcel(from.clone(), to.clone(), token.clone());
            let parcel = match read_parcel(e, &key) {
                Some(old) => Parcel {
                    amount: old
                        .amount
                        .checked_add(amount)
                        .unwrap_or_else(|| panic_with_error!(e, Error::InvalidAmount)),
                    refund_after: old.refund_after.max(refund_after),
                },
                None => Parcel {
                    amount,
                    refund_after,
                },
            };
            let store = e.storage().persistent();
            store.set(&key, &parcel);
            let extend_to = parcel_extend_to(e, cfg, parcel.refund_after);
            store.extend_ttl(&key, extend_to, extend_to);
            Parked {
                from: from.clone(),
                to: to.clone(),
                token: token.clone(),
                amount,
                reason: code,
                refund_after: parcel.refund_after,
                parcel_total: parcel.amount,
            }
            .publish(e);
            Outcome::Parked(code)
        }
    }
}

fn claim_one(e: &Env, from: &Address, to: &Address, token: &Address) -> ClaimResult {
    let key = DataKey::Parcel(from.clone(), to.clone(), token.clone());
    let Some(parcel) = read_parcel(e, &key) else {
        return ClaimResult::Empty;
    };

    let trustline_created = match try_pay(e, token, to, parcel.amount) {
        Ok(()) => false,
        Err(TRUSTLINE_MISSING) => {
            // Add the asset to the recipient's account (SAC `trust`, CAP-73),
            // authorized by the recipient's signature on this claim.
            match StellarAssetClient::new(e, token).try_trust(to) {
                Ok(Ok(())) => {}
                Err(Ok(err)) if err.is_type(ScErrorType::Contract) => {
                    return ClaimResult::Blocked(err.get_code());
                }
                Err(Err(InvokeError::Contract(code))) => return ClaimResult::Blocked(code),
                _ => panic_with_error!(e, Error::UnexpectedTransferError),
            }
            if let Err(code) = try_pay(e, token, to, parcel.amount) {
                return ClaimResult::Blocked(code);
            }
            true
        }
        Err(code) => return ClaimResult::Blocked(code),
    };

    e.storage().persistent().remove(&key);
    Claimed {
        from: from.clone(),
        to: to.clone(),
        token: token.clone(),
        amount: parcel.amount,
        trustline_created,
    }
    .publish(e);
    ClaimResult::Claimed(parcel.amount, trustline_created)
}

/// Keep the shared deployment reachable. Extends the instance (and its code)
/// to the network max once it falls below half of it.
fn bump_instance(e: &Env) {
    let max = e.storage().max_ttl();
    e.storage().instance().extend_ttl(max / 2, max);
}
