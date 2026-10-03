//! A payout contract that sends through Mora: the integration shown on
//! /integrate, compiled, tested and deployed so the snippet is known to work
//! (PRD §19 M6). It is also the "separate test contract" whose payments must
//! show up in Mora's inbox (PRD §19 M5).
#![no_std]

use soroban_sdk::{contract, contractclient, contractimpl, contracttype, Address, Env};

/// Mora's `send` result: delivered now, or parked with the SAC error code.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Outcome {
    Delivered,
    Parked(u32),
}

/// The part of Mora's interface a payout contract needs.
#[contractclient(name = "MoraClient")]
pub trait MoraInterface {
    fn send(e: Env, from: Address, token: Address, to: Address, amount: i128, refund_after: u32) -> Outcome;
}

#[contracttype]
enum Key {
    Mora,
}

#[contract]
pub struct PartnerPayout;

#[contractimpl]
impl PartnerPayout {
    pub fn __constructor(e: Env, mora: Address) {
        e.storage().instance().set(&Key::Mora, &mora);
    }

    /// Pay `to` from `from`. A recipient who can't receive the asset yet no
    /// longer fails the payment: it waits in Mora until `refund_after`.
    ///
    /// `refund_after` comes from the caller. Don't derive it from
    /// `e.ledger().sequence()` here: `from` authorizes Mora's `send` with exact
    /// arguments during simulation, and the ledger moves before the
    /// transaction applies, so the signed authorization would no longer match.
    pub fn pay(e: Env, from: Address, token: Address, to: Address, amount: i128, refund_after: u32) -> Outcome {
        from.require_auth();
        let mora: Address = e.storage().instance().get(&Key::Mora).unwrap();

        // Before: token::Client::new(&e, &token).transfer(&from, &to, &amount);
        MoraClient::new(&e, &mora).send(&from, &token, &to, &amount, &refund_after)
    }
}

#[cfg(test)]
mod test {
    use super::*;

    // The exact wasm deployed on testnet, run in the Soroban VM.
    // Build it first: `stellar contract build`.
    mod mora {
        soroban_sdk::contractimport!(file = "../target/wasm32v1-none/release/mora.wasm");
    }
    use soroban_sdk::{
        testutils::{Address as _, Ledger as _},
        token::{StellarAssetClient, TokenClient},
        xdr::{AccountId, PublicKey, ScAddress, Uint256},
        TryFromVal,
    };

    #[test]
    fn partner_payment_parks_in_mora_instead_of_failing() {
        let env = Env::default();
        env.ledger().with_mut(|li| {
            li.sequence_number = 1_000;
            li.max_entry_ttl = 3_110_400;
        });
        env.mock_all_auths();

        let mora_id = env.register(mora::WASM, (17_280u32, 30u32));
        let partner = env.register(PartnerPayout, (mora_id.clone(),));
        let sac = env.register_stellar_asset_contract_v2(Address::generate(&env)).address();
        let from = Address::generate(&env);
        StellarAssetClient::new(&env, &sac).mint(&from, &1_000);

        // A G-address with no account and no trustline.
        let unready = Address::try_from_val(
            &env,
            &ScAddress::Account(AccountId(PublicKey::PublicKeyTypeEd25519(Uint256([9; 32])))),
        )
        .unwrap();
        let ready = Address::generate(&env);

        let p = PartnerPayoutClient::new(&env, &partner);
        let rf = env.ledger().sequence() + 120_960;
        assert_eq!(p.pay(&from, &sac, &ready, &100, &rf), Outcome::Delivered);
        assert_eq!(p.pay(&from, &sac, &unready, &50, &rf), Outcome::Parked(13));

        let m = mora::Client::new(&env, &mora_id);
        assert_eq!(m.parcel(&from, &unready, &sac).unwrap().amount, 50);
        assert_eq!(TokenClient::new(&env, &sac).balance(&ready), 100);
    }
}
