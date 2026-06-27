# DEPOSHIELD // Trustless Security Deposit Escrow

Deposhield is a trustless, decentralized security deposit escrow platform built on the Stellar network using Soroban smart contracts. It eliminates the traditional trust issues in landlord-tenant relationships by locking deposit funds on-chain under neutral, programmatically-enforced release rules.

---

## Architecture Overview

1. **Soroban Smart Contract (`contracts/escrow/`)**:
   - Manages initialization, lockups, sequential split proposals, disputes, and resolution.
   - Designed to run independently per rental agreement, meaning each escrow is a separate contract instance for maximum safety and scalability.

2. **Frontend (`frontend/`)**:
   - Built with Vanilla HTML, CSS, and JS using Vite.
   - Integrates with the Freighter wallet browser extension for on-chain contract interaction.
   - Supports creating, funding, proposing matching split releases, raising disputes, and executing resolutions.

3. **Backend Coordination Service (`backend/`)**:
   - A lightweight Node/Express server.
   - Coordinates off-chain metadata (e.g. lease descriptions, names) and logs simulated email/SMS notifications (e.g. "Tenant has funded the deposit") for active users.

4. **Automation Scripts (`scripts/`)**:
   - Helper scripts for compiling the Soroban contract.

---

## How it Works (Product Lifecycle)

1. **Deployment**: The contract is deployed to Stellar Testnet (via CLI or build script).
2. **Initialization**: The tenant inputs the contract address, the landlord and arbitrator addresses, the token (XLM), and the deposit amount. This calls `initialize()` on the contract and registers metadata on the backend.
3. **Funding**: The tenant transfers the deposit to the contract using `fund()`. Both parties are notified.
4. **Mutual Release**: At move-out, both parties propose split amounts. When their proposed splits match on-chain, the contract transfers the funds.
5. **Dispute Resolution**: If they disagree, either party can raise a dispute. The neutral arbitrator (दिल्ली Housing Authority / DAO / Agency) can resolve the dispute on-chain by submitting the final split distribution.

---

## Running the Application

### 1. Build and Test the Smart Contract
Verify the smart contract logic compiles and passes all unit tests:
```bash
# Compile and run Rust tests
cd contracts/escrow
cargo test
```

Build the contract WASM:
```bash
# From workspace root
node scripts/deploy.js
```

### 2. Start the Backend Coordination Server
```bash
cd backend
npm install
npm start
# Runs on http://localhost:5000
```

### 3. Run the Frontend Web Dashboard
Ensure you have the Freighter wallet extension installed in your browser.
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:3000
```

---

## Core Technologies
- **Smart Contract**: Rust & Soroban SDK (v25)
- **Frontend**: Vanilla HTML5, Vanilla CSS3, Javascript, Vite
- **Wallet Integration**: `@stellar/freighter-api` & `@stellar/stellar-sdk`
- **Backend API**: Node.js & Express
