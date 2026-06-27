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

    client.initialize(&tenant, &landlord, &arbitrator, &token_address, &500);

    assert_eq!(client.get_tenant(), tenant);
    assert_eq!(client.get_landlord(), landlord);
    assert_eq!(client.get_arbitrator(), arbitrator);
    assert_eq!(client.get_token(), token_address);
    assert_eq!(client.get_amount(), 500);
    assert_eq!(client.is_funded(), false);
    assert_eq!(client.get_status(), 0); // Created
}

#[test]
#[should_panic(expected = "Already initialized")]
fn test_cannot_double_initialize() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, _token_client) = setup_test(&env);

    client.initialize(&tenant, &landlord, &arbitrator, &token_address, &500);
    client.initialize(&tenant, &landlord, &arbitrator, &token_address, &500);
}

#[test]
#[should_panic(expected = "Amount must be positive")]
fn test_cannot_initialize_with_zero_amount() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, _token_client) = setup_test(&env);

    client.initialize(&tenant, &landlord, &arbitrator, &token_address, &0);
}

#[test]
fn test_fund() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, token_client) = setup_test(&env);

    let amount = 500;
    client.initialize(&tenant, &landlord, &arbitrator, &token_address, &amount);

    assert_eq!(token_client.balance(&tenant), 1000);
    assert_eq!(token_client.balance(&client.address), 0);

    client.fund();

    assert_eq!(token_client.balance(&tenant), 500);
    assert_eq!(token_client.balance(&client.address), 500);
    assert_eq!(client.is_funded(), true);
    assert_eq!(client.get_status(), 1); // Active
}

#[test]
#[should_panic(expected = "Escrow is already funded")]
fn test_cannot_fund_twice() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, _token_client) = setup_test(&env);

    client.initialize(&tenant, &landlord, &arbitrator, &token_address, &500);
    client.fund();
    client.fund();
}

#[test]
fn test_mutual_release_perfect_agreement() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, token_client) = setup_test(&env);

    client.initialize(&tenant, &landlord, &arbitrator, &token_address, &500);
    client.fund();

    // Tenant proposes split: 400 to tenant, 100 to landlord
    client.propose_release(&tenant, &400, &100);
    assert_eq!(client.get_status(), 1); // Still Active
    assert_eq!(client.get_proposal(&tenant), Some((400, 100)));

    // Landlord proposes different split: 300 to tenant, 200 to landlord
    client.propose_release(&landlord, &300, &200);
    assert_eq!(client.get_status(), 1); // Still Active because splits do not match

    // Landlord changes proposal to match tenant
    client.propose_release(&landlord, &400, &100);

    // The release should be executed
    assert_eq!(client.get_status(), 3); // Released
    assert_eq!(token_client.balance(&tenant), 500 + 400); // 500 remaining + 400 released
    assert_eq!(token_client.balance(&landlord), 100); // 0 initial + 100 released
    assert_eq!(token_client.balance(&client.address), 0);
}

#[test]
#[should_panic(expected = "Release split sum must equal total escrow amount")]
fn test_propose_release_invalid_sum() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, _token_client) = setup_test(&env);

    client.initialize(&tenant, &landlord, &arbitrator, &token_address, &500);
    client.fund();

    client.propose_release(&tenant, &300, &100); // sums to 400, not 500
}

#[test]
fn test_dispute_and_arbitrator_resolution() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, token_client) = setup_test(&env);

    client.initialize(&tenant, &landlord, &arbitrator, &token_address, &500);
    client.fund();

    // Tenant declares dispute
    let reason = soroban_sdk::String::from_str(&env, "Property had pre-existing damage, landlord claims deposit");
    client.dispute(&tenant, &reason);

    assert_eq!(client.get_status(), 2); // Disputed
    assert_eq!(client.get_dispute_reason(), reason);

    // Arbitrator resolves split: 350 to tenant, 150 to landlord
    client.resolve_dispute(&350, &150);

    assert_eq!(client.get_status(), 3); // Released
    assert_eq!(token_client.balance(&tenant), 500 + 350); // 500 remaining + 350 released
    assert_eq!(token_client.balance(&landlord), 150);
    assert_eq!(token_client.balance(&client.address), 0);
}

#[test]
#[should_panic(expected = "Escrow is not in disputed state")]
fn test_arbitrator_cannot_resolve_if_not_disputed() {
    let env = Env::default();
    let (client, tenant, landlord, arbitrator, token_address, _token_client) = setup_test(&env);

    client.initialize(&tenant, &landlord, &arbitrator, &token_address, &500);
    client.fund();

    client.resolve_dispute(&350, &150);
}
