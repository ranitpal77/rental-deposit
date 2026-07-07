#![cfg(test)]
use crate::{EscrowContract, EscrowContractClient};
use soroban_sdk::{
    testutils::Address as _,
    token::{self, StellarAssetClient},
    Address, Env,
};

fn setup_test<'a>(env: &'a Env) -> (EscrowContractClient<'a>, Address, Address, Address, Address, token::Client<'a>) {
    env.mock_all_auths();

    let tenant = Address::generate(env);
    let landlord = Address::generate(env);
    let arbitrator = Address::generate(env);

    // Register a mock token
    let token_admin = Address::generate(env);
    let token_address = env.register_stellar_asset_contract(token_admin.clone());
    let token_client = token::Client::new(env, &token_address);
    let token_admin_client = StellarAssetClient::new(env, &token_address);

    // Mint tokens to tenant for the escrow
    token_admin_client.mint(&tenant, &1000);

    // Register the Escrow Contract
    let contract_id = env.register(EscrowContract, ());
    let client = EscrowContractClient::new(env, &contract_id);

    (client, tenant, landlord, arbitrator, token_address, token_client)
}

#[test]
fn test_initialize_and_getters() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, _token_client) = setup_test(&env);

    client.initialize(&1u64, &tenant, &landlord, &arbitrator, &token_address, &500, &0u64);

    assert_eq!(client.get_tenant(&1u64), tenant);
    assert_eq!(client.get_landlord(&1u64), landlord);
    assert_eq!(client.get_arbitrator(&1u64), arbitrator);
    assert_eq!(client.get_token(&1u64), token_address);
    assert_eq!(client.get_amount(&1u64), 500);
    assert_eq!(client.is_funded(&1u64), false);
    assert_eq!(client.get_status(&1u64), 0); // Created
    assert_eq!(client.get_unlock_time(&1u64), 0);
}

#[test]
#[should_panic(expected = "Lease ID already exists")]
fn test_cannot_double_initialize() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, _token_client) = setup_test(&env);

    client.initialize(&1u64, &tenant, &landlord, &arbitrator, &token_address, &500, &0u64);
    client.initialize(&1u64, &tenant, &landlord, &arbitrator, &token_address, &500, &0u64);
}

#[test]
#[should_panic(expected = "Amount must be positive")]
fn test_cannot_initialize_with_zero_amount() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, _token_client) = setup_test(&env);

    client.initialize(&1u64, &tenant, &landlord, &arbitrator, &token_address, &0, &0u64);
}

#[test]
fn test_fund() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, token_client) = setup_test(&env);

    let amount = 500;
    client.initialize(&1u64, &tenant, &landlord, &arbitrator, &token_address, &amount, &0u64);

    assert_eq!(token_client.balance(&tenant), 1000);
    assert_eq!(token_client.balance(&client.address), 0);

    client.fund(&1u64);

    assert_eq!(token_client.balance(&tenant), 500);
    assert_eq!(token_client.balance(&client.address), 500);
    assert_eq!(client.is_funded(&1u64), true);
    assert_eq!(client.get_status(&1u64), 1); // Active
}

#[test]
#[should_panic(expected = "Escrow is already funded")]
fn test_cannot_fund_twice() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, _token_client) = setup_test(&env);

    client.initialize(&1u64, &tenant, &landlord, &arbitrator, &token_address, &500, &0u64);
    client.fund(&1u64);
    client.fund(&1u64);
}

#[test]
fn test_mutual_release_perfect_agreement() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, token_client) = setup_test(&env);

    client.initialize(&1u64, &tenant, &landlord, &arbitrator, &token_address, &500, &0u64);
    client.fund(&1u64);

    // Tenant proposes split: 400 to tenant, 100 to landlord
    client.propose_release(&1u64, &tenant, &400, &100);
    assert_eq!(client.get_status(&1u64), 1); // Still Active
    assert_eq!(client.get_proposal(&1u64, &tenant), Some((400, 100)));

    // Landlord proposes matching split: 400 to tenant, 100 to landlord
    client.propose_release(&1u64, &landlord, &400, &100);

    // The release should be executed
    assert_eq!(client.get_status(&1u64), 3); // Released
    assert_eq!(token_client.balance(&tenant), 500 + 400); // 500 remaining + 400 released
    assert_eq!(token_client.balance(&landlord), 100); // 0 initial + 100 released
    assert_eq!(token_client.balance(&client.address), 0);
}

#[test]
fn test_mutual_release_conflicting_proposals_auto_disputes() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, _token_client) = setup_test(&env);

    client.initialize(&1u64, &tenant, &landlord, &arbitrator, &token_address, &500, &0u64);
    client.fund(&1u64);

    // Tenant proposes split: 400 to tenant, 100 to landlord
    client.propose_release(&1u64, &tenant, &400, &100);
    assert_eq!(client.get_status(&1u64), 1); // Still Active

    // Landlord proposes conflicting split: 300 to tenant, 200 to landlord
    client.propose_release(&1u64, &landlord, &300, &200);

    // Escrow must transition to Disputed (2) automatically
    assert_eq!(client.get_status(&1u64), 2); // Disputed
    assert_eq!(client.get_dispute_reason(&1u64), soroban_sdk::String::from_str(&env, "Automated dispute: landlord and tenant split proposals conflict"));
}

#[test]
#[should_panic(expected = "Release split sum must equal total escrow amount")]
fn test_propose_release_invalid_sum() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, _token_client) = setup_test(&env);

    client.initialize(&1u64, &tenant, &landlord, &arbitrator, &token_address, &500, &0u64);
    client.fund(&1u64);

    client.propose_release(&1u64, &tenant, &300, &100); // sums to 400, not 500
}

#[test]
fn test_dispute_and_arbitrator_resolution() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, token_client) = setup_test(&env);

    client.initialize(&1u64, &tenant, &landlord, &arbitrator, &token_address, &500, &0u64);
    client.fund(&1u64);

    // Tenant declares dispute
    let reason = soroban_sdk::String::from_str(&env, "Property had pre-existing damage, landlord claims deposit");
    client.dispute(&1u64, &tenant, &reason);

    assert_eq!(client.get_status(&1u64), 2); // Disputed
    assert_eq!(client.get_dispute_reason(&1u64), reason);

    // Arbitrator resolves split: 350 to tenant, 150 to landlord
    client.resolve_dispute(&1u64, &350, &150);

    assert_eq!(client.get_status(&1u64), 3); // Released
    assert_eq!(token_client.balance(&tenant), 500 + 350); // 500 remaining + 350 released
    assert_eq!(token_client.balance(&landlord), 150);
    assert_eq!(token_client.balance(&client.address), 0);
}

#[test]
#[should_panic(expected = "Escrow is not in disputed state")]
fn test_arbitrator_cannot_resolve_if_not_disputed() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, _token_client) = setup_test(&env);

    client.initialize(&1u64, &tenant, &landlord, &arbitrator, &token_address, &500, &0u64);
    client.fund(&1u64);

    client.resolve_dispute(&1u64, &350, &150);
}

#[test]
fn test_multiple_leases_are_isolated() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, _token_client) = setup_test(&env);

    client.initialize(&1u64, &tenant, &landlord, &arbitrator, &token_address, &500, &0u64);
    client.initialize(&2u64, &tenant, &landlord, &arbitrator, &token_address, &300, &0u64);

    assert_eq!(client.get_amount(&1u64), 500);
    assert_eq!(client.get_amount(&2u64), 300);
    assert_eq!(client.is_funded(&1u64), false);
    assert_eq!(client.is_funded(&2u64), false);
}

#[test]
fn test_lock_period_starts_only_after_tenant_proposal() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, _token_client) = setup_test(&env);

    // Initialize with a 100-second lock duration
    client.initialize(&1u64, &tenant, &landlord, &arbitrator, &token_address, &500, &100u64);
    client.fund(&1u64);

    // Lock has not started yet (unlock time is 0)
    assert_eq!(client.get_unlock_time(&1u64), 0);

    // Tenant proposes split: 400 to tenant, 100 to landlord
    client.propose_release(&1u64, &tenant, &400, &100);

    // Now, the unlock time should be block time (default 0) + 100 seconds
    assert_eq!(client.get_unlock_time(&1u64), 100);
}

#[test]
#[should_panic(expected = "Escrow funds are locked until the unlock time")]
fn test_landlord_cannot_propose_during_lock_duration() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, _token_client) = setup_test(&env);

    // Initialize with a 100-second lock duration
    client.initialize(&1u64, &tenant, &landlord, &arbitrator, &token_address, &500, &100u64);
    client.fund(&1u64);

    // Tenant proposes split: starts the lock
    client.propose_release(&1u64, &tenant, &400, &100);

    // Landlord tries to propose split within the 100 seconds duration -> should panic
    client.propose_release(&1u64, &landlord, &400, &100);
}
