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

// Local Storage database helpers to support 100% serverless frontend-only hosting
function getLocalEscrows() {
  const data = localStorage.getItem('deposhield_escrows');
  if (!data) {
    localStorage.setItem('deposhield_escrows', JSON.stringify([]));
    return [];
  }
  return JSON.parse(data);
}

function saveLocalEscrows(escrows) {
  localStorage.setItem('deposhield_escrows', JSON.stringify(escrows));
}

// UI Elements
const btnConnect = document.getElementById('btn-connect');
const walletInfo = document.getElementById('wallet-info');
const walletAddress = document.getElementById('wallet-address');
const btnDisconnect = document.getElementById('btn-disconnect');

const walletBalanceCard = document.getElementById('wallet-balance-card');
const walletBalanceAddress = document.getElementById('wallet-balance-address');
const walletBalanceVal = document.getElementById('wallet-balance-val');

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

// Page Navigation Router Selectors
const navbarMenu = document.getElementById('navbar-menu');
const navWorkspace = document.getElementById('nav-workspace');
const navDashboard = document.getElementById('nav-dashboard');
const navDocs = document.getElementById('nav-docs');
const pageWorkspace = document.getElementById('page-workspace');
const pageDashboard = document.getElementById('page-dashboard');
const pageDocs = document.getElementById('page-docs');

function switchPage(pageId) {
  if (!pageWorkspace || !pageDashboard || !pageDocs) return;
  pageWorkspace.classList.add('hidden');
  pageDashboard.classList.add('hidden');
  pageDocs.classList.add('hidden');

  navWorkspace.classList.remove('active');
  navDashboard.classList.remove('active');
  navDocs.classList.remove('active');

  const mobileNavWorkspace = document.getElementById('mobile-nav-workspace');
  const mobileNavDashboard = document.getElementById('mobile-nav-dashboard');
  const mobileNavDocs = document.getElementById('mobile-nav-docs');

  if (mobileNavWorkspace && mobileNavDashboard && mobileNavDocs) {
    mobileNavWorkspace.classList.remove('active');
    mobileNavDashboard.classList.remove('active');
    mobileNavDocs.classList.remove('active');
  }

  if (pageId === 'workspace') {
    pageWorkspace.classList.remove('hidden');
    navWorkspace.classList.add('active');
    if (mobileNavWorkspace) mobileNavWorkspace.classList.add('active');
  } else if (pageId === 'dashboard') {
    pageDashboard.classList.remove('hidden');
    navDashboard.classList.add('active');
    if (mobileNavDashboard) mobileNavDashboard.classList.add('active');
    loadDashboardEscrows();
  } else if (pageId === 'docs') {
    pageDocs.classList.remove('hidden');
    navDocs.classList.add('active');
    if (mobileNavDocs) mobileNavDocs.classList.add('active');
  }
}

// Init UI & Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  initWallet();
  loadDashboardEscrows();
  setInterval(loadDashboardEscrows, 8000);
  setInterval(updateWalletBalance, 10000);

  // Theme Switching Logic
  const themeToggle = document.getElementById('btn-theme-toggle');
  const sunIcon = document.getElementById('theme-icon-sun');
  const moonIcon = document.getElementById('theme-icon-moon');

  const currentTheme = localStorage.getItem('deposhield_theme') || 'dark';
  if (currentTheme === 'light') {
    document.body.classList.add('light-theme');
    if (sunIcon) sunIcon.classList.add('hidden');
    if (moonIcon) moonIcon.classList.remove('hidden');
  }

  function toggleTheme() {
    const isLight = document.body.classList.toggle('light-theme');
    localStorage.setItem('deposhield_theme', isLight ? 'light' : 'dark');
    
    if (isLight) {
      if (sunIcon) sunIcon.classList.add('hidden');
      if (moonIcon) moonIcon.classList.remove('hidden');
    } else {
      if (sunIcon) sunIcon.classList.remove('hidden');
      if (moonIcon) moonIcon.classList.add('hidden');
    }
  }

  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

  // Page Router binding
  if (navWorkspace && navDashboard && navDocs) {
    navWorkspace.addEventListener('click', () => switchPage('workspace'));
    navDashboard.addEventListener('click', () => switchPage('dashboard'));
    navDocs.addEventListener('click', () => switchPage('docs'));
  }

  // Mobile Hamburger & Menu bindings
  const btnHamburger = document.getElementById('btn-hamburger');
  const mobileMenu = document.getElementById('mobile-menu');
  const mobileNavWorkspace = document.getElementById('mobile-nav-workspace');
  const mobileNavDashboard = document.getElementById('mobile-nav-dashboard');
  const mobileNavDocs = document.getElementById('mobile-nav-docs');

  function closeMobileMenu() {
    if (btnHamburger && mobileMenu) {
      btnHamburger.classList.remove('open');
      mobileMenu.classList.remove('open');
    }
  }

  if (btnHamburger && mobileMenu) {
    btnHamburger.addEventListener('click', () => {
      btnHamburger.classList.toggle('open');
      mobileMenu.classList.toggle('open');
    });
  }

  if (mobileNavWorkspace && mobileNavDashboard && mobileNavDocs) {
    mobileNavWorkspace.addEventListener('click', () => {
      switchPage('workspace');
      closeMobileMenu();
    });
    mobileNavDashboard.addEventListener('click', () => {
      switchPage('dashboard');
      closeMobileMenu();
    });
    mobileNavDocs.addEventListener('click', () => {
      switchPage('docs');
      closeMobileMenu();
    });
  }

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

  const btnGoDashboard = document.getElementById('btn-go-dashboard');
  if (btnGoDashboard) {
    btnGoDashboard.addEventListener('click', () => {
      switchPage('dashboard');
    });
  }

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
  const storedAddress = localStorage.getItem('deposhield_connected_address');
  if (storedAddress) {
    setConnectedWallet(storedAddress);
  }
}

async function connectWallet() {
  const connectedResult = await isConnected();
  if (!connectedResult || !connectedResult.isConnected) {
    showToast('Please install the Freighter wallet extension to use this application.', 'info');
    return;
  }
  try {
    const accessResult = await requestAccess();
    if (accessResult && accessResult.error) {
      throw new Error(accessResult.error);
    }
    if (accessResult && accessResult.address) {
      setConnectedWallet(accessResult.address);
    }
  } catch (err) {
    console.error('Wallet connection rejected:', err);
    showToast('Failed to connect to Freighter wallet.', 'error');
  }
}

function setConnectedWallet(address) {
  userAddress = address;
  localStorage.setItem('deposhield_connected_address', address);
  walletAddress.textContent = `${address.slice(0, 6)}...${address.slice(-6)}`;
  walletInfo.classList.remove('hidden');
  btnConnect.classList.add('hidden');
  
  const workspaceGrid = document.querySelector('#page-workspace .bento-grid');
  if (workspaceGrid) {
    workspaceGrid.classList.add('wallet-connected');
  }

  if (walletBalanceCard) {
    walletBalanceCard.classList.remove('hidden');
    walletBalanceAddress.textContent = `${address.slice(0, 8)}...${address.slice(-8)}`;
  }
  updateWalletBalance();
  loadDashboardEscrows();
  console.log('Wallet connected:', address);
}

function disconnectWallet() {
  userAddress = null;
  localStorage.removeItem('deposhield_connected_address');
  walletInfo.classList.add('hidden');
  btnConnect.classList.remove('hidden');
  
  const workspaceGrid = document.querySelector('#page-workspace .bento-grid');
  if (workspaceGrid) {
    workspaceGrid.classList.remove('wallet-connected');
  }

  if (walletBalanceCard) {
    walletBalanceCard.classList.add('hidden');
    walletBalanceAddress.textContent = '--';
    walletBalanceVal.textContent = '-- XLM';
  }
  loadDashboardEscrows();
  console.log('Wallet disconnected');
}

async function updateWalletBalance() {
  if (!userAddress) {
    if (walletBalanceCard) walletBalanceCard.classList.add('hidden');
    return;
  }
  try {
    const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${userAddress}`);
    if (res.status === 404) {
      walletBalanceVal.textContent = '0.00 XLM';
      return;
    }
    const data = await res.json();
    const native = data.balances.find(b => b.asset_type === 'native');
    if (native) {
      const amount = parseFloat(native.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      walletBalanceVal.textContent = `${amount} XLM`;
    } else {
      walletBalanceVal.textContent = '0.00 XLM';
    }
  } catch (err) {
    console.error('Failed to fetch wallet balance:', err);
    walletBalanceVal.textContent = 'Error loading';
  }
}

// Local Storage Actions
async function loadDashboardEscrows() {
  try {
    const allEscrows = getLocalEscrows();
    
    // Filter to only escrows where the currently connected wallet is a party (tenant, landlord, or arbitrator)
    const escrows = userAddress 
      ? allEscrows.filter(e => e.tenant === userAddress || e.landlord === userAddress || e.arbitrator === userAddress)
      : [];
    
    // Calculate and update Dashboard platform metrics
    let tvl = 0;
    let activeCount = 0;
    let resolvedCount = 0;
    let disputeCount = 0;
    
    escrows.forEach(escrow => {
      const status = escrow.status.toLowerCase();
      const amount = parseFloat(escrow.amount) || 0;
      
      if (status === 'active') {
        activeCount++;
        tvl += amount;
      } else if (status === 'disputed') {
        disputeCount++;
        tvl += amount;
      } else if (status === 'released' || status === 'released (disputed)' || status === 'resolved') {
        resolvedCount++;
      } else if (status === 'created') {
        activeCount++;
      }
    });

    const statTvl = document.getElementById('stat-tvl');
    const statActive = document.getElementById('stat-active');
    const statResolved = document.getElementById('stat-resolved');
    const statDisputes = document.getElementById('stat-disputes');
    
    if (statTvl) statTvl.textContent = `${tvl} XLM`;
    if (statActive) statActive.textContent = activeCount;
    if (statResolved) statResolved.textContent = resolvedCount;
    if (statDisputes) statDisputes.textContent = disputeCount;

    if (!userAddress) {
      dashboardEscrowList.innerHTML = `<div class="dashboard-placeholder">Please connect your wallet to view your active escrows.</div>`;
      return;
    }

    if (escrows.length === 0) {
      dashboardEscrowList.innerHTML = `<div class="dashboard-placeholder">No active escrows registered for this wallet.</div>`;
      return;
    }

    dashboardEscrowList.innerHTML = escrows.map(escrow => `
      <div class="escrow-row" data-lease-id="${escrow.leaseId || ''}">
        <div class="escrow-row-meta">
          <span class="escrow-row-title">${escrow.title}</span>
          <span class="escrow-row-address address-mono text-truncate">${escrow.leaseId ? `Lease ID: ${escrow.leaseId}` : `Contract ID: ${escrow.address}`}</span>
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
        const leaseId = row.getAttribute('data-lease-id');
        switchPage('workspace');
        tabManage.click();
        inputSearchAddress.value = leaseId;
        loadEscrow(leaseId);
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
    showToast('Please connect your Freighter wallet first.', 'error');
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
  const signResult = await signTransaction(tx.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE });
  if (signResult.error) {
    const errorMsg = typeof signResult.error === 'string'
      ? signResult.error
      : (signResult.error.message || signResult.error.error || 'User cancelled transaction signing');
    throw new Error(`Signing rejected or failed: ${errorMsg}`);
  }
  const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, NETWORK_PASSPHRASE);

  // Send
  const submitResult = await rpcServer.sendTransaction(signedTx);
  if (submitResult.status === 'ERROR') {
    throw new Error(`Submit error: ${JSON.stringify(submitResult)}`);
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

  // For native, we use the standard SAC token on Testnet (Native XLM token is CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC)
  const token = tokenSelect === 'native' 
    ? 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC' 
    : 'CD6BLQ43MNALRYGKLCSDPQWKC4SN46LZGRHPNJSJZLDC6H2H3NSO5IZL'; // Mock USDC

  if (!userAddress) {
    showToast('Please connect your Freighter wallet to execute smart contract operations.', 'error');
    return;
  }

  btnSubmitCreate.disabled = true;
  btnSubmitCreate.textContent = 'PROPOSING LEASE INITIALIZATION...';

  try {
    const contractAddress = document.getElementById('input-contract-id').value.trim();
    if (!contractAddress) {
      showToast('Please enter a valid Deployed Contract Address.', 'error');
      btnSubmitCreate.disabled = false;
      btnSubmitCreate.textContent = 'INITIALIZE ESCROW ON-CHAIN';
      return;
    }

    // Generate a unique 16-digit random u64 Lease ID
    const leaseId = BigInt(Math.floor(Math.random() * 9000000000000000) + 1000000000000000);
    const leaseIdStr = leaseId.toString();

    console.log('Initializing contract', contractAddress, 'with Lease ID', leaseIdStr);
    
    // Call contract.initialize(lease_id, tenant, landlord, arbitrator, token, amount)
    const args = [
      nativeToScVal(leaseId, { type: 'u64' }),
      nativeToScVal(userAddress, { type: 'address' }), // tenant
      nativeToScVal(landlord, { type: 'address' }),
      nativeToScVal(arbitrator, { type: 'address' }),
      nativeToScVal(token, { type: 'address' }),
      nativeToScVal(BigInt(amount), { type: 'i128' })
    ];

    await executeTx(contractAddress, 'initialize', args);

    // Save metadata locally
    const escrows = getLocalEscrows();
    const newEscrow = {
      leaseId: leaseIdStr,
      address: contractAddress,
      tenant: userAddress,
      tenantName: tenantName || 'Tenant',
      landlord,
      landlordName: landlordName || 'Landlord',
      arbitrator,
      arbitratorName: 'Delhi Housing Authority',
      amount: `${amount} XLM`,
      status: 'Created',
      title,
      description: desc,
      history: [
        { timestamp: new Date().toISOString(), event: 'Escrow Created & Initialized' }
      ]
    };
    escrows.push(newEscrow);
    saveLocalEscrows(escrows);

    // Notify backend
    try {
      await fetch(`${BACKEND_URL}/api/escrows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEscrow)
      });
    } catch (e) {
      console.warn('Backend notification failed:', e);
    }

    showToast(`Escrow initialized successfully! Lease ID: ${leaseIdStr}`, 'success');
    formCreate.reset();
    loadDashboardEscrows();
    loadEscrow(leaseIdStr);
    updateWalletBalance();
  } catch (err) {
    console.error('Escrow initialization failed:', err);
    showToast(`Failed to initialize escrow: ${getErrorMessage(err)}`, 'error');
  } finally {
    btnSubmitCreate.disabled = false;
    btnSubmitCreate.textContent = 'INITIALIZE ESCROW ON-CHAIN';
  }
}

async function loadEscrow(address) {
  activeEscrowAddress = address; // Storing Lease ID string in activeEscrowAddress
  activeEscrowDetailsPanel.classList.add('hidden');
  
  const manageErrorContainer = document.getElementById('manage-error-container');
  if (manageErrorContainer) {
    manageErrorContainer.classList.add('hidden');
  }

  try {
    const leaseId = BigInt(address);
    const leaseIdVal = nativeToScVal(leaseId, { type: 'u64' });

    // 1. Fetch metadata from local storage
    const escrows = getLocalEscrows();
    let metadata = escrows.find(e => e.leaseId === address);
    if (!metadata) {
      metadata = {
        tenantName: 'Tenant',
        landlordName: 'Landlord',
        arbitratorName: 'Delhi Housing Authority',
        title: 'Rental Escrow',
        description: 'Security deposit'
      };
    }

    const contractId = 'CAEU7RHIOMDWODUF7VVFVXPDE7PKO4HY7ERT7KKFN3MBTUW2JAWVUM6X';

    // 2. Fetch state on-chain via simulation
    const tenantAddr = await simulateCall(contractId, 'get_tenant', [leaseIdVal]);
    const landlordAddr = await simulateCall(contractId, 'get_landlord', [leaseIdVal]);
    const arbitratorAddr = await simulateCall(contractId, 'get_arbitrator', [leaseIdVal]);
    const amountVal = Number(await simulateCall(contractId, 'get_amount', [leaseIdVal]));
    const isFunded = await simulateCall(contractId, 'is_funded', [leaseIdVal]);
    const status = await simulateCall(contractId, 'get_status', [leaseIdVal]); // 0=Created, 1=Active, 2=Disputed, 3=Released

    // Fetch proposals
    let tenantProposalVal = null;
    let landlordProposalVal = null;
    try {
      tenantProposalVal = await simulateCall(contractId, 'get_proposal', [
        leaseIdVal,
        nativeToScVal(tenantAddr, { type: 'address' })
      ]);
    } catch (e) {
      console.warn('Failed to fetch tenant proposal:', e);
    }
    try {
      landlordProposalVal = await simulateCall(contractId, 'get_proposal', [
        leaseIdVal,
        nativeToScVal(landlordAddr, { type: 'address' })
      ]);
    } catch (e) {
      console.warn('Failed to fetch landlord proposal:', e);
    }

    // Update state
    activeEscrowDetails = {
      leaseId: address,
      address: contractId,
      tenant: tenantAddr,
      landlord: landlordAddr,
      arbitrator: arbitratorAddr,
      amount: amountVal,
      isFunded,
      status,
      tenantName: metadata.tenantName,
      landlordName: metadata.landlordName,
      title: metadata.title,
      description: metadata.description,
      tenantProposal: tenantProposalVal,
      landlordProposal: landlordProposalVal
    };

    // Update UI Elements
    detailTitle.textContent = activeEscrowDetails.title;
    detailDesc.textContent = activeEscrowDetails.description;
    detailTenant.textContent = `${tenantAddr.slice(0, 8)}...${tenantAddr.slice(-6)}`;
    detailTenantName.textContent = activeEscrowDetails.tenantName;
    detailLandlord.textContent = `${landlordAddr.slice(0, 8)}...${landlordAddr.slice(-6)}`;
    detailLandlordName.textContent = activeEscrowDetails.landlordName;
    detailAmount.textContent = `${amountVal} XLM`;
    detailContractAddress.textContent = `${contractId.slice(0, 10)}...${contractId.slice(-8)}`;

    const detailLeaseId = document.getElementById('detail-lease-id');
    if (detailLeaseId) {
      detailLeaseId.textContent = address;
    }

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
    
    // Display premium inline error block instead of raw alert dialog
    if (manageErrorContainer) {
      const manageErrorAddr = document.getElementById('manage-error-address');
      const manageErrorMsg = document.getElementById('manage-error-msg');
      if (manageErrorAddr) {
        manageErrorAddr.textContent = `Lease ID: ${address}`;
      }
      if (manageErrorMsg) {
        manageErrorMsg.textContent = getErrorMessage(err);
      }
      manageErrorContainer.classList.remove('hidden');
    } else {
      showToast(`Failed to load escrow from Soroban chain: ${getErrorMessage(err)}. Ensure it is initialized.`, 'error');
    }
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

    // Handle proposals display and submission lock
    const banner = document.getElementById('proposal-status-banner');
    const submitBtn = document.getElementById('btn-propose-split');
    const slider = document.getElementById('range-split');

    if (banner && submitBtn && slider) {
      banner.classList.add('hidden');
      banner.className = 'info-banner';
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
      submitBtn.textContent = 'SUBMIT RELEASE PROPOSAL';
      slider.disabled = false;

      const tenantProposal = activeEscrowDetails.tenantProposal;
      const landlordProposal = activeEscrowDetails.landlordProposal;

      const hasTenantProposed = !!tenantProposal;
      const hasLandlordProposed = !!landlordProposal;

      let tenantText = '';
      if (hasTenantProposed) {
        const tAmt = Number(tenantProposal[0]);
        const lAmt = Number(tenantProposal[1]);
        tenantText = `Tenant proposed: Tenant ${tAmt} XLM / Landlord ${lAmt} XLM`;
      }

      let landlordText = '';
      if (hasLandlordProposed) {
        const tAmt = Number(landlordProposal[0]);
        const lAmt = Number(landlordProposal[1]);
        landlordText = `Landlord proposed: Tenant ${tAmt} XLM / Landlord ${lAmt} XLM`;
      }

      const isCurrentUserTenant = userAddress === activeEscrowDetails.tenant;
      const isCurrentUserLandlord = userAddress === activeEscrowDetails.landlord;

      const hasCurrentUserProposed = (isCurrentUserTenant && hasTenantProposed) || (isCurrentUserLandlord && hasLandlordProposed);
      const hasOtherPartyProposed = (isCurrentUserTenant && hasLandlordProposed) || (isCurrentUserLandlord && hasTenantProposed);

      if (hasTenantProposed || hasLandlordProposed) {
        banner.classList.remove('hidden');
        
        let message = '';
        if (hasTenantProposed && hasLandlordProposed) {
          // Both proposed but they didn't match (otherwise status would be 3)
          message = `<strong>⚠️ Proposals Conflict:</strong><br>${tenantText}<br>${landlordText}<br><span style="margin-top:0.35rem; display:block; font-size:0.75rem; color:var(--text-secondary);">If you cannot reach an agreement, click RAISE DISPUTE below to involve Delhi Housing Authority.</span>`;
          banner.className = 'info-banner error';
          
          // Disable both since both already proposed
          submitBtn.disabled = true;
          submitBtn.style.opacity = '0.5';
          submitBtn.textContent = 'PROPOSAL SUBMITTED';
          slider.disabled = true;
        } else if (hasCurrentUserProposed) {
          // Only current user proposed
          const currentProposal = isCurrentUserTenant ? tenantProposal : landlordProposal;
          const tAmt = Number(currentProposal[0]);
          const lAmt = Number(currentProposal[1]);
          message = `<strong>ℹ️ Waiting for other party:</strong> You proposed: Tenant ${tAmt} XLM / Landlord ${lAmt} XLM. Waiting for matching proposal from ${isCurrentUserTenant ? 'Landlord' : 'Tenant'}.`;
          banner.className = 'info-banner warning';
          
          submitBtn.disabled = true;
          submitBtn.style.opacity = '0.5';
          submitBtn.textContent = 'WAITING FOR MATCH';
          slider.disabled = true;
        } else if (hasOtherPartyProposed) {
          // Other party proposed, current user has NOT proposed
          const otherProposal = isCurrentUserTenant ? landlordProposal : tenantProposal;
          const tAmt = Number(otherProposal[0]);
          const lAmt = Number(otherProposal[1]);
          message = `<strong>💡 Offer Received:</strong> ${isCurrentUserTenant ? 'Landlord' : 'Tenant'} proposed a split:<br><strong>Tenant ${tAmt} XLM / Landlord ${lAmt} XLM</strong>.<br><span style="margin-top:0.35rem; display:block; font-size:0.75rem; color:var(--text-secondary);">Drag your slider to match this split and click submit to release instantly.</span>`;
          banner.className = 'info-banner success';
          
          // Set slider to match automatically to help user!
          slider.value = tAmt.toString();
          document.getElementById('lbl-split-tenant').textContent = `${tAmt} XLM`;
          document.getElementById('lbl-split-landlord').textContent = `${activeEscrowDetails.amount - tAmt} XLM`;
        }
        
        banner.innerHTML = `<div style="text-align: left; font-size: 0.85rem; line-height: 1.5; width: 100%;">${message}</div>`;
      }
    }
  } else if (status === 2) {
    detailStatusBadge.textContent = 'DISPUTED';
    detailStatusBadge.className = 'badge-status status-disputed';
    actionsDisputed.classList.remove('hidden');

    // Load dispute reason
    const leaseId = BigInt(activeEscrowAddress);
    simulateCall(activeEscrowDetails.address, 'get_dispute_reason', [nativeToScVal(leaseId, { type: 'u64' })]).then(reason => {
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
    const leaseId = BigInt(activeEscrowAddress);
    // Call contract.fund(lease_id)
    await executeTx(activeEscrowDetails.address, 'fund', [nativeToScVal(leaseId, { type: 'u64' })]);

    // Update local database status
    const escrows = getLocalEscrows();
    const escrow = escrows.find(e => e.leaseId === activeEscrowAddress);
    if (escrow) {
      escrow.status = 'Active';
      escrow.history.push({ timestamp: new Date().toISOString(), event: 'Escrow Funded' });
      saveLocalEscrows(escrows);
    }

    // Notify backend
    try {
      await fetch(`${BACKEND_URL}/api/escrows/${activeEscrowAddress}/fund`, { method: 'POST' });
    } catch (e) {
      console.warn('Backend notification failed:', e);
    }

    showToast('Escrow funded successfully on-chain! Funds locked in smart contract.', 'success');
    loadEscrow(activeEscrowAddress);
    loadDashboardEscrows();
    updateWalletBalance();
  } catch (err) {
    console.error('Funding failed:', err);
    showToast(`Funding transaction failed: ${getErrorMessage(err)}`, 'error');
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
    const leaseId = BigInt(activeEscrowAddress);
    const leaseIdVal = nativeToScVal(leaseId, { type: 'u64' });

    // Call propose_release(lease_id, caller, tenant_amount, landlord_amount)
    const args = [
      leaseIdVal,
      nativeToScVal(userAddress, { type: 'address' }),
      nativeToScVal(BigInt(tenantAmount), { type: 'i128' }),
      nativeToScVal(BigInt(landlordAmount), { type: 'i128' })
    ];

    await executeTx(activeEscrowDetails.address, 'propose_release', args);

    // Get contract status after call to see if it triggered matching split release
    const currentStatus = await simulateCall(activeEscrowDetails.address, 'get_status', [leaseIdVal]);
    
    const escrows = getLocalEscrows();
    const escrow = escrows.find(e => e.leaseId === activeEscrowAddress);
    if (escrow) {
      if (currentStatus === 3) {
        escrow.status = 'Released';
        escrow.history.push({ 
          timestamp: new Date().toISOString(), 
          event: `Escrow Released! (Tenant: ${tenantAmount} XLM, Landlord: ${landlordAmount} XLM)` 
        });
        showToast('Agreement reached! Splits match. Escrow released successfully!', 'success');

        // Notify backend release
        try {
          await fetch(`${BACKEND_URL}/api/escrows/${activeEscrowAddress}/release`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tenantAmount, landlordAmount })
          });
        } catch (e) {
          console.warn('Backend notification failed:', e);
        }
      } else {
        const callerRole = userAddress === escrow.tenant ? 'Tenant' : 'Landlord';
        escrow.history.push({ 
          timestamp: new Date().toISOString(), 
          event: `${callerRole} proposed release split: Tenant: ${tenantAmount} XLM, Landlord: ${landlordAmount} XLM` 
        });
        showToast(`Split proposal submitted! Waiting for matching proposal from the other party.`, 'info');

        // Notify backend propose
        try {
          await fetch(`${BACKEND_URL}/api/escrows/${activeEscrowAddress}/propose`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caller: userAddress, tenantAmount, landlordAmount })
          });
        } catch (e) {
          console.warn('Backend notification failed:', e);
        }
      }
      saveLocalEscrows(escrows);
    }

    loadEscrow(activeEscrowAddress);
    loadDashboardEscrows();
    updateWalletBalance();
  } catch (err) {
    console.error('Proposal split failed:', err);
    showToast(`Transaction failed: ${getErrorMessage(err)}`, 'error');
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
    const leaseId = BigInt(activeEscrowAddress);
    // Call contract.dispute(lease_id, caller, reason)
    const args = [
      nativeToScVal(leaseId, { type: 'u64' }),
      nativeToScVal(userAddress, { type: 'address' }),
      nativeToScVal(reason, { type: 'string' })
    ];

    await executeTx(activeEscrowDetails.address, 'dispute', args);

    // Update local database status
    const escrows = getLocalEscrows();
    const escrow = escrows.find(e => e.leaseId === activeEscrowAddress);
    if (escrow) {
      const callerRole = userAddress === escrow.tenant ? 'Tenant' : 'Landlord';
      escrow.status = 'Disputed';
      escrow.history.push({ 
        timestamp: new Date().toISOString(), 
        event: `Dispute declared by ${callerRole}. Reason: "${reason}"` 
      });
      saveLocalEscrows(escrows);
    }

    // Notify backend
    try {
      await fetch(`${BACKEND_URL}/api/escrows/${activeEscrowAddress}/dispute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caller: userAddress, reason })
      });
    } catch (e) {
      console.warn('Backend notification failed:', e);
    }

    showToast('Dispute successfully declared on-chain. Arbitrator has been notified.', 'success');
    inputDisputeReason.value = '';
    loadEscrow(activeEscrowAddress);
    loadDashboardEscrows();
  } catch (err) {
    console.error('Dispute failed:', err);
    showToast(`Dispute transaction failed: ${getErrorMessage(err)}`, 'error');
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
    const leaseId = BigInt(activeEscrowAddress);
    // Call contract.resolve_dispute(lease_id, tenant_amount, landlord_amount)
    const args = [
      nativeToScVal(leaseId, { type: 'u64' }),
      nativeToScVal(BigInt(tenantAmount), { type: 'i128' }),
      nativeToScVal(BigInt(landlordAmount), { type: 'i128' })
    ];

    await executeTx(activeEscrowDetails.address, 'resolve_dispute', args);

    // Update local database status
    const escrows = getLocalEscrows();
    const escrow = escrows.find(e => e.leaseId === activeEscrowAddress);
    if (escrow) {
      escrow.status = 'Released (Disputed)';
      escrow.history.push({ 
        timestamp: new Date().toISOString(), 
        event: `Dispute resolved by Arbitrator! (Tenant: ${tenantAmount} XLM, Landlord: ${landlordAmount} XLM)` 
      });
      saveLocalEscrows(escrows);
    }

    // Notify backend
    try {
      await fetch(`${BACKEND_URL}/api/escrows/${activeEscrowAddress}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantAmount, landlordAmount })
      });
    } catch (e) {
      console.warn('Backend notification failed:', e);
    }

    showToast('Dispute resolved by arbitrator. Funds distributed!', 'success');
    loadEscrow(activeEscrowAddress);
    loadDashboardEscrows();
    updateWalletBalance();
  } catch (err) {
    console.error('Resolution failed:', err);
    showToast(`Resolution transaction failed: ${getErrorMessage(err)}`, 'error');
  } finally {
    btnResolveDispute.disabled = false;
    btnResolveDispute.textContent = originalText;
  }
}

// Mobile Overflow Detection Script (Temporarily added for debugging)
window.addEventListener('load', () => {
  setTimeout(() => {
    const targetWidth = 375;
    const docWidth = document.documentElement.clientWidth;
    console.log('Document ClientWidth:', docWidth);
    const elements = document.querySelectorAll('*');
    const overflowing375 = [];
    const overflowingDoc = [];
    elements.forEach(el => {
      const rect = el.getBoundingClientRect();
      const info = {
        tagName: el.tagName,
        classList: Array.from(el.classList),
        id: el.id,
        rectRight: rect.right,
        offsetWidth: el.offsetWidth,
        scrollWidth: el.scrollWidth
      };
      if (rect.right > targetWidth) {
        overflowing375.push(info);
      }
      if (rect.right > docWidth) {
        overflowingDoc.push(info);
      }
    });
    console.log('OVERFLOW_375:', JSON.stringify(overflowing375));
    console.log('OVERFLOW_DOC:', JSON.stringify(overflowingDoc));
  }, 1000);
});

// Safely parses error strings/objects to avoid showing raw [object Object] errors in UI
function getErrorMessage(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err.error && typeof err.error === 'string') return err.error;
  if (err.message && typeof err.message === 'string') return err.message;
  if (err.message) return String(err.message);
  try {
    const str = JSON.stringify(err);
    if (str === '{}') return String(err);
    return str;
  } catch (e) {
    return String(err);
  }
}

// Helper to display Web3-style premium toast notifications
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconSVG = '';
  if (type === 'success') {
    iconSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  } else if (type === 'error') {
    iconSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
  } else {
    iconSVG = `<svg viewBox="0 0 24 24" fill="none" stroke="var(--color-info)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  }
  
  toast.innerHTML = `
    <span class="toast-icon">${iconSVG}</span>
    <span class="toast-message">${message}</span>
  `;
  
  container.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);
  
  // Remove after 4 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

