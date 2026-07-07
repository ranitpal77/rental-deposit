#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, token, Address, Env, String, Symbol, Val,
};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Tenant(u64),
    Landlord(u64),
    Arbitrator(u64),
    Token(u64),
    Amount(u64),
    IsFunded(u64),
    Status(u64), // 0 = Created, 1 = Active, 2 = Disputed, 3 = Released
    DisputeReason(u64),
    Proposal(u64, Address),
    UnlockTime(u64),
    LockDuration(u64),
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    pub fn initialize(
        env: Env,
        lease_id: u64,
        tenant: Address,
        landlord: Address,
        arbitrator: Address,
        token: Address,
        amount: i128,
        lock_duration: u64,
    ) {
        landlord.require_auth();

        if env.storage().persistent().has(&DataKey::Tenant(lease_id)) {
            panic!("Lease ID already exists");
        }

        if amount <= 0 {
            panic!("Amount must be positive");
        }

        env.storage().persistent().set(&DataKey::Tenant(lease_id), &tenant);
        env.storage().persistent().set(&DataKey::Landlord(lease_id), &landlord);
        env.storage().persistent().set(&DataKey::Arbitrator(lease_id), &arbitrator);
        env.storage().persistent().set(&DataKey::Token(lease_id), &token);
        env.storage().persistent().set(&DataKey::Amount(lease_id), &amount);
        env.storage().persistent().set(&DataKey::IsFunded(lease_id), &false);
        env.storage().persistent().set(&DataKey::Status(lease_id), &0u32);
        env.storage().persistent().set(&DataKey::LockDuration(lease_id), &lock_duration);
        env.storage().persistent().set(&DataKey::UnlockTime(lease_id), &0u64);
    }

    pub fn fund(env: Env, lease_id: u64) {
        let tenant: Address = env.storage().persistent().get(&DataKey::Tenant(lease_id)).expect("Lease not initialized");
        tenant.require_auth();

        let is_funded: bool = env.storage().persistent().get(&DataKey::IsFunded(lease_id)).unwrap_or(false);
        if is_funded {
            panic!("Escrow is already funded");
        }

        let token: Address = env.storage().persistent().get(&DataKey::Token(lease_id)).unwrap();
        let amount: i128 = env.storage().persistent().get(&DataKey::Amount(lease_id)).unwrap();

        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&tenant, &env.current_contract_address(), &amount);

        env.storage().persistent().set(&DataKey::IsFunded(lease_id), &true);
        env.storage().persistent().set(&DataKey::Status(lease_id), &1u32); // Active

        // Emit funded event
        env.events().publish(
            (symbol_short!("funded"), lease_id, tenant),
            amount,
        );
    }

    pub fn propose_release(env: Env, lease_id: u64, caller: Address, tenant_amount: i128, landlord_amount: i128) {
        caller.require_auth();

        let unlock_time: u64 = env.storage().persistent().get(&DataKey::UnlockTime(lease_id)).unwrap_or(0);
        if unlock_time > 0 && env.ledger().timestamp() < unlock_time {
            panic!("Escrow funds are locked until the unlock time");
        }

        let tenant: Address = env.storage().persistent().get(&DataKey::Tenant(lease_id)).expect("Lease not initialized");
        let landlord: Address = env.storage().persistent().get(&DataKey::Landlord(lease_id)).unwrap();

        if caller != tenant && caller != landlord {
            panic!("Caller must be tenant or landlord");
        }

        let is_funded: bool = env.storage().persistent().get(&DataKey::IsFunded(lease_id)).unwrap_or(false);
        if !is_funded {
            panic!("Escrow is not funded yet");
        }

        let status: u32 = env.storage().persistent().get(&DataKey::Status(lease_id)).unwrap();
        if status == 3 {
            panic!("Escrow already released");
        }
        if status == 2 {
            panic!("Escrow is in disputed state");
        }

        let amount: i128 = env.storage().persistent().get(&DataKey::Amount(lease_id)).unwrap();
        if tenant_amount < 0 || landlord_amount < 0 {
            panic!("Amounts must be non-negative");
        }
        if tenant_amount + landlord_amount != amount {
            panic!("Release split sum must equal total escrow amount");
        }

        // Save proposal
        env.storage().persistent().set(&DataKey::Proposal(lease_id, caller.clone()), &(tenant_amount, landlord_amount));

        // Emit proposal event
        env.events().publish(
            (symbol_short!("proposed"), lease_id, caller.clone()),
            (tenant_amount, landlord_amount),
        );

        if caller == tenant {
            let existing_unlock_time: u64 = env.storage().persistent().get(&DataKey::UnlockTime(lease_id)).unwrap_or(0);
            if existing_unlock_time == 0 {
                let lock_duration: u64 = env.storage().persistent().get(&DataKey::LockDuration(lease_id)).unwrap_or(0);
                let calculated_unlock_time = env.ledger().timestamp() + lock_duration;
                env.storage().persistent().set(&DataKey::UnlockTime(lease_id), &calculated_unlock_time);

                // Emit lock started event
                env.events().publish(
                    (symbol_short!("locked"), lease_id),
                    calculated_unlock_time,
                );
            }
        }

        // Check if other party has proposed and splits match
        let other_party = if caller == tenant { landlord.clone() } else { tenant.clone() };
        let other_proposal: Option<(i128, i128)> = env.storage().persistent().get(&DataKey::Proposal(lease_id, other_party));
        if let Some((other_tenant_amount, other_landlord_amount)) = other_proposal {
            if other_tenant_amount == tenant_amount && other_landlord_amount == landlord_amount {
                // Execute release!
                let token: Address = env.storage().persistent().get(&DataKey::Token(lease_id)).unwrap();
                let token_client = token::Client::new(&env, &token);

                if tenant_amount > 0 {
                    token_client.transfer(&env.current_contract_address(), &tenant, &tenant_amount);
                }
                if landlord_amount > 0 {
                    token_client.transfer(&env.current_contract_address(), &landlord, &landlord_amount);
                }

                env.storage().persistent().set(&DataKey::Status(lease_id), &3u32); // Released

                env.events().publish(
                    (symbol_short!("released"), lease_id, symbol_short!("mutual")),
                    (tenant_amount, landlord_amount),
                );
            } else {
                // Automated dispute on conflicting proposals
                env.storage().persistent().set(&DataKey::Status(lease_id), &2u32); // Disputed
                
                let reason = String::from_str(&env, "Automated dispute: landlord and tenant split proposals conflict");
                env.storage().persistent().set(&DataKey::DisputeReason(lease_id), &reason);

                // Emit dispute event
                env.events().publish(
                    (symbol_short!("disputed"), lease_id, caller.clone()),
                    reason,
                );
            }
        }
    }

    pub fn dispute(env: Env, lease_id: u64, caller: Address, reason: String) {
        caller.require_auth();

        let tenant: Address = env.storage().persistent().get(&DataKey::Tenant(lease_id)).expect("Lease not initialized");
        let landlord: Address = env.storage().persistent().get(&DataKey::Landlord(lease_id)).unwrap();

        if caller != tenant && caller != landlord {
            panic!("Caller must be tenant or landlord");
        }

        let is_funded: bool = env.storage().persistent().get(&DataKey::IsFunded(lease_id)).unwrap_or(false);
        if !is_funded {
            panic!("Escrow is not funded yet");
        }

        let status: u32 = env.storage().persistent().get(&DataKey::Status(lease_id)).unwrap();
        if status != 1 {
            panic!("Escrow can only be disputed when active");
        }

        env.storage().persistent().set(&DataKey::Status(lease_id), &2u32); // Disputed
        env.storage().persistent().set(&DataKey::DisputeReason(lease_id), &reason);

        env.events().publish(
            (symbol_short!("disputed"), lease_id, caller),
            reason,
        );
    }

    pub fn resolve_dispute(env: Env, lease_id: u64, tenant_amount: i128, landlord_amount: i128) {
        let arbitrator: Address = env.storage().persistent().get(&DataKey::Arbitrator(lease_id)).expect("Lease not initialized");
        arbitrator.require_auth();

        let unlock_time: u64 = env.storage().persistent().get(&DataKey::UnlockTime(lease_id)).unwrap_or(0);
        if unlock_time > 0 && env.ledger().timestamp() < unlock_time {
            panic!("Escrow funds are locked until the unlock time");
        }

        let status: u32 = env.storage().persistent().get(&DataKey::Status(lease_id)).unwrap();
        if status != 2 {
            panic!("Escrow is not in disputed state");
        }

        let amount: i128 = env.storage().persistent().get(&DataKey::Amount(lease_id)).unwrap();
        if tenant_amount < 0 || landlord_amount < 0 {
            panic!("Amounts must be non-negative");
        }
        if tenant_amount + landlord_amount != amount {
            panic!("Release split sum must equal total escrow amount");
        }

        let token: Address = env.storage().persistent().get(&DataKey::Token(lease_id)).unwrap();
        let tenant: Address = env.storage().persistent().get(&DataKey::Tenant(lease_id)).unwrap();
        let landlord: Address = env.storage().persistent().get(&DataKey::Landlord(lease_id)).unwrap();

        let token_client = token::Client::new(&env, &token);

        if tenant_amount > 0 {
            token_client.transfer(&env.current_contract_address(), &tenant, &tenant_amount);
        }
        if landlord_amount > 0 {
            token_client.transfer(&env.current_contract_address(), &landlord, &landlord_amount);
        }

        env.storage().persistent().set(&DataKey::Status(lease_id), &3u32); // Released

        env.events().publish(
            (symbol_short!("released"), lease_id, symbol_short!("dispute")),
            (tenant_amount, landlord_amount),
        );
    }

    // Getters
    pub fn get_tenant(env: Env, lease_id: u64) -> Address {
        env.storage().persistent().get(&DataKey::Tenant(lease_id)).expect("Lease not initialized")
    }

    pub fn get_landlord(env: Env, lease_id: u64) -> Address {
        env.storage().persistent().get(&DataKey::Landlord(lease_id)).expect("Lease not initialized")
    }

    pub fn get_arbitrator(env: Env, lease_id: u64) -> Address {
        env.storage().persistent().get(&DataKey::Arbitrator(lease_id)).expect("Lease not initialized")
    }

    pub fn get_token(env: Env, lease_id: u64) -> Address {
        env.storage().persistent().get(&DataKey::Token(lease_id)).expect("Lease not initialized")
    }

    pub fn get_amount(env: Env, lease_id: u64) -> i128 {
        env.storage().persistent().get(&DataKey::Amount(lease_id)).expect("Lease not initialized")
    }

    pub fn is_funded(env: Env, lease_id: u64) -> bool {
        env.storage().persistent().get(&DataKey::IsFunded(lease_id)).unwrap_or(false)
    }

    pub fn get_status(env: Env, lease_id: u64) -> u32 {
        env.storage().persistent().get(&DataKey::Status(lease_id)).unwrap_or(0)
    }

    pub fn get_dispute_reason(env: Env, lease_id: u64) -> String {
        env.storage().persistent().get(&DataKey::DisputeReason(lease_id)).expect("No dispute reason stored")
    }

    pub fn get_proposal(env: Env, lease_id: u64, party: Address) -> Option<(i128, i128)> {
        env.storage().persistent().get(&DataKey::Proposal(lease_id, party))
    }

    pub fn get_unlock_time(env: Env, lease_id: u64) -> u64 {
        env.storage().persistent().get(&DataKey::UnlockTime(lease_id)).unwrap_or(0)
    }
}

mod test;
