const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('==================================================');
console.log('DEPOSHIELD SMART CONTRACT COMPILATION & SETUP');
console.log('==================================================\n');

try {
  console.log('[1/3] Running Soroban contract build...');
  const contractDir = path.join(__dirname, '..', 'contracts', 'escrow');
  
  // Run build command
  execSync('stellar contract build', { cwd: contractDir, stdio: 'inherit' });
  console.log('\n[2/3] Build completed successfully.');

  let wasmPath = path.join(contractDir, 'target', 'wasm32v1-none', 'release', 'escrow.wasm');
  if (!fs.existsSync(wasmPath)) {
    wasmPath = path.join(contractDir, 'target', 'wasm32v1-none', 'release', 'escrow_contract.wasm');
  }
  if (!fs.existsSync(wasmPath)) {
    wasmPath = path.join(contractDir, 'target', 'wasm32-unknown-unknown', 'release', 'escrow.wasm');
  }
  if (!fs.existsSync(wasmPath)) {
    wasmPath = path.join(contractDir, 'target', 'wasm32-unknown-unknown', 'release', 'escrow_contract.wasm');
  }

  if (fs.existsSync(wasmPath)) {
    console.log(`[3/3] Found WASM target at: ${wasmPath}`);
    console.log('\n--- HOW TO DEPLOY TO STELLAR TESTNET ---');
    console.log('Run the following command in your terminal to deploy your contract:');
    console.log(`\n  stellar contract deploy \\\n    --wasm "${wasmPath}" \\\n    --source <YOUR_STELLAR_SECRET_KEY> \\\n    --network testnet\n`);
    console.log('This will output a Contract ID (e.g. CD3W...QPL).');
    console.log('Copy and paste this Contract ID when initializing a new lease in the frontend app dashboard!');
  } else {
    console.error('WASM file not found in default output directory. Please check if Cargo built successfully.');
  }

} catch (err) {
  console.error('\nBuild failed during compilation:', err.message);
  process.exit(1);
}
