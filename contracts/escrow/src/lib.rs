#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, String, Symbol, Val,
};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    IsInitialized,
    Tenant,
    Landlord,
    Arbitrator,
    Token,
    Amount,
    IsFunded,
    Status, // 0 = Created, 1 = Active, 2 = Disputed, 3 = Released
    DisputeReason,
    Proposal(Address),
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    pub fn initialize(
        env: Env,
        tenant: Address,
        landlord: Address,
        arbitrator: Address,
        token: Address,
        amount: i128,
    ) {
        if env.storage().persistent().has(&DataKey::IsInitialized) {
            panic!("Already initialized");
        }

        if amount <= 0 {
            panic!("Amount must be positive");
        }

        env.storage().persistent().set(&DataKey::IsInitialized, &true);
        env.storage().persistent().set(&DataKey::Tenant, &tenant);
        env.storage().persistent().set(&DataKey::Landlord, &landlord);
        env.storage().persistent().set(&DataKey::Arbitrator, &arbitrator);
        env.storage().persistent().set(&DataKey::Token, &token);
        env.storage().persistent().set(&DataKey::Amount, &amount);
        env.storage().persistent().set(&DataKey::IsFunded, &false);
        env.storage().persistent().set(&DataKey::Status, &0u32); // Created
    }

    pub fn fund(env: Env) {
        let tenant: Address = env.storage().persistent().get(&DataKey::Tenant).unwrap();
        tenant.require_auth();

        let is_funded: bool = env.storage().persistent().get(&DataKey::IsFunded).unwrap_or(false);
        if is_funded {
            panic!("Escrow is already funded");
        }

        let token: Address = env.storage().persistent().get(&DataKey::Token).unwrap();
        let amount: i128 = env.storage().persistent().get(&DataKey::Amount).unwrap();

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&tenant, &env.current_contract_address(), &amount);

        env.storage().persistent().set(&DataKey::IsFunded, &true);
        env.storage().persistent().set(&DataKey::Status, &1u32); // Active

        // Emit funded event
        env.events().publish(
            (symbol_short!("funded"), tenant),
            amount,
        );
    }

    pub fn propose_release(env: Env, caller: Address, tenant_amount: i128, landlord_amount: i128) {
        caller.require_auth();

        let tenant: Address = env.storage().persistent().get(&DataKey::Tenant).unwrap();
        let landlord: Address = env.storage().persistent().get(&DataKey::Landlord).unwrap();

        if caller != tenant && caller != landlord {
            panic!("Caller must be tenant or landlord");
        }

        let is_funded: bool = env.storage().persistent().get(&DataKey::IsFunded).unwrap_or(false);
        if !is_funded {
            panic!("Escrow is not funded yet");
        }

        let status: u32 = env.storage().persistent().get(&DataKey::Status).unwrap();
        if status == 3 {
            panic!("Escrow already released");
        }

        let amount: i128 = env.storage().persistent().get(&DataKey::Amount).unwrap();
        if tenant_amount < 0 || landlord_amount < 0 {
            panic!("Amounts must be non-negative");
        }
        if tenant_amount + landlord_amount != amount {
            panic!("Release split sum must equal total escrow amount");
        }

        // Save proposal
        env.storage().persistent().set(&DataKey::Proposal(caller.clone()), &(tenant_amount, landlord_amount));

        // Emit proposal event
        env.events().publish(
            (symbol_short!("proposed"), caller.clone()),
            (tenant_amount, landlord_amount),
        );

        // Check if other party has proposed and splits match
        let other_party = if caller == tenant { landlord.clone() } else { tenant.clone() };
        let other_proposal: Option<(i128, i128)> = env.storage().persistent().get(&DataKey::Proposal(other_party));
        if let Some((other_tenant_amount, other_landlord_amount)) = other_proposal {
            if other_tenant_amount == tenant_amount && other_landlord_amount == landlord_amount {
                // Execute release!
                let token: Address = env.storage().persistent().get(&DataKey::Token).unwrap();
                let token_client = token::Client::new(&env, &token);

                if tenant_amount > 0 {
                    token_client.transfer(&env.current_contract_address(), &tenant, &tenant_amount);
                }
                if landlord_amount > 0 {
                    token_client.transfer(&env.current_contract_address(), &landlord, &landlord_amount);
                }

                env.storage().persistent().set(&DataKey::Status, &3u32); // Released

                env.events().publish(
                    (symbol_short!("released"), symbol_short!("mutual")),
                    (tenant_amount, landlord_amount),
                );
            }
        }
    }

    pub fn dispute(env: Env, caller: Address, reason: String) {
        caller.require_auth();

        let tenant: Address = env.storage().persistent().get(&DataKey::Tenant).unwrap();
        let landlord: Address = env.storage().persistent().get(&DataKey::Landlord).unwrap();

        if caller != tenant && caller != landlord {
            panic!("Caller must be tenant or landlord");
        }

        let is_funded: bool = env.storage().persistent().get(&DataKey::IsFunded).unwrap_or(false);
        if !is_funded {
            panic!("Escrow is not funded yet");
        }

        let status: u32 = env.storage().persistent().get(&DataKey::Status).unwrap();
        if status != 1 {
            panic!("Escrow can only be disputed when active");
        }

        env.storage().persistent().set(&DataKey::Status, &2u32); // Disputed
        env.storage().persistent().set(&DataKey::DisputeReason, &reason);

        env.events().publish(
            (symbol_short!("disputed"), caller),
            reason,
        );
    }

    pub fn resolve_dispute(env: Env, tenant_amount: i128, landlord_amount: i128) {
        let arbitrator: Address = env.storage().persistent().get(&DataKey::Arbitrator).unwrap();
        arbitrator.require_auth();

        let status: u32 = env.storage().persistent().get(&DataKey::Status).unwrap();
        if status != 2 {
            panic!("Escrow is not in disputed state");
        }

        let amount: i128 = env.storage().persistent().get(&DataKey::Amount).unwrap();
        if tenant_amount < 0 || landlord_amount < 0 {
            panic!("Amounts must be non-negative");
        }
        if tenant_amount + landlord_amount != amount {
            panic!("Release split sum must equal total escrow amount");
        }

        let token: Address = env.storage().persistent().get(&DataKey::Token).unwrap();
        let tenant: Address = env.storage().persistent().get(&DataKey::Tenant).unwrap();
        let landlord: Address = env.storage().persistent().get(&DataKey::Landlord).unwrap();

        let token_client = token::Client::new(&env, &token);

        if tenant_amount > 0 {
            token_client.transfer(&env.current_contract_address(), &tenant, &tenant_amount);
        }
        if landlord_amount > 0 {
            token_client.transfer(&env.current_contract_address(), &landlord, &landlord_amount);
        }

        env.storage().persistent().set(&DataKey::Status, &3u32); // Released

        env.events().publish(
            (symbol_short!("released"), symbol_short!("dispute")),
            (tenant_amount, landlord_amount),
        );
    }

    // Getters
    pub fn get_tenant(env: Env) -> Address {
        env.storage().persistent().get(&DataKey::Tenant).unwrap()
    }

    pub fn get_landlord(env: Env) -> Address {
        env.storage().persistent().get(&DataKey::Landlord).unwrap()
    }

    pub fn get_arbitrator(env: Env) -> Address {
        env.storage().persistent().get(&DataKey::Arbitrator).unwrap()
    }

    pub fn get_token(env: Env) -> Address {
        env.storage().persistent().get(&DataKey::Token).unwrap()
    }

    pub fn get_amount(env: Env) -> i128 {
        env.storage().persistent().get(&DataKey::Amount).unwrap()
    }

    pub fn is_funded(env: Env) -> bool {
        env.storage().persistent().get(&DataKey::IsFunded).unwrap_or(false)
    }

    pub fn get_status(env: Env) -> u32 {
        env.storage().persistent().get(&DataKey::Status).unwrap_or(0)
    }

    pub fn get_dispute_reason(env: Env) -> String {
        env.storage().persistent().get(&DataKey::DisputeReason).expect("No dispute reason stored")
    }

    pub fn get_proposal(env: Env, party: Address) -> Option<(i128, i128)> {
        env.storage().persistent().get(&DataKey::Proposal(party))
    }
}

mod test;
