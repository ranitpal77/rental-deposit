import { isConnected, requestAccess, signTransaction } from '@stellar/freighter-api';
import { 
  Contract, 
  TransactionBuilder, 
  Networks, 
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  Account,
  Operation
} from '@stellar/stellar-sdk';
import { Server } from '@stellar/stellar-sdk/rpc';

// Config
const RPC_URL = 'https://soroban-testnet.stellar.org:443';
const NETWORK_PASSPHRASE = Networks.TESTNET;
const BACKEND_URL = 'http://localhost:5000';

const rpcServer = new Server(RPC_URL);

// App State
let userAddress = null;
let activeEscrowAddress = null;
let activeEscrowDetails = null;

// UI Elements
const btnConnect = document.getElementById('btn-connect');
const walletInfo = document.getElementById('wallet-info');
const walletAddress = document.getElementById('wallet-address');
const btnDisconnect = document.getElementById('btn-disconnect');

const tabCreate = document.getElementById('tab-create');
const tabManage = document.getElementById('tab-manage');
const panelCreate = document.getElementById('panel-create');
const panelManage = document.getElementById('panel-manage');

const formCreate = document.getElementById('form-create-escrow');
const btnSubmitCreate = document.getElementById('btn-submit-create');

const inputSearchAddress = document.getElementById('input-search-address');
const btnSearchEscrow = document.getElementById('btn-search-escrow');
const activeEscrowDetailsPanel = document.getElementById('active-escrow-details');

const detailTitle = document.getElementById('detail-title');
const detailStatusBadge = document.getElementById('detail-status-badge');
const detailDesc = document.getElementById('detail-desc');
const detailTenant = document.getElementById('detail-tenant');
const detailTenantName = document.getElementById('detail-tenant-name');
const detailLandlord = document.getElementById('detail-landlord');
const detailLandlordName = document.getElementById('detail-landlord-name');
const detailAmount = document.getElementById('detail-amount');
const detailContractAddress = document.getElementById('detail-contract-address');

const actionsUnfunded = document.getElementById('actions-unfunded');
const btnFundEscrow = document.getElementById('btn-fund-escrow');

const actionsActive = document.getElementById('actions-active');
const rangeSplit = document.getElementById('range-split');
const lblSplitTenant = document.getElementById('lbl-split-tenant');
const lblSplitLandlord = document.getElementById('lbl-split-landlord');
const btnProposeSplit = document.getElementById('btn-propose-split');
const inputDisputeReason = document.getElementById('input-dispute-reason');
const btnDispute = document.getElementById('btn-dispute');

const actionsDisputed = document.getElementById('actions-disputed');
const lblDisputeReason = document.getElementById('lbl-dispute-reason');
const arbitratorControls = document.getElementById('arbitrator-controls');
const arbitratorWaiting = document.getElementById('arbitrator-waiting');
const rangeArb = document.getElementById('range-arb');
const lblArbTenant = document.getElementById('lbl-arb-tenant');
const lblArbLandlord = document.getElementById('lbl-arb-landlord');
const btnResolveDispute = document.getElementById('btn-resolve-dispute');

const actionsReleased = document.getElementById('actions-released');
const lblReleaseInfo = document.getElementById('lbl-release-info');

const dashboardEscrowList = document.getElementById('dashboard-escrow-list');
const notificationLogs = document.getElementById('notification-logs');

// Init UI & Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  initWallet();
  loadDashboardEscrows();
  pollNotifications();
  setInterval(pollNotifications, 5000);
  setInterval(loadDashboardEscrows, 8000);

  // Tabs
  tabCreate.addEventListener('click', () => {
    tabCreate.classList.add('active');
    tabManage.classList.remove('active');
    panelCreate.classList.remove('hidden');
    panelManage.classList.add('hidden');
  });

  tabManage.addEventListener('click', () => {
    tabManage.classList.add('active');
    tabCreate.classList.remove('active');
    panelManage.classList.remove('hidden');
    panelCreate.classList.add('hidden');
  });

  // Wallet Connection
  btnConnect.addEventListener('click', connectWallet);
  btnDisconnect.addEventListener('click', disconnectWallet);

  // Forms
  formCreate.addEventListener('submit', handleCreateEscrow);
  btnSearchEscrow.addEventListener('click', () => {
    const address = inputSearchAddress.value.trim();
    if (address) loadEscrow(address);
  });

  // Sliders for Split Release
  rangeSplit.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    const max = parseInt(e.target.max);
    lblSplitTenant.textContent = `${val} XLM`;
    lblSplitLandlord.textContent = `${max - val} XLM`;
  });

  rangeArb.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    const max = parseInt(e.target.max);
    lblArbTenant.textContent = `${val} XLM`;
    lblArbLandlord.textContent = `${max - val} XLM`;
  });

  // Action Buttons
  btnFundEscrow.addEventListener('click', fundEscrow);
  btnProposeSplit.addEventListener('click', proposeSplit);
  btnDispute.addEventListener('click', declareDispute);
  btnResolveDispute.addEventListener('click', resolveDispute);
});

// Wallet Helper Functions
async function initWallet() {
  const connected = await isConnected();
  if (connected) {
    try {
      const address = await requestAccess();
      if (address) {
        setConnectedWallet(address);
      }
    } catch (e) {
      console.log('User did not authorize wallet details auto-connect.');
    }
  }
}

async function connectWallet() {
  const connected = await isConnected();
  if (!connected) {
    alert('Please install the Freighter wallet extension to use this application.');
    return;
  }
  try {
    const address = await requestAccess();
    if (address) {
      setConnectedWallet(address);
    }
  } catch (err) {
    console.error('Wallet connection rejected:', err);
    alert('Failed to connect to Freighter wallet.');
  }
}

function setConnectedWallet(address) {
  userAddress = address;
  walletAddress.textContent = `${address.slice(0, 6)}...${address.slice(-6)}`;
  walletInfo.classList.remove('hidden');
  btnConnect.classList.add('hidden');
  console.log('Wallet connected:', address);
}

function disconnectWallet() {
  userAddress = null;
  walletInfo.classList.add('hidden');
  btnConnect.classList.remove('hidden');
  console.log('Wallet disconnected');
}

// REST Backend Actions
async function loadDashboardEscrows() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/escrows`);
    const escrows = await res.json();
    
    if (escrows.length === 0) {
      dashboardEscrowList.innerHTML = `<div class="dashboard-placeholder">No active escrows registered.</div>`;
      return;
    }

    dashboardEscrowList.innerHTML = escrows.map(escrow => `
      <div class="escrow-row" data-address="${escrow.address}">
        <div class="escrow-row-meta">
          <span class="escrow-row-title">${escrow.title}</span>
          <span class="escrow-row-address address-mono">${escrow.address}</span>
        </div>
        <div class="escrow-row-stats">
          <span class="escrow-row-amount address-mono">${escrow.amount}</span>
          <span class="badge-status ${getStatusBadgeClass(escrow.status)}">${escrow.status.toUpperCase()}</span>
        </div>
      </div>
    `).join('');

    // Attach click events
    document.querySelectorAll('.escrow-row').forEach(row => {
      row.addEventListener('click', () => {
        const addr = row.getAttribute('data-address');
        tabManage.click();
        inputSearchAddress.value = addr;
        loadEscrow(addr);
      });
    });
  } catch (err) {
    console.error('Failed to load dashboard escrows:', err);
  }
}

function getStatusBadgeClass(status) {
  switch (status.toLowerCase()) {
    case 'active': return 'status-active';
    case 'disputed': return 'status-disputed';
    case 'created': return 'status-created';
    case 'released':
    case 'released (disputed)': return 'status-released';
    default: return 'status-released';
  }
}

async function pollNotifications() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/escrows`);
    const escrows = await res.json();
    
    // Aggregate history logs as notifications
    const allLogs = [];
    escrows.forEach(e => {
      e.history.forEach(h => {
        allLogs.push({
          time: new Date(h.timestamp).toLocaleTimeString(),
          title: e.title,
          event: h.event,
          escrow: e
        });
      });
    });

    // Sort by timestamp desc
    allLogs.sort((a, b) => new Date(b.time) - new Date(a.time));

    notificationLogs.innerHTML = allLogs.slice(0, 10).map(log => {
      let recipient = 'Tenant & Landlord';
      let roleClass = 'tenant';
      if (log.event.includes('Dispute resolved')) {
        recipient = 'Delhi Housing Authority (Arbitrator)';
        roleClass = 'arbitrator';
      } else if (log.event.includes('Dispute declared')) {
        recipient = 'Delhi Housing Authority';
        roleClass = 'arbitrator';
      } else if (log.event.includes('Funded')) {
        recipient = `${log.escrow.landlordName} (Landlord)`;
        roleClass = 'landlord';
      } else if (log.event.includes('Created')) {
        recipient = `${log.escrow.landlordName} (Landlord)`;
        roleClass = 'landlord';
      }

      return `
        <div class="log-entry">
          <span class="log-time">[${log.time}] (${log.title})</span>
          <span class="log-label ${roleClass}">TO: ${recipient}</span>
          <span class="log-msg">${log.event}</span>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Failed to poll notifications:', err);
  }
}

// On-chain interaction Helpers
async function simulateCall(contractId, method, args = []) {
  const contract = new Contract(contractId);
  const dummyAccount = new Account('GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H', '0');
  
  const tx = new TransactionBuilder(dummyAccount, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
  .addOperation(contract.call(method, ...args))
  .setTimeout(30)
  .build();

  const sim = await rpcServer.simulateTransaction(tx);
  if (sim.error) {
    throw new Error(`Simulation failed for ${method}: ${sim.error}`);
  }
  
  if (sim.result && sim.result.retval) {
    return scValToNative(sim.result.retval);
  }
  return null;
}

async function executeTx(contractId, method, args = []) {
  if (!userAddress) {
    alert('Please connect your Freighter wallet first.');
    throw new Error('Wallet not connected');
  }

  // Load account
  const sourceAccount = await rpcServer.getAccount(userAddress);
  const contract = new Contract(contractId);

  // Build TX
  let tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
  .addOperation(contract.call(method, ...args))
  .setTimeout(30)
  .build();

  // Simulate & Prepare (adds resources/fees)
  tx = await rpcServer.prepareTransaction(tx);

  // Sign with Freighter
  const signedXdr = await signTransaction(tx.toXDR(), { network: 'TESTNET' });
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

  // Send
  const submitResult = await rpcServer.sendTransaction(signedTx);
  if (submitResult.status === 'ERROR') {
    throw new Error(`Submit error: ${JSON.stringify(submitResult.errorResultXdr)}`);
  }

  // Wait/Poll status
  console.log('Transaction submitted. Hash:', submitResult.hash);
  return await waitTx(submitResult.hash);
}

async function waitTx(hash) {
  for (let i = 0; i < 20; i++) {
    const res = await rpcServer.getTransaction(hash);
    if (res.status === 'SUCCESS') {
      return res;
    } else if (res.status === 'FAILED') {
      throw new Error(`Transaction execution failed: ${res.resultXdr}`);
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Transaction execution timeout');
}

// Business flows
async function handleCreateEscrow(e) {
  e.preventDefault();
  
  const title = document.getElementById('input-title').value.trim();
  const desc = document.getElementById('input-desc').value.trim();
  const landlord = document.getElementById('input-landlord').value.trim();
  const arbitrator = document.getElementById('input-arbitrator').value.trim();
  const amount = parseInt(document.getElementById('input-amount').value);
  const tokenSelect = document.getElementById('select-token').value;
  const tenantName = document.getElementById('input-tenant-name').value.trim();
  const landlordName = document.getElementById('input-landlord-name').value.trim();

  // For native, we use the standard SAC token on Testnet (usually Native XLM token is CAS3J7GYUVRI77UTQD73NQDOWB4L65B6O7GPMJNDKCQD24J32KCP7SFH)
  const token = tokenSelect === 'native' 
    ? 'CAS3J7GYUVRI77UTQD73NQDOWB4L65B6O7GPMJNDKCQD24J32KCP7SFH' 
    : 'CD7Q523WTYX2UOPLHEXZ26J6R74WSHU6DCOFHRFDFYJZ4TZZ2J4E2USDC'; // Mock USDC

  if (!userAddress) {
    alert('Please connect your Freighter wallet to execute smart contract operations.');
    return;
  }

  btnSubmitCreate.disabled = true;
  btnSubmitCreate.textContent = 'PROPOSING LEASE INITIALIZATION...';

  try {
    // 1. Prompt user to deploy using terminal as pre-step, or generate a mockup deploy
    // The user's contract address is what they input or we can deploy/mock it
    // Wait, let's look at how the contract is initialized.
    // The user has compiled the contract, so we need a contract address to call!
    // Let's ask them for the contract address they deployed.
    const contractAddress = prompt('Please enter the Soroban Contract ID you deployed from the terminal:');
    if (!contractAddress) {
      btnSubmitCreate.disabled = false;
      btnSubmitCreate.textContent = 'INITIALIZE ESCROW ON-CHAIN';
      return;
    }

    console.log('Initializing contract', contractAddress);
    
    // Call contract.initialize(...)
    const args = [
      nativeToScVal(userAddress, { type: 'address' }), // tenant
      nativeToScVal(landlord, { type: 'address' }),
      nativeToScVal(arbitrator, { type: 'address' }),
      nativeToScVal(token, { type: 'address' }),
      nativeToScVal(BigInt(amount), { type: 'i128' })
    ];

    await executeTx(contractAddress, 'initialize', args);

    // Call REST backend to store metadata
    await fetch(`${BACKEND_URL}/api/escrows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: contractAddress,
        tenant: userAddress,
        tenantName,
        landlord,
        landlordName,
        arbitrator,
        arbitratorName: 'Delhi Housing Authority',
        amount: `${amount} XLM`,
        title,
        description: desc
      })
    });

    alert('Escrow initialized successfully on-chain and registered on backend!');
    formCreate.reset();
    loadDashboardEscrows();
    loadEscrow(contractAddress);
  } catch (err) {
    console.error('Escrow initialization failed:', err);
    alert(`Failed to initialize escrow: ${err.message}`);
  } finally {
    btnSubmitCreate.disabled = false;
    btnSubmitCreate.textContent = 'INITIALIZE ESCROW ON-CHAIN';
  }
}

async function loadEscrow(address) {
  activeEscrowAddress = address;
  activeEscrowDetailsPanel.classList.add('hidden');

  try {
    // 1. Fetch metadata from backend
    const metaRes = await fetch(`${BACKEND_URL}/api/escrows/${address}`);
    let metadata = {
      tenantName: 'Tenant',
      landlordName: 'Landlord',
      arbitratorName: 'Arbitrator',
      title: 'Rental Escrow',
      description: 'Security deposit'
    };
    if (metaRes.ok) {
      metadata = await metaRes.json();
    }

    // 2. Fetch state on-chain via simulation
    const tenantAddr = await simulateCall(address, 'get_tenant');
    const landlordAddr = await simulateCall(address, 'get_landlord');
    const arbitratorAddr = await simulateCall(address, 'get_arbitrator');
    const amountVal = await simulateCall(address, 'get_amount');
    const isFunded = await simulateCall(address, 'is_funded');
    const status = await simulateCall(address, 'get_status'); // 0=Created, 1=Active, 2=Disputed, 3=Released

    // Update state
    activeEscrowDetails = {
      address,
      tenant: tenantAddr,
      landlord: landlordAddr,
      arbitrator: arbitratorAddr,
      amount: amountVal,
      isFunded,
      status,
      tenantName: metadata.tenantName,
      landlordName: metadata.landlordName,
      title: metadata.title,
      description: metadata.description
    };

    // Update UI Elements
    detailTitle.textContent = activeEscrowDetails.title;
    detailDesc.textContent = activeEscrowDetails.description;
    detailTenant.textContent = `${tenantAddr.slice(0, 8)}...${tenantAddr.slice(-6)}`;
    detailTenantName.textContent = activeEscrowDetails.tenantName;
    detailLandlord.textContent = `${landlordAddr.slice(0, 8)}...${landlordAddr.slice(-6)}`;
    detailLandlordName.textContent = activeEscrowDetails.landlordName;
    detailAmount.textContent = `${amountVal} XLM`;
    detailContractAddress.textContent = `${address.slice(0, 10)}...${address.slice(-8)}`;

    // Set slider range limits
    rangeSplit.max = amountVal.toString();
    rangeSplit.value = Math.floor(amountVal / 2).toString();
    lblSplitTenant.textContent = `${rangeSplit.value} XLM`;
    lblSplitLandlord.textContent = `${amountVal - rangeSplit.value} XLM`;

    rangeArb.max = amountVal.toString();
    rangeArb.value = Math.floor(amountVal / 2).toString();
    lblArbTenant.textContent = `${rangeArb.value} XLM`;
    lblArbLandlord.textContent = `${amountVal - rangeArb.value} XLM`;

    // Status Badge & Controls display
    updateStatusVisuals(status, isFunded);

    activeEscrowDetailsPanel.classList.remove('hidden');
  } catch (err) {
    console.error('Failed to load escrow details:', err);
    alert(`Failed to load escrow from Soroban chain: ${err.message}. Ensure it is initialized.`);
  }
}

function updateStatusVisuals(status, isFunded) {
  // Hide all panels
  actionsUnfunded.classList.add('hidden');
  actionsActive.classList.add('hidden');
  actionsDisputed.classList.add('hidden');
  actionsReleased.classList.add('hidden');

  if (!isFunded) {
    detailStatusBadge.textContent = 'UNFUNDED / CREATED';
    detailStatusBadge.className = 'badge-status status-created';
    actionsUnfunded.classList.remove('hidden');
    return;
  }

  // 1 = Active, 2 = Disputed, 3 = Released
  if (status === 1) {
    detailStatusBadge.textContent = 'ACTIVE / LOCKED';
    detailStatusBadge.className = 'badge-status status-active';
    actionsActive.classList.remove('hidden');
  } else if (status === 2) {
    detailStatusBadge.textContent = 'DISPUTED';
    detailStatusBadge.className = 'badge-status status-disputed';
    actionsDisputed.classList.remove('hidden');

    // Load dispute reason
    simulateCall(activeEscrowAddress, 'get_dispute_reason').then(reason => {
      lblDisputeReason.textContent = `Reason: "${reason}"`;
    }).catch(() => {
      lblDisputeReason.textContent = 'Reason: No description provided';
    });

    // Check if user is the arbitrator
    if (userAddress === activeEscrowDetails.arbitrator) {
      arbitratorControls.classList.remove('hidden');
      arbitratorWaiting.classList.add('hidden');
    } else {
      arbitratorControls.classList.add('hidden');
      arbitratorWaiting.classList.remove('hidden');
    }
  } else if (status === 3) {
    detailStatusBadge.textContent = 'RELEASED / CLOSED';
    detailStatusBadge.className = 'badge-status status-released';
    actionsReleased.classList.remove('hidden');
  }
}

// Action execution
async function fundEscrow() {
  if (!activeEscrowAddress) return;
  
  const originalText = btnFundEscrow.textContent;
  btnFundEscrow.disabled = true;
  btnFundEscrow.textContent = 'EXECUTING ON-CHAIN TRANSFER...';

  try {
    // Call contract.fund()
    await executeTx(activeEscrowAddress, 'fund');

    // Notify backend
    await fetch(`${BACKEND_URL}/api/escrows/${activeEscrowAddress}/fund`, { method: 'POST' });

    alert('Escrow funded successfully on-chain! Funds locked in smart contract.');
    loadEscrow(activeEscrowAddress);
    loadDashboardEscrows();
  } catch (err) {
    console.error('Funding failed:', err);
    alert(`Funding transaction failed: ${err.message}`);
  } finally {
    btnFundEscrow.disabled = false;
    btnFundEscrow.textContent = originalText;
  }
}

async function proposeSplit() {
  if (!activeEscrowAddress) return;

  const tenantAmount = parseInt(rangeSplit.value);
  const landlordAmount = activeEscrowDetails.amount - tenantAmount;

  const originalText = btnProposeSplit.textContent;
  btnProposeSplit.disabled = true;
  btnProposeSplit.textContent = 'SUBMITTING RELEASE PROPOSAL...';

  try {
    // Call propose_release
    const args = [
      nativeToScVal(userAddress, { type: 'address' }),
      nativeToScVal(BigInt(tenantAmount), { type: 'i128' }),
      nativeToScVal(BigInt(landlordAmount), { type: 'i128' })
    ];

    await executeTx(activeEscrowAddress, 'propose_release', args);

    // Get contract status after call to see if it triggered matching split release
    const currentStatus = await simulateCall(activeEscrowAddress, 'get_status');
    
    if (currentStatus === 3) {
      // Released
      await fetch(`${BACKEND_URL}/api/escrows/${activeEscrowAddress}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantAmount, landlordAmount })
      });
      alert('Agreement reached! Splits match. Escrow released successfully!');
    } else {
      // Split submitted
      await fetch(`${BACKEND_URL}/api/escrows/${activeEscrowAddress}/propose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caller: userAddress, tenantAmount, landlordAmount })
      });
      alert(`Split proposal submitted! Waiting for matching proposal from the other party.`);
    }

    loadEscrow(activeEscrowAddress);
    loadDashboardEscrows();
  } catch (err) {
    console.error('Proposal split failed:', err);
    alert(`Transaction failed: ${err.message}`);
  } finally {
    btnProposeSplit.disabled = false;
    btnProposeSplit.textContent = originalText;
  }
}

async function declareDispute() {
  if (!activeEscrowAddress) return;
  const reason = inputDisputeReason.value.trim() || 'No dispute reason provided';

  const originalText = btnDispute.textContent;
  btnDispute.disabled = true;
  btnDispute.textContent = 'RAISING DISPUTE...';

  try {
    // Call contract.dispute
    const args = [
      nativeToScVal(userAddress, { type: 'address' }),
      nativeToScVal(reason, { type: 'string' })
    ];

    await executeTx(activeEscrowAddress, 'dispute', args);

    // Notify backend
    await fetch(`${BACKEND_URL}/api/escrows/${activeEscrowAddress}/dispute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caller: userAddress, reason })
    });

    alert('Dispute successfully declared on-chain. Arbitrator has been notified.');
    inputDisputeReason.value = '';
    loadEscrow(activeEscrowAddress);
    loadDashboardEscrows();
  } catch (err) {
    console.error('Dispute failed:', err);
    alert(`Dispute transaction failed: ${err.message}`);
  } finally {
    btnDispute.disabled = false;
    btnDispute.textContent = originalText;
  }
}

async function resolveDispute() {
  if (!activeEscrowAddress) return;
  const tenantAmount = parseInt(rangeArb.value);
  const landlordAmount = activeEscrowDetails.amount - tenantAmount;

  const originalText = btnResolveDispute.textContent;
  btnResolveDispute.disabled = true;
  btnResolveDispute.textContent = 'RESOLVING DISPUTE...';

  try {
    // Call contract.resolve_dispute
    const args = [
      nativeToScVal(BigInt(tenantAmount), { type: 'i128' }),
      nativeToScVal(BigInt(landlordAmount), { type: 'i128' })
    ];

    await executeTx(activeEscrowAddress, 'resolve_dispute', args);

    // Notify backend
    await fetch(`${BACKEND_URL}/api/escrows/${activeEscrowAddress}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantAmount, landlordAmount })
    });

    alert('Dispute resolved by arbitrator. Funds distributed!');
    loadEscrow(activeEscrowAddress);
    loadDashboardEscrows();
  } catch (err) {
    console.error('Resolution failed:', err);
    alert(`Resolution transaction failed: ${err.message}`);
  } finally {
    btnResolveDispute.disabled = false;
    btnResolveDispute.textContent = originalText;
  }
}
