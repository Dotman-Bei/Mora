//! "Without Mora". Demo only, testnet only (PRD §10.2).
//!
//! Pays a list with plain SAC transfers, the way most payout contracts do
//! today. If any recipient can't receive the asset, the whole run fails and
//! nobody is paid. It exists to show the failure Mora prevents and is not part
//! of the product.
#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, token::TokenClient, Address, Env, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Payee {
    pub to: Address,
    pub amount: i128,
}

#[contract]
pub struct BaselinePayout;

#[contractimpl]
impl BaselinePayout {
    pub fn pay_all(e: Env, from: Address, token: Address, payees: Vec<Payee>) -> u32 {
        from.require_auth();
        let t = TokenClient::new(&e, &token);
        for p in payees.iter() {
            t.transfer(&from, &p.to, &p.amount);
        }
        payees.len()
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        testutils::Address as _,
        token::{StellarAssetClient, TokenClient},
        vec,
        xdr::{AccountId, PublicKey, ScAddress, Uint256},
        TryFromVal,
    };

    #[test]
    fn one_unready_recipient_fails_the_whole_run() {
        let env = Env::default();
        env.mock_all_auths();
        let sac = env
            .register_stellar_asset_contract_v2(Address::generate(&env))
            .address();
        let from = Address::generate(&env);
        StellarAssetClient::new(&env, &sac).mint(&from, &1_000);

        let ready = Address::generate(&env); // contract address: always receives
        let unready = Address::try_from_val(
            &env,
            &ScAddress::Account(AccountId(PublicKey::PublicKeyTypeEd25519(Uint256([7; 32])))),
        )
        .unwrap();

        let id = env.register(BaselinePayout, ());
        let c = BaselinePayoutClient::new(&env, &id);
        let payees = vec![
            &env,
            Payee { to: ready.clone(), amount: 50 },
            Payee { to: unready, amount: 50 },
        ];
        assert!(c.try_pay_all(&from, &sac, &payees).is_err());
        // Nobody got paid, not even the ready recipient.
        assert_eq!(TokenClient::new(&env, &sac).balance(&ready), 0);
        assert_eq!(TokenClient::new(&env, &sac).balance(&from), 1_000);
    }
}
