/* global BigInt */
import React, { useState, useEffect, useCallback } from 'react';
import { isConnected, requestAccess, signTransaction } from '@stellar/freighter-api';
import { 
  Contract, 
  TransactionBuilder, 
  Networks, 
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  Account
} from '@stellar/stellar-sdk';
import { Server } from '@stellar/stellar-sdk/rpc';
import { Buffer } from 'buffer';

// Polyfill Buffer for Webpack 5 in React environment
if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || Buffer;
}

// Config
const RPC_URL = 'https://soroban-testnet.stellar.org:443';
const NETWORK_PASSPHRASE = Networks.TESTNET;
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000'
  : '';
const DEFAULT_CONTRACT_ID = 'CBFMZXLLIW2JUUWOC4ZQEJWRQCIGJEY34SHCVUDVIZ7NFVONF3G63LO6';

// Formatting & Privacy Helpers
const formatXlmAmount = (val) => {
  const num = Number(val);
  if (isNaN(num)) return '0';
  let str = num.toFixed(7);
  str = str.replace(/\.?0+$/, '');
  return str;
};

const formatDateTime = (val) => {
  if (!val) return '';
  const date = val instanceof Date ? val : new Date(val);
  if (isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}, ${date.toLocaleTimeString()}`;
};

const getSpoileredLeaseId = (leaseIdStr) => {
  if (!leaseIdStr) return '';
  const str = String(leaseIdStr);
  if (str.length < 8) return str;
  return `${str.slice(0, 4)}********${str.slice(-4)}`;
};

const fnv1a64 = (str) => {
  let hash = 14695981039346656037n; // FNV offset basis
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    hash ^= BigInt(s.charCodeAt(i));
    hash = (hash * 1099511628211n) & 0xffffffffffffffffn; // FNV prime & mask to 64-bit
  }
  return hash;
};

const PREDEFINED_DURATIONS = [
  30,          // 30 seconds (for testing)
  300,         // 5 minutes
  3600,        // 1 hour
  86400,       // 1 day
  604800,      // 1 week
  2592000,     // 1 month (30 days)
  15552000,    // 6 months
  31104000     // 1 year (360 days)
];

const PREDEFINED_DURATION_LABELS = [
  '30 Seconds (Test)',
  '5 Minutes',
  '1 Hour',
  '1 Day',
  '1 Week',
  '1 Month',
  '6 Months',
  '1 Year'
];

const rpcServer = new Server(RPC_URL);

// Helper for local storage database
const getLocalEscrows = () => {
  try {
    const data = localStorage.getItem('deposhield_escrows');
    if (!data) {
      localStorage.setItem('deposhield_escrows', JSON.stringify([]));
      return [];
    }
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

const saveLocalEscrows = (escrows) => {
  try {
    localStorage.setItem('deposhield_escrows', JSON.stringify(Array.isArray(escrows) ? escrows : []));
  } catch (e) {
    console.error('Failed to save escrows to local storage:', e);
  }
};

function App() {
  // Navigation & Theme State
  const [activePage, setActivePage] = useState('workspace');
  const [activeTab, setActiveTab] = useState('create');
  const [theme, setTheme] = useState('dark');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Wallet State
  const [userAddress, setUserAddress] = useState(null);
  const [walletBalance, setWalletBalance] = useState('-- XLM');

  // Search & Manage State
  const [searchLeaseId, setSearchLeaseId] = useState('');
  const [activeEscrowDetails, setActiveEscrowDetails] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);
  const [disputeReasonInput, setDisputeReasonInput] = useState('');
  const [landlordDisputeReason, setLandlordDisputeReason] = useState('');
  const [showDisputeReasonError, setShowDisputeReasonError] = useState(false);

  // Split sliders
  const [rangeSplitVal, setRangeSplitVal] = useState(0);
  const [rangeArbVal, setRangeArbVal] = useState(0);

  // Form State
  const [createFormData, setCreateFormData] = useState({
    title: '',
    desc: '',
    tenant: '',
    arbitrator: '',
    amount: '',
    token: 'native',
    tenantName: '',
    landlordName: ''
  });

  // Time-lock State
  const [unlockDateTime, setUnlockDateTime] = useState('');
  const [lockDurationSeconds, setLockDurationSeconds] = useState(30); // Default to 30s
  const [quickDurationIndex, setQuickDurationIndex] = useState(0); // Index 0 (30s)

  // Synchronizers
  const syncFromDuration = useCallback((seconds) => {
    const secs = Number(seconds) || 0;
    setLockDurationSeconds(secs);
    
    // Calculate unlock date-time
    const targetTime = Date.now() + secs * 1000;
    // Format to local date-time string YYYY-MM-DDTHH:MM
    const dateObj = new Date(targetTime);
    const tzOffset = dateObj.getTimezoneOffset() * 60000; // offset in milliseconds
    const localISOTime = (new Date(targetTime - tzOffset)).toISOString().slice(0, 16);
    setUnlockDateTime(localISOTime);

    // Find closest index in predefined durations
    let closestIndex = 0;
    let minDiff = Infinity;
    PREDEFINED_DURATIONS.forEach((d, idx) => {
      const diff = Math.abs(d - secs);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = idx;
      }
    });
    setQuickDurationIndex(closestIndex);
  }, []);

  const syncFromDateTime = useCallback((dateTimeStr) => {
    if (!dateTimeStr) return;
    setUnlockDateTime(dateTimeStr);
    const selectMs = new Date(dateTimeStr).getTime();
    const seconds = Math.max(0, Math.floor((selectMs - Date.now()) / 1000));
    setLockDurationSeconds(seconds);

    // Find closest index in predefined durations
    let closestIndex = 0;
    let minDiff = Infinity;
    PREDEFINED_DURATIONS.forEach((d, idx) => {
      const diff = Math.abs(d - seconds);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = idx;
      }
    });
    setQuickDurationIndex(closestIndex);
  }, []);

  const syncFromSlider = useCallback((index) => {
    const idx = Number(index);
    setQuickDurationIndex(idx);
    const seconds = PREDEFINED_DURATIONS[idx];
    syncFromDuration(seconds);
  }, [syncFromDuration]);

  // Initial Sync on Mount
  useEffect(() => {
    if (activeTab === 'create' && !unlockDateTime) {
      syncFromDuration(30); // Default to 30 seconds
    }
  }, [activeTab, unlockDateTime, syncFromDuration]);

  // Action Buttons Loading State
  const [isCreating, setIsCreating] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  const [isProposing, setIsProposing] = useState(false);
  const [isRaisingDispute, setIsRaisingDispute] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  // Dashboard & Metrics State
  const [dashboardEscrows, setDashboardEscrows] = useState([]);
  const [metrics, setMetrics] = useState({
    tvl: 0,
    activeCount: 0,
    resolvedCount: 0,
    disputeCount: 0
  });

  // Toast notifications State
  const [toasts, setToasts] = useState([]);

  // Toast Notification Helper
  const showToast = useCallback((message, type = 'success', txHash = null) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, txHash }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  // Theme Sync on Mount
  useEffect(() => {
    const currentTheme = localStorage.getItem('deposhield_theme') || 'dark';
    setTheme(currentTheme);
    if (currentTheme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
  }, []);

  const handleToggleTheme = () => {
    const isLight = document.body.classList.toggle('light-theme');
    const newTheme = isLight ? 'light' : 'dark';
    localStorage.setItem('deposhield_theme', newTheme);
    setTheme(newTheme);
  };

  // Wallet Connection helper
  const updateWalletBalance = useCallback(async (address) => {
    if (!address) {
      setWalletBalance('-- XLM');
      return;
    }
    try {
      const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`);
      if (res.status === 404) {
        setWalletBalance('0.00 XLM');
        return;
      }
      const data = await res.json();
      const native = data.balances.find(b => b.asset_type === 'native');
      if (native) {
        const amount = parseFloat(native.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        setWalletBalance(`${amount} XLM`);
      } else {
        setWalletBalance('0.00 XLM');
      }
    } catch (err) {
      console.error('Failed to fetch wallet balance:', err);
      setWalletBalance('Error loading');
    }
  }, []);

  const handleConnectWallet = useCallback(async () => {
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
        const address = accessResult.address;
        setUserAddress(address);
        localStorage.setItem('deposhield_connected_address', address);
        showToast('Wallet connected successfully!', 'success');
        updateWalletBalance(address);
      }
    } catch (err) {
      console.error('Wallet connection rejected:', err);
      showToast('Failed to connect to Freighter wallet.', 'error');
    }
  }, [showToast, updateWalletBalance]);

  const handleDisconnectWallet = useCallback(() => {
    setUserAddress(null);
    setWalletBalance('-- XLM');
    localStorage.removeItem('deposhield_connected_address');
    showToast('Wallet disconnected', 'info');
  }, [showToast]);

  // Load wallet on mount
  useEffect(() => {
    const storedAddress = localStorage.getItem('deposhield_connected_address');
    if (storedAddress) {
      setUserAddress(storedAddress);
      updateWalletBalance(storedAddress);
    }
  }, [updateWalletBalance]);

  // Load Dashboard Data
  const loadDashboardEscrows = useCallback(async () => {
    try {
      let allEscrows = [];
      try {
        const response = await fetch(`${BACKEND_URL}/api/escrows`);
        if (response.ok) {
          allEscrows = await response.json();
        } else {
          allEscrows = getLocalEscrows();
        }
      } catch (apiErr) {
        console.warn('Failed to fetch escrows from API, fallback to local storage:', apiErr);
        allEscrows = getLocalEscrows();
      }

      // Fetch on-chain events to populate missing transaction hashes
      let eventTxMap = {}; // key: leaseId -> Array of events
      try {
        const latestLedger = await rpcServer.getLatestLedger();
        const startLedger = Math.max(1, latestLedger.sequence - 10000);
        const eventsResponse = await rpcServer.getEvents({
          startLedger,
          filters: [
            {
              type: 'contract',
              id: DEFAULT_CONTRACT_ID
            }
          ]
        });
        
        const rawEvents = eventsResponse.events || [];
        rawEvents.forEach(evt => {
          const actualTxHash = evt.txHash || evt.transactionHash;
          if (!evt.topic || !actualTxHash) return;
          const eventName = evt.topic[0] ? scValToNative(evt.topic[0]) : '';
          if (!eventName) return;
          
          let matchedLeaseId = null;
          try {
            if (eventName === 'init') {
              const spoileredId = scValToNative(evt.value);
              const match = allEscrows.find(e => getSpoileredLeaseId(e.leaseId) === spoileredId);
              if (match) matchedLeaseId = match.leaseId;
            } else if (evt.topic[1]) {
              const rawIdVal = scValToNative(evt.topic[1]);
              const match = allEscrows.find(e => fnv1a64(e.leaseId).toString() === rawIdVal.toString());
              if (match) matchedLeaseId = match.leaseId;
            }
          } catch (e) {}
          
          if (matchedLeaseId) {
            if (!eventTxMap[matchedLeaseId]) {
              eventTxMap[matchedLeaseId] = [];
            }
            
            const matchedEscrow = allEscrows.find(e => e.leaseId === matchedLeaseId);
            let callerRole = '';
            if (eventName === 'init') {
              callerRole = 'Landlord';
            } else if (eventName === 'funded') {
              callerRole = 'Tenant';
            } else if (eventName === 'proposed' || eventName === 'disputed') {
              try {
                const callerAddr = scValToNative(evt.topic[2]);
                if (matchedEscrow) {
                  callerRole = (callerAddr === matchedEscrow.tenant) ? 'Tenant' : 'Landlord';
                }
              } catch (e) {}
            } else if (eventName === 'released') {
              try {
                const typeSym = scValToNative(evt.topic[2]);
                if (typeSym === 'dispute') {
                  callerRole = 'Arbitrator';
                }
              } catch (e) {}
            }
            
            eventTxMap[matchedLeaseId].push({
              eventName,
              txHash: actualTxHash,
              timestamp: evt.ledgerClosedAt || new Date().toISOString(),
              callerRole
            });
          }
        });
      } catch (evtErr) {
        console.warn('Failed to fetch events from Soroban RPC:', evtErr);
      }
      
      const escrows = (userAddress 
        ? allEscrows.filter(e => e.tenant === userAddress || e.landlord === userAddress || e.arbitrator === userAddress)
        : []).map(escrow => {
          const leaseEvents = eventTxMap[escrow.leaseId] || [];
          // Sort chronologically
          leaseEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

          // Reconstruct mutual release caller role if empty
          leaseEvents.forEach((le, idx) => {
            if (le.eventName === 'released' && !le.callerRole) {
              const firstProposer = leaseEvents.find(e => e.eventName === 'proposed');
              if (firstProposer) {
                le.callerRole = firstProposer.callerRole === 'Tenant' ? 'Landlord' : 'Tenant';
              } else {
                le.callerRole = 'Tenant'; // fallback
              }
            }
          });
 
          if (escrow.history) {
            let consumedIndices = new Set();
            const updatedHistory = escrow.history.map(hist => {
              if (hist.txHash) return hist;
              
              let matchedHash = null;
              let matchedRole = null;
              const eventStr = hist.event.toLowerCase();
              
              for (let i = 0; i < leaseEvents.length; i++) {
                if (consumedIndices.has(i)) continue;
                
                const le = leaseEvents[i];
                const leName = le.eventName.toLowerCase();
                let isMatch = false;
                
                if ((eventStr.includes('created') || eventStr.includes('initialized')) && leName === 'init') {
                  isMatch = true;
                } else if (eventStr.includes('funded') && leName === 'funded') {
                  isMatch = true;
                } else if (eventStr.includes('proposed') && leName === 'proposed') {
                  isMatch = true;
                } else if ((eventStr.includes('dispute declared') || eventStr.includes('disputed') || eventStr.includes('automatically transitioned to disputed') || eventStr.includes('splits conflict')) && leName === 'disputed') {
                  isMatch = true;
                } else if ((eventStr.includes('released') || eventStr.includes('dispute resolved')) && leName === 'released') {
                  isMatch = true;
                }
                
                if (isMatch) {
                  matchedHash = le.txHash;
                  matchedRole = le.callerRole;
                  consumedIndices.add(i);
                  break;
                }
              }
              
              return { 
                ...hist, 
                txHash: matchedHash || hist.txHash,
                callerRole: matchedRole || hist.callerRole
              };
            });
            return { ...escrow, history: updatedHistory };
          }
          return escrow;
        });
      
      setDashboardEscrows(escrows);

      // Compute metrics
      let tvl = 0;
      let activeCount = 0;
      let resolvedCount = 0;
      let disputeCount = 0;

      escrows.forEach(escrow => {
        const status = String(escrow.status || '').toLowerCase();
        const amount = parseFloat(escrow.amount) || 0;
        
        if (status === 'active' || status === '1') {
          activeCount++;
          tvl += amount;
        } else if (status === 'disputed' || status === '2') {
          disputeCount++;
          tvl += amount;
        } else if (status === 'released' || status === 'released (disputed)' || status === 'resolved' || status === '3') {
          resolvedCount++;
        } else if (status === 'created' || status === '0') {
          activeCount++;
        }
      });

      setMetrics({
        tvl,
        activeCount,
        resolvedCount,
        disputeCount
      });
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    }
  }, [userAddress]);

  useEffect(() => {
    loadDashboardEscrows();
    const balanceInterval = setInterval(() => {
      if (userAddress) updateWalletBalance(userAddress);
    }, 10000);

    const dashboardInterval = setInterval(() => {
      loadDashboardEscrows();
    }, 8000);

    return () => {
      clearInterval(balanceInterval);
      clearInterval(dashboardInterval);
    };
  }, [userAddress, loadDashboardEscrows, updateWalletBalance]);

  // Soroban Helper Methods
  const simulateCall = async (contractId, method, args = []) => {
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
  };

  const waitTx = async (hash) => {
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
  };

  const executeTx = async (contractId, method, args = []) => {
    if (!userAddress) {
      showToast('Please connect your Freighter wallet first.', 'error');
      throw new Error('Wallet not connected');
    }

    const sourceAccount = await rpcServer.getAccount(userAddress);
    const contract = new Contract(contractId);

    let tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

    tx = await rpcServer.prepareTransaction(tx);

    const signResult = await signTransaction(tx.toXDR(), { networkPassphrase: NETWORK_PASSPHRASE });
    if (signResult.error) {
      const errorMsg = typeof signResult.error === 'string'
        ? signResult.error
        : (signResult.error.message || signResult.error.error || 'User cancelled transaction signing');
      throw new Error(`Signing rejected or failed: ${errorMsg}`);
    }
    const signedTx = TransactionBuilder.fromXDR(signResult.signedTxXdr, NETWORK_PASSPHRASE);

    const submitResult = await rpcServer.sendTransaction(signedTx);
    if (submitResult.status === 'ERROR') {
      throw new Error(`Submit error: ${JSON.stringify(submitResult)}`);
    }

    console.log('Transaction submitted. Hash:', submitResult.hash);
    const txResult = await waitTx(submitResult.hash);
    return { hash: submitResult.hash, ...txResult };
  };

  // Safe error parser
  const getErrorMessage = (err) => {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    if (err.error && typeof err.error === 'string') return err.error;
    if (err.message && typeof err.message === 'string') return err.message;
    try {
      const str = JSON.stringify(err);
      if (str === '{}') return String(err);
      return str;
    } catch (e) {
      return String(err);
    }
  };

  // Load Escrow Detail Logic
  const handleLoadEscrow = async (idStr) => {
    if (!idStr) return;
    setActiveEscrowDetails(null);
    setErrorDetails(null);
    setLandlordDisputeReason('');
    setShowDisputeReasonError(false);

    try {
      const leaseId = fnv1a64(idStr);
      const leaseIdVal = nativeToScVal(leaseId, { type: 'u64' });

      // Try to fetch from backend API first
      let metadata = null;
      try {
        const response = await fetch(`${BACKEND_URL}/api/escrows/${idStr}`);
        if (response.ok) {
          metadata = await response.json();
        }
      } catch (err) {
        console.warn('Failed to fetch escrow metadata from backend:', err);
      }

      // If backend call failed or not found, fall back to local storage
      if (!metadata) {
        const escrows = getLocalEscrows();
        metadata = escrows.find(e => e.leaseId === idStr);
      }

      // If still not found, use defaults
      if (!metadata) {
        metadata = {
          tenantName: 'Tenant',
          landlordName: 'Landlord',
          arbitratorName: 'Delhi Housing Authority',
          title: 'Rental Escrow',
          description: 'Security deposit'
        };
      }

      const contractId = DEFAULT_CONTRACT_ID;

      // Parallel simulated RPC calls
      const [tenantAddr, landlordAddr, arbitratorAddr, amountValRaw, isFunded, statusRaw, unlockTimeRaw] = await Promise.all([
        simulateCall(contractId, 'get_tenant', [leaseIdVal]),
        simulateCall(contractId, 'get_landlord', [leaseIdVal]),
        simulateCall(contractId, 'get_arbitrator', [leaseIdVal]),
        simulateCall(contractId, 'get_amount', [leaseIdVal]),
        simulateCall(contractId, 'is_funded', [leaseIdVal]),
        simulateCall(contractId, 'get_status', [leaseIdVal]),
        simulateCall(contractId, 'get_unlock_time', [leaseIdVal])
      ]);

      const amountVal = Number(amountValRaw) / 10_000_000;
      const status = Number(statusRaw); // 0=Created, 1=Active, 2=Disputed, 3=Released
      const unlockTime = Number(unlockTimeRaw);

      // Fetch proposals
      let tenantProposal = null;
      let landlordProposal = null;
      try {
        const rawTenantProposal = await simulateCall(contractId, 'get_proposal', [
          leaseIdVal,
          nativeToScVal(tenantAddr, { type: 'address' })
        ]);
        if (rawTenantProposal) {
          tenantProposal = [
            Number(rawTenantProposal[0]) / 10_000_000,
            Number(rawTenantProposal[1]) / 10_000_000
          ];
        }
      } catch (e) {
        console.warn('Failed to fetch tenant proposal:', e);
      }
      try {
        const rawLandlordProposal = await simulateCall(contractId, 'get_proposal', [
          leaseIdVal,
          nativeToScVal(landlordAddr, { type: 'address' })
        ]);
        if (rawLandlordProposal) {
          landlordProposal = [
            Number(rawLandlordProposal[0]) / 10_000_000,
            Number(rawLandlordProposal[1]) / 10_000_000
          ];
        }
      } catch (e) {
        console.warn('Failed to fetch landlord proposal:', e);
      }

      // Try fetching dispute reason if status is 2 (Disputed)
      let disputeReason = '';
      if (status === 2) {
        try {
          disputeReason = await simulateCall(contractId, 'get_dispute_reason', [leaseIdVal]);
        } catch (e) {
          console.warn('Failed to fetch dispute reason:', e);
          disputeReason = 'No dispute description provided';
        }
      }

      // Fetch on-chain events for this lease if metadata is missing/incomplete
      let leaseEvents = [];
      try {
        const latestLedger = await rpcServer.getLatestLedger();
        const startLedger = Math.max(1, latestLedger.sequence - 10000);
        const eventsResponse = await rpcServer.getEvents({
          startLedger,
          filters: [
            {
              type: 'contract',
              id: contractId
            }
          ]
        });
        
        const rawEvents = eventsResponse.events || [];
        rawEvents.forEach(evt => {
          const actualTxHash = evt.txHash || evt.transactionHash;
          if (!evt.topic || !actualTxHash) return;
          const eventName = evt.topic[0] ? scValToNative(evt.topic[0]) : '';
          if (!eventName) return;
          
          let matches = false;
          try {
            if (eventName === 'init') {
              const spoileredId = scValToNative(evt.value);
              if (getSpoileredLeaseId(idStr) === spoileredId) matches = true;
            } else if (evt.topic[1]) {
              const rawIdVal = scValToNative(evt.topic[1]);
              if (fnv1a64(idStr).toString() === rawIdVal.toString()) matches = true;
            }
          } catch (e) {}
          
          if (matches) {
            let eventText = '';
            let callerRole = '';
            if (eventName === 'init') {
              eventText = 'Escrow Created & Initialized';
              callerRole = 'Landlord';
            } else if (eventName === 'funded') {
              eventText = 'Escrow Funded';
              callerRole = 'Tenant';
            } else if (eventName === 'proposed') {
              try {
                const val = scValToNative(evt.value);
                const tAmt = formatXlmAmount(Number(val[0]) / 10_000_000);
                const lAmt = formatXlmAmount(Number(val[1]) / 10_000_000);
                const callerAddr = scValToNative(evt.topic[2]);
                callerRole = (callerAddr === tenantAddr) ? 'Tenant' : 'Landlord';
                eventText = `${callerRole} proposed release split: Tenant: ${tAmt} XLM, Landlord: ${lAmt} XLM`;
              } catch (e) {
                eventText = 'Release split proposal submitted';
              }
            } else if (eventName === 'disputed') {
              try {
                const reasonStr = scValToNative(evt.value);
                const callerAddr = scValToNative(evt.topic[2]);
                callerRole = (callerAddr === tenantAddr) ? 'Tenant' : 'Landlord';
                eventText = `Dispute declared by ${callerRole}. Reason: "${reasonStr}"`;
              } catch (e) {
                eventText = 'Dispute declared';
              }
            } else if (eventName === 'released') {
              try {
                const val = scValToNative(evt.value);
                const tAmt = formatXlmAmount(Number(val[0]) / 10_000_000);
                const lAmt = formatXlmAmount(Number(val[1]) / 10_000_000);
                const typeSym = scValToNative(evt.topic[2]);
                if (typeSym === 'dispute') {
                  eventText = `Dispute resolved by Arbitrator! (Tenant: ${tAmt} XLM, Landlord: ${lAmt} XLM)`;
                  callerRole = 'Arbitrator';
                } else {
                  eventText = `Escrow Released! (Tenant: ${tAmt} XLM, Landlord: ${lAmt} XLM)`;
                }
              } catch (e) {
                eventText = 'Escrow Released';
              }
            }
            
            if (eventText) {
              leaseEvents.push({
                timestamp: evt.ledgerClosedAt || new Date().toISOString(),
                event: eventText,
                txHash: actualTxHash,
                callerRole
              });
            }
          }
        });
        
        leaseEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Reconstruct mutual release caller role if empty
        leaseEvents.forEach((le, idx) => {
          if (le.eventName === 'released' && !le.callerRole) {
            const firstProposer = leaseEvents.find(e => e.eventName === 'proposed');
            if (firstProposer) {
              le.callerRole = firstProposer.callerRole === 'Tenant' ? 'Landlord' : 'Tenant';
            } else {
              le.callerRole = 'Tenant'; // fallback
            }
          }
        });
      } catch (evtErr) {
        console.warn('Failed to fetch load events:', evtErr);
      }

      const detailsObj = {
        leaseId: idStr,
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
        tenantProposal,
        landlordProposal,
        disputeReason: metadata.disputeReason || disputeReason,
        unlockTime,
        history: (metadata && metadata.history && metadata.history.length > 0) 
          ? metadata.history 
          : leaseEvents.length > 0 
            ? leaseEvents 
            : [
                { timestamp: new Date().toISOString(), event: 'Escrow Loaded from On-Chain' }
              ]
      };

      setActiveEscrowDetails(detailsObj);

      // Save/sync back to local storage and backend if needed
      const escrows = getLocalEscrows();
      const existingIdx = escrows.findIndex(e => e.leaseId === idStr);
      if (existingIdx >= 0) {
        escrows[existingIdx] = detailsObj;
      } else {
        escrows.push(detailsObj);
      }
      saveLocalEscrows(escrows);

      // Sync back to backend API if not exists there
      try {
        const response = await fetch(`${BACKEND_URL}/api/escrows/${idStr}`);
        if (!response.ok) {
          await fetch(`${BACKEND_URL}/api/escrows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(detailsObj)
          });
        }
      } catch (err) {
        console.warn('Sync back to backend failed:', err);
      }

      // Snap slider ranges to snapped proposals or default half
      const isCurrentUserTenant = userAddress === tenantAddr;
      const isCurrentUserLandlord = userAddress === landlordAddr;
      const hasTenantProposed = !!tenantProposal;
      const hasLandlordProposed = !!landlordProposal;
      const hasCurrentUserProposed = (isCurrentUserTenant && hasTenantProposed) || (isCurrentUserLandlord && hasLandlordProposed);
      const hasOtherPartyProposed = (isCurrentUserTenant && hasLandlordProposed) || (isCurrentUserLandlord && hasTenantProposed);

      if (hasOtherPartyProposed && !hasCurrentUserProposed) {
        // Auto snap slider to match other party split to facilitate easy release
        const otherProposal = isCurrentUserTenant ? landlordProposal : tenantProposal;
        const otherTenantAmt = Number(otherProposal[0]);
        setRangeSplitVal(otherTenantAmt);
      } else {
        setRangeSplitVal(Math.floor(amountVal / 2));
      }

      setRangeArbVal(Math.floor(amountVal / 2));
    } catch (err) {
      console.error('Failed to load escrow details:', err);
      setErrorDetails({
        leaseId: idStr,
        message: getErrorMessage(err)
      });
    }
  };

  // Create Escrow Form Handler
  const handleCreateEscrow = async (e) => {
    e.preventDefault();
    if (!userAddress) {
      showToast('Please connect your Freighter wallet to execute smart contract operations.', 'error');
      return;
    }

    const { title, desc, tenant, arbitrator, amount, token, tenantName, landlordName } = createFormData;
    const contractAddress = DEFAULT_CONTRACT_ID;

    // SAC token address mappings
    const tokenAddress = token === 'native' 
      ? 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC' 
      : 'CD6BLQ43MNALRYGKLCSDPQWKC4SN46LZGRHPNJSJZLDC6H2H3NSO5IZL'; // USDC Mock

    setIsCreating(true);
    try {
      // Generate 16 digit Lease ID
      const leaseId = BigInt(Math.floor(Math.random() * 9000000000000000) + 1000000000000000);
      const leaseIdStr = leaseId.toString();

      console.log('Initializing escrow contract', contractAddress, 'with Lease ID', leaseIdStr);
      
      const spoileredLeaseId = getSpoileredLeaseId(leaseIdStr);

      const args = [
        nativeToScVal(fnv1a64(leaseIdStr), { type: 'u64' }),
        nativeToScVal(tenant, { type: 'address' }), // tenant address from form
        nativeToScVal(userAddress, { type: 'address' }), // landlord (connected userAddress)
        nativeToScVal(arbitrator, { type: 'address' }),
        nativeToScVal(tokenAddress, { type: 'address' }),
        nativeToScVal(BigInt(Math.floor(parseFloat(amount) * 10_000_000)), { type: 'i128' }),
        nativeToScVal(BigInt(lockDurationSeconds), { type: 'u64' }), // lock duration in seconds
        nativeToScVal(tenantName || 'Tenant', { type: 'string' }),
        nativeToScVal(landlordName || 'Landlord', { type: 'string' }),
        nativeToScVal(spoileredLeaseId, { type: 'string' })
      ];

      const txResult = await executeTx(contractAddress, 'initialize', args);
      const txHash = txResult.hash;

      // Save to local storage
      const escrows = getLocalEscrows();
      const newEscrow = {
        leaseId: leaseIdStr,
        address: contractAddress,
        tenant, // tenant address from form
        tenantName: tenantName || 'Tenant',
        landlord: userAddress, // landlord (connected userAddress)
        landlordName: landlordName || 'Landlord',
        arbitrator,
        arbitratorName: 'Delhi Housing Authority',
        amount: `${amount} XLM`,
        status: 'Created',
        title,
        description: desc,
        unlockTime: 0,
        history: [
          { timestamp: new Date().toISOString(), event: 'Escrow Created & Initialized', txHash, callerRole: 'Landlord' }
        ]
      };
      escrows.push(newEscrow);
      saveLocalEscrows(escrows);

      // Post to backend falling back silently on errors
      try {
        await fetch(`${BACKEND_URL}/api/escrows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newEscrow)
        });
      } catch (err) {
        console.warn('Backend sync failed:', err);
      }

      showToast(`Escrow initialized successfully! Lease ID: ${leaseIdStr}`, 'success', txHash);
      
      // Clear form
      setCreateFormData({
        title: '',
        desc: '',
        tenant: '',
        arbitrator: '',
        amount: '',
        token: 'native',
        tenantName: '',
        landlordName: ''
      });

      // Load details directly in workspace
      setActiveTab('manage');
      setSearchLeaseId(leaseIdStr);
      await handleLoadEscrow(leaseIdStr);
      await loadDashboardEscrows();
      updateWalletBalance(userAddress);
    } catch (err) {
      console.error('Escrow initialization failed:', err);
      showToast(`Failed to initialize escrow: ${getErrorMessage(err)}`, 'error');
    } finally {
      setIsCreating(false);
    }
  };

  // Fund Escrow Handler
  const handleFundEscrow = async () => {
    if (!activeEscrowDetails) return;
    const leaseIdStr = activeEscrowDetails.leaseId;

    setIsFunding(true);
    try {
      const leaseId = fnv1a64(leaseIdStr);
      const txResult = await executeTx(activeEscrowDetails.address, 'fund', [nativeToScVal(leaseId, { type: 'u64' })]);
      const txHash = txResult.hash;

      // Update offline DB
      const escrows = getLocalEscrows();
      const escrow = escrows.find(e => e.leaseId === leaseIdStr);
      if (escrow) {
        escrow.status = 'Active';
        escrow.history.push({ timestamp: new Date().toISOString(), event: 'Escrow Funded', txHash, callerRole: 'Tenant' });
        saveLocalEscrows(escrows);
      }

      // Notify backend falling back silently
      try {
        await fetch(`${BACKEND_URL}/api/escrows/${leaseIdStr}/fund`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txHash })
        });
      } catch (err) {
        console.warn('Backend sync failed:', err);
      }

      showToast('Escrow funded successfully on-chain! Funds locked in contract.', 'success', txHash);
      await handleLoadEscrow(leaseIdStr);
      await loadDashboardEscrows();
      updateWalletBalance(userAddress);
    } catch (err) {
      console.error('Funding failed:', err);
      showToast(`Funding transaction failed: ${getErrorMessage(err)}`, 'error');
    } finally {
      setIsFunding(false);
    }
  };

  // Propose Split Handler
  const handleProposeSplit = async () => {
    if (!activeEscrowDetails) return;
    const leaseIdStr = activeEscrowDetails.leaseId;
    const tenantAmt = rangeSplitVal;
    const landlordAmt = activeEscrowDetails.amount - tenantAmt;

    const isCurrentUserLandlord = userAddress === activeEscrowDetails.landlord;
    const isConflict = activeEscrowDetails.tenantProposal && tenantAmt !== Number(activeEscrowDetails.tenantProposal[0]);
    if (isCurrentUserLandlord && isConflict && !landlordDisputeReason.trim()) {
      setShowDisputeReasonError(true);
      showToast('You must provide a dispute reason before submitting a conflicting proposal.', 'error');
      return;
    }

    setIsProposing(true);
    try {
      const leaseId = fnv1a64(leaseIdStr);
      const leaseIdVal = nativeToScVal(leaseId, { type: 'u64' });

      const args = [
        leaseIdVal,
        nativeToScVal(userAddress, { type: 'address' }),
        nativeToScVal(BigInt(Math.floor(tenantAmt * 10_000_000)), { type: 'i128' }),
        nativeToScVal(BigInt(Math.floor(landlordAmt * 10_000_000)), { type: 'i128' })
      ];

      const txResult = await executeTx(activeEscrowDetails.address, 'propose_release', args);
      const txHash = txResult.hash;

      // Check on-chain status to see if splits match
      const currentStatus = await simulateCall(activeEscrowDetails.address, 'get_status', [leaseIdVal]);

      const escrows = getLocalEscrows();
      const escrow = escrows.find(e => e.leaseId === leaseIdStr);
      if (escrow) {
        const callerRole = userAddress === escrow.tenant ? 'Tenant' : 'Landlord';
        if (Number(currentStatus) === 3) {
          escrow.status = 'Released';
          escrow.history.push({ 
            timestamp: new Date().toISOString(), 
            event: `Escrow Released! (Tenant: ${tenantAmt} XLM, Landlord: ${landlordAmt} XLM)`,
            txHash,
            callerRole
          });
          showToast('Agreement reached! Splits match. Escrow released successfully!', 'success', txHash);

          try {
            await fetch(`${BACKEND_URL}/api/escrows/${leaseIdStr}/release`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ tenantAmount: tenantAmt, landlordAmount: landlordAmt, txHash, callerRole })
            });
          } catch (err) {
            console.warn('Backend sync failed:', err);
          }
        } else if (Number(currentStatus) === 2) {
          const finalReason = (isCurrentUserLandlord && isConflict) 
            ? landlordDisputeReason.trim() 
            : 'Conflicting release splits proposed';
          
          escrow.status = 'Disputed';
          escrow.disputeReason = finalReason;
          escrow.history.push({ 
            timestamp: new Date().toISOString(), 
            event: `Conflicting proposal submitted! Escrow automatically transitioned to Disputed. Reason: "${finalReason}"`,
            txHash,
            callerRole
          });
          showToast('Conflicting proposal submitted. Escrow status transitioned to DISPUTED.', 'warning', txHash);

          try {
            await fetch(`${BACKEND_URL}/api/escrows/${leaseIdStr}/dispute`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ caller: userAddress, reason: finalReason, txHash })
            });
          } catch (err) {
            console.warn('Backend sync failed:', err);
          }
          setLandlordDisputeReason('');
          setShowDisputeReasonError(false);
        } else {
          escrow.history.push({ 
            timestamp: new Date().toISOString(), 
            event: `${callerRole} proposed release split: Tenant: ${tenantAmt} XLM, Landlord: ${landlordAmt} XLM`,
            txHash,
            callerRole
          });
          showToast('Settlement proposal submitted successfully.', 'success', txHash);

          try {
            await fetch(`${BACKEND_URL}/api/escrows/${leaseIdStr}/propose`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ caller: userAddress, tenantAmount: tenantAmt, landlordAmount: landlordAmt, txHash })
            });
          } catch (err) {
            console.warn('Backend sync failed:', err);
          }
        }
        saveLocalEscrows(escrows);
      }

      await handleLoadEscrow(leaseIdStr);
      await loadDashboardEscrows();
      updateWalletBalance(userAddress);
    } catch (err) {
      console.error('Proposal split failed:', err);
      showToast(`Transaction failed: ${getErrorMessage(err)}`, 'error');
    } finally {
      setIsProposing(false);
    }
  };

  // Dispute Handler
  const handleRaiseDispute = async () => {
    if (!activeEscrowDetails) return;
    const leaseIdStr = activeEscrowDetails.leaseId;
    const reason = disputeReasonInput.trim() || 'No dispute reason provided';

    setIsRaisingDispute(true);
    try {
      const leaseId = fnv1a64(leaseIdStr);
      const args = [
        nativeToScVal(leaseId, { type: 'u64' }),
        nativeToScVal(userAddress, { type: 'address' }),
        nativeToScVal(reason, { type: 'string' })
      ];

      const txResult = await executeTx(activeEscrowDetails.address, 'dispute', args);
      const txHash = txResult.hash;

      const escrows = getLocalEscrows();
      const escrow = escrows.find(e => e.leaseId === leaseIdStr);
      if (escrow) {
        const callerRole = userAddress === escrow.tenant ? 'Tenant' : 'Landlord';
        escrow.status = 'Disputed';
        escrow.history.push({ 
          timestamp: new Date().toISOString(), 
          event: `Dispute declared by ${callerRole}. Reason: "${reason}"`,
          txHash,
          callerRole
        });
        saveLocalEscrows(escrows);
      }

      try {
        await fetch(`${BACKEND_URL}/api/escrows/${leaseIdStr}/dispute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caller: userAddress, reason, txHash })
        });
      } catch (err) {
        console.warn('Backend sync failed:', err);
      }

      showToast('Dispute successfully declared on-chain. Arbitrator has been notified.', 'success', txHash);
      setDisputeReasonInput('');
      await handleLoadEscrow(leaseIdStr);
      await loadDashboardEscrows();
    } catch (err) {
      console.error('Dispute failed:', err);
      showToast(`Dispute transaction failed: ${getErrorMessage(err)}`, 'error');
    } finally {
      setIsRaisingDispute(false);
    }
  };

  // Resolve Dispute (Arbitrator Action)
  const handleResolveDispute = async () => {
    if (!activeEscrowDetails) return;
    const leaseIdStr = activeEscrowDetails.leaseId;
    const tenantAmt = rangeArbVal;
    const landlordAmt = activeEscrowDetails.amount - tenantAmt;

    setIsResolving(true);
    try {
      const leaseId = fnv1a64(leaseIdStr);
      const args = [
        nativeToScVal(leaseId, { type: 'u64' }),
        nativeToScVal(BigInt(Math.floor(tenantAmt * 10_000_000)), { type: 'i128' }),
        nativeToScVal(BigInt(Math.floor(landlordAmt * 10_000_000)), { type: 'i128' })
      ];

      const txResult = await executeTx(activeEscrowDetails.address, 'resolve_dispute', args);
      const txHash = txResult.hash;

      const escrows = getLocalEscrows();
      const escrow = escrows.find(e => e.leaseId === leaseIdStr);
      if (escrow) {
        escrow.status = 'Released (Disputed)';
        escrow.history.push({ 
          timestamp: new Date().toISOString(), 
          event: `Dispute resolved by Arbitrator! (Tenant: ${tenantAmt} XLM, Landlord: ${landlordAmt} XLM)`,
          txHash,
          callerRole: 'Arbitrator'
        });
        saveLocalEscrows(escrows);
      }

      try {
        await fetch(`${BACKEND_URL}/api/escrows/${leaseIdStr}/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantAmount: tenantAmt, landlordAmount: landlordAmt, txHash })
        });
      } catch (err) {
        console.warn('Backend sync failed:', err);
      }

      showToast('Dispute resolved by arbitrator. Funds distributed!', 'success', txHash);
      await handleLoadEscrow(leaseIdStr);
      await loadDashboardEscrows();
      updateWalletBalance(userAddress);
    } catch (err) {
      console.error('Resolution failed:', err);
      showToast(`Resolution transaction failed: ${getErrorMessage(err)}`, 'error');
    } finally {
      setIsResolving(false);
    }
  };

  // Status Badge Class parser
  const getStatusBadgeClass = (statusStr) => {
    switch (String(statusStr || '').toLowerCase()) {
      case 'active':
      case '1':
        return 'status-active';
      case 'disputed':
      case '2':
        return 'status-disputed';
      case 'created':
      case '0':
        return 'status-created';
      case 'released':
      case 'released (disputed)':
      case 'resolved':
      case '3':
        return 'status-released';
      default: return 'status-released';
    }
  };

  const getStatusLabel = (statusStr) => {
    const s = String(statusStr || '').toLowerCase();
    if (s === 'created' || s === '0') return 'CREATED';
    if (s === 'active' || s === '1') return 'ACTIVE';
    if (s === 'disputed' || s === '2') return 'DISPUTED';
    if (s === 'released' || s === '3') return 'RELEASED';
    if (s === 'released (disputed)') return 'RELEASED (DISPUTED)';
    if (s === 'resolved') return 'RESOLVED';
    return s.toUpperCase();
  };

  return (
    <>
      {/* Background Grid Texture */}
      <div className="grid-background"></div>

      {/* Floating Theme Toggle Button */}
      <button onClick={handleToggleTheme} className="theme-toggle-btn" aria-label="Toggle Theme">
        {theme === 'dark' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2" />
            <path d="M12 20v2" />
            <path d="m4.93 4.93 1.41 1.41" />
            <path d="m17.66 17.66 1.41 1.41" />
            <path d="M2 12h2" />
            <path d="M20 12h2" />
            <path d="m6.34 17.66-1.41 1.41" />
            <path d="m19.07 4.93-1.41 1.41" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
        )}
      </button>

      {/* Floating Nav Bar */}
      <nav className="navbar">
        <div className="navbar-brand">
          <span className="logo-text">DEPOSHIELD</span>
          <span className="tagline">STELLAR ESCROW</span>
        </div>
        <div className="navbar-menu">
          <button 
            onClick={() => { setActivePage('workspace'); setIsMobileMenuOpen(false); }} 
            className={`nav-link ${activePage === 'workspace' ? 'active' : ''}`}
          >
            WORKSPACE
          </button>
          <button 
            onClick={() => { setActivePage('dashboard'); setIsMobileMenuOpen(false); }} 
            className={`nav-link ${activePage === 'dashboard' ? 'active' : ''}`}
          >
            DASHBOARD
          </button>
          <button 
            onClick={() => { setActivePage('docs'); setIsMobileMenuOpen(false); }} 
            className={`nav-link ${activePage === 'docs' ? 'active' : ''}`}
          >
            DOCUMENTATION
          </button>
        </div>
        <div className="navbar-actions">
          {!userAddress ? (
            <button onClick={handleConnectWallet} className="btn btn-primary pill-btn">CONNECT WALLET</button>
          ) : (
            <div className="wallet-info">
              <span className="address-mono">{`${userAddress.slice(0, 6)}...${userAddress.slice(-6)}`}</span>
              <button onClick={handleDisconnectWallet} className="btn btn-secondary btn-icon-only" aria-label="Disconnect">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              </button>
            </div>
          )}
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
            className={`hamburger-btn ${isMobileMenuOpen ? 'open' : ''}`} 
            aria-label="Toggle menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </nav>

      {/* Mobile Dropdown Menu */}
      <div className={`mobile-menu ${isMobileMenuOpen ? 'open' : ''}`}>
        <button 
          onClick={() => { setActivePage('workspace'); setIsMobileMenuOpen(false); }} 
          className={`mobile-nav-link ${activePage === 'workspace' ? 'active' : ''}`}
        >
          WORKSPACE
        </button>
        <button 
          onClick={() => { setActivePage('dashboard'); setIsMobileMenuOpen(false); }} 
          className={`mobile-nav-link ${activePage === 'dashboard' ? 'active' : ''}`}
        >
          DASHBOARD
        </button>
        <button 
          onClick={() => { setActivePage('docs'); setIsMobileMenuOpen(false); }} 
          className={`mobile-nav-link ${activePage === 'docs' ? 'active' : ''}`}
        >
          DOCUMENTATION
        </button>
      </div>

      <main className="container">
        {/* Hero Section */}
        <header className="hero">
          <div className="hero-content">
            <span className="badge">SOROBAN SMART CONTRACT PROTOCOL</span>
            <h1 className="hero-title">TRUSTLESS SECURITY DEPOSITS</h1>
            <p className="hero-subtitle">
              Eliminate landlord-tenant friction. Lock rental deposits on-chain with neutral, automated rules. Release funds
              mutually or resolve disputes instantly via decentralized arbitration.
            </p>
          </div>
        </header>

        {/* Page 1: Workspace Section */}
        {activePage === 'workspace' && (
          <div id="page-workspace" className="page-section">
            <div className={`workspace-grid bento-grid ${userAddress ? 'wallet-connected' : ''}`}>
              
              {/* Wallet Status Card (hidden when not connected) */}
              {userAddress && (
                <div className="bento-card bento-card-wallet">
                  <h2 className="section-title">CONNECTED WALLET STATUS</h2>
                  <p className="section-desc">Details and real-time balance of the active Freighter wallet account.</p>

                  <div className="escrow-stats" style={{ marginBottom: 0 }}>
                    <div className="stat-item">
                      <span className="stat-label">ACCOUNT ADDRESS</span>
                      <span className="address-mono stat-value text-truncate">
                        {userAddress ? `${userAddress.slice(0, 8)}...${userAddress.slice(-8)}` : '--'}
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">NATIVE XLM BALANCE</span>
                      <span className="address-mono stat-value">{walletBalance}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Main Workspace Card */}
              <div className="bento-card bento-card-workspace">
                <div className="tab-control">
                  <button 
                    onClick={() => setActiveTab('create')} 
                    className={`tab-btn ${activeTab === 'create' ? 'active' : ''}`}
                  >
                    CREATE ESCROW
                  </button>
                  <button 
                    onClick={() => setActiveTab('manage')} 
                    className={`tab-btn ${activeTab === 'manage' ? 'active' : ''}`}
                  >
                    MANAGE ESCROW
                  </button>
                </div>

                {/* Create Escrow Panel */}
                {activeTab === 'create' && (
                  <div className="workspace-panel">
                    <h2 className="section-title">INITIALIZE NEW LEASE</h2>
                    <p className="section-desc">Set up a secure escrow contract instance. The tenant will fund it, and release conditions will lock it.</p>

                    <form onSubmit={handleCreateEscrow} className="form-container">

                      <div className="form-group">
                        <label htmlFor="input-title">LEASE TITLE</label>
                        <input 
                          type="text" 
                          id="input-title" 
                          placeholder="e.g., APARTMENT 4B - GREENVIEW HEIGHTS" 
                          required
                          value={createFormData.title}
                          onChange={(e) => setCreateFormData({ ...createFormData, title: e.target.value })}
                        />
                      </div>

                      <div className="form-group">
                        <label htmlFor="input-desc">LEASE DESCRIPTION</label>
                        <textarea 
                          id="input-desc" 
                          placeholder="Detail move-in dates, terms, or conditions..." 
                          rows="6"
                          value={createFormData.desc}
                          onChange={(e) => setCreateFormData({ ...createFormData, desc: e.target.value })}
                        />
                      </div>

                      <div className="form-grid form-grid-stack">
                        <div className="form-group">
                          <label htmlFor="input-tenant">TENANT PUBLIC KEY</label>
                          <input 
                            type="text" 
                            id="input-tenant" 
                            className="address-mono" 
                            placeholder="GD..." 
                            required
                            value={createFormData.tenant}
                            onChange={(e) => setCreateFormData({ ...createFormData, tenant: e.target.value })}
                          />
                        </div>

                        <div className="form-group">
                          <label htmlFor="input-arbitrator">ARBITRATOR PUBLIC KEY</label>
                          <input 
                            type="text" 
                            id="input-arbitrator" 
                            className="address-mono" 
                            placeholder="GA..." 
                            required
                            value={createFormData.arbitrator}
                            onChange={(e) => setCreateFormData({ ...createFormData, arbitrator: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="form-grid">
                        <div className="form-group">
                          <label htmlFor="input-amount">DEPOSIT AMOUNT (XLM)</label>
                          <input 
                            type="number" 
                            id="input-amount" 
                            placeholder="e.g., 500" 
                            required 
                            min="1"
                            value={createFormData.amount}
                            onChange={(e) => setCreateFormData({ ...createFormData, amount: e.target.value })}
                          />
                        </div>

                        <div className="form-group">
                          <label htmlFor="select-token">TOKEN ASSET</label>
                          <select 
                            id="select-token"
                            value={createFormData.token}
                            onChange={(e) => setCreateFormData({ ...createFormData, token: e.target.value })}
                          >
                            <option value="native">XLM (Native Stellar)</option>
                            <option value="usdc">USDC (Stellar Anchor)</option>
                          </select>
                        </div>
                      </div>

                      {/* Escrow Lock Duration Options */}
                      <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem', padding: '1.25rem', border: '1px solid var(--border-color)', borderRadius: '16px', background: 'rgba(255,255,255,0.01)' }}>
                        <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-primary)', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary)' }}>
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                          </svg>
                          SECURITY DEPOSIT TIME-LOCK CONFIGURATION
                        </h4>

                        <div className="form-grid" style={{ marginBottom: '1.25rem' }}>
                          <div className="form-group">
                            <label htmlFor="input-unlock-time">UNLOCK DATE & TIME</label>
                            <input 
                              type="datetime-local" 
                              id="input-unlock-time" 
                              required
                              value={unlockDateTime}
                              onChange={(e) => syncFromDateTime(e.target.value)}
                            />
                          </div>

                          <div className="form-group">
                            <label htmlFor="input-lock-seconds">LOCK DURATION (SECONDS)</label>
                            <input 
                              type="number" 
                              id="input-lock-seconds" 
                              placeholder="e.g., 86400" 
                              required
                              min="1"
                              value={lockDurationSeconds === 0 ? '0' : Number(lockDurationSeconds).toString()}
                              onChange={(e) => syncFromDuration(e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <label style={{ margin: 0 }}>QUICK LOCK DURATION SELECTOR</label>
                            <span className="address-mono" style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                              {PREDEFINED_DURATION_LABELS[quickDurationIndex]} ({lockDurationSeconds.toLocaleString()} seconds)
                            </span>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max="7" 
                            value={quickDurationIndex} 
                            onChange={(e) => syncFromSlider(e.target.value)}
                            className="split-slider"
                            style={{ margin: '0.5rem 0' }}
                          />
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            <span>30s</span>
                            <span>5m</span>
                            <span>1h</span>
                            <span>1d</span>
                            <span>1w</span>
                            <span>1m</span>
                            <span>6m</span>
                            <span>1y</span>
                          </div>
                        </div>
                      </div>

                      <div className="form-group">
                        <label htmlFor="input-tenant-name">TENANT NAME (FOR NOTIFICATION)</label>
                        <input 
                          type="text" 
                          id="input-tenant-name" 
                          placeholder="Your Name" 
                          required
                          value={createFormData.tenantName}
                          onChange={(e) => setCreateFormData({ ...createFormData, tenantName: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="input-landlord-name">LANDLORD NAME (FOR NOTIFICATION)</label>
                        <input 
                          type="text" 
                          id="input-landlord-name" 
                          placeholder="Landlord Name" 
                          required
                          value={createFormData.landlordName}
                          onChange={(e) => setCreateFormData({ ...createFormData, landlordName: e.target.value })}
                        />
                      </div>

                      <button type="submit" disabled={isCreating} className="btn btn-primary btn-full pill-btn">
                        {isCreating ? 'PROPOSING LEASE INITIALIZATION...' : 'INITIALIZE ESCROW ON-CHAIN'}
                      </button>
                    </form>
                  </div>
                )}

                {/* Manage / Interact Panel */}
                {activeTab === 'manage' && (
                  <div className="workspace-panel">
                    <h2 className="section-title">ACTIVE INTERACTION</h2>
                    <p className="section-desc">Search and load a lease escrow by its unique numeric Lease ID to perform actions.</p>

                    <div className="search-box">
                      <input 
                        type="text" 
                        className="address-mono" 
                        placeholder="Enter Lease ID (e.g., 578129031)..."
                        value={searchLeaseId}
                        onChange={(e) => setSearchLeaseId(e.target.value)}
                      />
                      <button onClick={() => handleLoadEscrow(searchLeaseId)} className="btn btn-secondary pill-btn">LOAD</button>
                    </div>

                    {/* Simulation Error Panel */}
                    {errorDetails && (
                      <div className="info-banner error" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1.25rem', borderRadius: '16px', background: 'rgba(255, 23, 68, 0.05)', border: '1px solid rgba(255, 23, 68, 0.15)', width: '100%' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px', flexShrink: 0 }}>
                          <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
                          <line x1="12" y1="9" x2="12" y2="13"></line>
                          <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', textAlign: 'left' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-error)', letterSpacing: '0.05em' }}>ERROR</span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>This ID is invalid.</span>
                        </div>
                      </div>
                    )}

                    {/* Escrow Details */}
                    {activeEscrowDetails && (() => {
                      const isLocked = activeEscrowDetails.unlockTime * 1000 > Date.now();
                      return (
                        <div>
                        <div className="loaded-escrow-header">
                          <h3 className="escrow-title-text">{activeEscrowDetails.title}</h3>
                          <span className={`badge-status ${
                            activeEscrowDetails.status === 0 ? 'status-created' :
                            activeEscrowDetails.status === 1 ? 'status-active' :
                            activeEscrowDetails.status === 2 ? 'status-disputed' : 'status-released'
                          }`}>
                            {activeEscrowDetails.status === 0 ? 'UNFUNDED / CREATED' :
                             activeEscrowDetails.status === 1 ? 'ACTIVE / LOCKED' :
                             activeEscrowDetails.status === 2 ? 'DISPUTED' : 'RELEASED / CLOSED'}
                          </span>
                        </div>
                        <p className="escrow-desc-text">{activeEscrowDetails.description}</p>

                        {/* Visualizer columns */}
                        <div className="transfer-visualizer">
                          <div className="visual-col">
                            <span className="visual-label">TENANT</span>
                            <span className="address-mono text-truncate">{activeEscrowDetails.tenant}</span>
                            <span className="visual-subtext">{activeEscrowDetails.tenantName}</span>
                          </div>
                          <div className="visual-divider">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 5v14M5 12h14"></path>
                            </svg>
                          </div>
                          <div className="visual-col">
                            <span className="visual-label">LANDLORD</span>
                            <span className="address-mono text-truncate">{activeEscrowDetails.landlord}</span>
                            <span className="visual-subtext">{activeEscrowDetails.landlordName}</span>
                          </div>
                        </div>

                        {/* Escrow Stats */}
                        <div className="escrow-stats">
                          <div className="stat-item">
                            <span className="stat-label">TOTAL ESCROW AMOUNT</span>
                            <span className="address-mono stat-value">{`${formatXlmAmount(activeEscrowDetails.amount)} XLM`}</span>
                          </div>
                          <div className="stat-item">
                            <span className="stat-label">LEASE ID</span>
                            <span className="address-mono stat-value">{activeEscrowDetails.leaseId}</span>
                          </div>
                        </div>

                        {/* Actions: Unfunded state */}
                        {activeEscrowDetails.status === 0 && (() => {
                          const isCurrentUserTenant = userAddress === activeEscrowDetails.tenant;
                          if (isCurrentUserTenant) {
                            return (
                              <div className="action-section">
                                <div className="info-banner warning" style={{ marginBottom: '1.25rem' }}>
                                  <span>Escrow initialized. Please deposit the security deposit to activate the contract.</span>
                                </div>
                                <button 
                                  onClick={handleFundEscrow} 
                                  disabled={isFunding} 
                                  className="btn btn-primary btn-full pill-btn"
                                >
                                  {isFunding ? 'FUNDING ESCROW ON-CHAIN...' : 'FUND ESCROW NOW (DEPOSIT)'}
                                </button>
                              </div>
                            );
                          } else {
                            return (
                              <div className="action-section">
                                <div className="info-banner warning" style={{ padding: '1.25rem', border: '1px solid rgba(255, 179, 0, 0.25)', borderRadius: '16px', background: 'rgba(255, 179, 0, 0.05)', textAlign: 'left' }}>
                                  <span style={{ fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>WAITING FOR TENANT DEPOSIT</span>
                                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    Lease initialized on-chain. Waiting for the tenant to deposit the security deposit funds.
                                  </p>
                                </div>
                              </div>
                            );
                          }
                        })()}

                        {/* Actions: Active state */}
                        {activeEscrowDetails.status === 1 && (() => {
                          const isCurrentUserTenant = userAddress === activeEscrowDetails.tenant;
                          const isCurrentUserLandlord = userAddress === activeEscrowDetails.landlord;
                          
                          if (isCurrentUserTenant) {
                            if (activeEscrowDetails.tenantProposal) {
                              return (
                                <div className="action-section">
                                  <div className="info-banner success" style={{ padding: '1.25rem', border: '1px solid var(--border-color)', borderRadius: '16px', background: 'rgba(255,255,255,0.01)', textAlign: 'left' }}>
                                    <span style={{ fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>SETTLEMENT PROPOSAL SUBMITTED</span>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                      You proposed: <strong>Tenant {formatXlmAmount(activeEscrowDetails.tenantProposal[0])} XLM / Landlord {formatXlmAmount(activeEscrowDetails.tenantProposal[1])} XLM</strong>.
                                    </p>
                                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                      Waiting for Landlord review. You cannot perform further actions.
                                    </p>
                                  </div>
                                </div>
                              );
                            }
                          } else if (isCurrentUserLandlord) {
                            if (!activeEscrowDetails.tenantProposal) {
                              return (
                                <div className="action-section">
                                  <div className="info-banner warning" style={{ padding: '1.25rem', border: '1px solid rgba(255, 179, 0, 0.25)', borderRadius: '16px', background: 'rgba(255, 179, 0, 0.05)', textAlign: 'left' }}>
                                    <span style={{ fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>WAITING FOR TENANT PROPOSAL</span>
                                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                      The tenant has not submitted their settlement proposal yet. You will be able to review it and submit your proposal once they do.
                                    </p>
                                  </div>
                                </div>
                              );
                            }
                          }

                          return (
                            <div className="action-section">
                              <h4 className="action-heading">PROPOSE RELEASE SPLIT</h4>
                              <p className="action-desc">Negotiate the refund. Enter the split. If landlord and tenant splits match, release executes automatically. Conflicting splits will trigger a dispute.</p>

                              {/* Show details of existing split proposals */}
                              {(activeEscrowDetails.tenantProposal || activeEscrowDetails.landlordProposal) && (
                                <div className="info-banner success" style={{ marginBottom: '1.25rem', padding: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', textAlign: 'left', fontSize: '0.85rem' }}>
                                    {activeEscrowDetails.tenantProposal && (
                                      <span>
                                        <strong>Tenant proposed:</strong> Tenant {formatXlmAmount(activeEscrowDetails.tenantProposal[0])} XLM / Landlord {formatXlmAmount(activeEscrowDetails.tenantProposal[1])} XLM
                                      </span>
                                    )}
                                    {activeEscrowDetails.landlordProposal && (
                                      <span>
                                        <strong>Landlord proposed:</strong> Tenant {formatXlmAmount(activeEscrowDetails.landlordProposal[0])} XLM / Landlord {formatXlmAmount(activeEscrowDetails.landlordProposal[1])} XLM
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Range Slider for proposals */}
                              <div className="slider-container">
                                <div className="slider-labels">
                                  <span>TO TENANT: <strong className="address-mono">{`${formatXlmAmount(rangeSplitVal)} XLM`}</strong></span>
                                  <span>TO LANDLORD: <strong className="address-mono">{`${formatXlmAmount(activeEscrowDetails.amount - rangeSplitVal)} XLM`}</strong></span>
                                </div>
                                {/* Locked banner */}
                                {isLocked && (
                                  <div className="info-banner warning" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1.25rem', borderRadius: '16px', border: '1px solid rgba(255, 179, 0, 0.25)', background: 'rgba(255, 179, 0, 0.05)', marginBottom: '1.5rem' }}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#ffb300', flexShrink: 0 }}>
                                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                    </svg>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', textAlign: 'left' }}>
                                      <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#ffb300', letterSpacing: '0.05em' }}>FUNDS DEPOSIT TIME-LOCKED</span>
                                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        This escrow agreement is locked for the lease contract duration. You can propose or release splits starting on <strong>{formatDateTime(activeEscrowDetails.unlockTime * 1000)}</strong>.
                                      </span>
                                    </div>
                                  </div>
                                )}

                                <input 
                                  type="range" 
                                  min="0" 
                                  max={activeEscrowDetails.amount} 
                                  value={rangeSplitVal} 
                                  onChange={(e) => setRangeSplitVal(Number(e.target.value))}
                                  className="split-slider"
                                  disabled={isLocked}
                                  style={isLocked ? { cursor: 'not-allowed', opacity: 0.5 } : {}}
                                />
                              </div>

                              {isCurrentUserLandlord && (
                                <div className="form-group" style={{ marginTop: '1.25rem', marginBottom: '1.25rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label htmlFor="landlord-dispute-reason">RAISE DISPUTE REASON</label>
                                    {rangeSplitVal !== Number(activeEscrowDetails.tenantProposal?.[0]) && (
                                      <span style={{ fontSize: '0.65rem', color: 'var(--color-error)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>REQUIRED (CONFLICTING PROPOSAL)</span>
                                    )}
                                  </div>
                                  <textarea
                                    id="landlord-dispute-reason"
                                    placeholder={
                                      rangeSplitVal === Number(activeEscrowDetails.tenantProposal?.[0])
                                        ? "Dispute reason disabled (your proposal matches Tenant's split)"
                                        : "Enter reason for conflicting proposal/dispute..."
                                    }
                                    rows="3"
                                    value={landlordDisputeReason}
                                    onChange={(e) => {
                                      setLandlordDisputeReason(e.target.value);
                                      if (e.target.value.trim()) {
                                        setShowDisputeReasonError(false);
                                      }
                                    }}
                                    disabled={rangeSplitVal === Number(activeEscrowDetails.tenantProposal?.[0])}
                                    style={{
                                      opacity: (rangeSplitVal === Number(activeEscrowDetails.tenantProposal?.[0])) ? 0.5 : 1,
                                      cursor: (rangeSplitVal === Number(activeEscrowDetails.tenantProposal?.[0])) ? 'not-allowed' : 'text',
                                      backgroundColor: (rangeSplitVal === Number(activeEscrowDetails.tenantProposal?.[0])) ? 'rgba(255,255,255,0.01)' : 'var(--surface-color-light)',
                                      borderColor: showDisputeReasonError ? 'var(--color-error)' : 'var(--border-color)',
                                      borderRadius: '12px',
                                      padding: '0.9rem 1.1rem',
                                      color: 'var(--text-primary)',
                                      fontFamily: 'var(--font-sans)',
                                      fontSize: '0.95rem',
                                      transition: 'border-color var(--transition-fast), outline var(--transition-fast)',
                                      width: '100%',
                                      resize: 'vertical'
                                    }}
                                  />
                                </div>
                              )}

                              <button 
                                onClick={handleProposeSplit} 
                                disabled={isProposing || isLocked} 
                                className="btn btn-primary btn-full pill-btn"
                                style={isLocked ? { cursor: 'not-allowed', opacity: 0.7 } : {}}
                              >
                                {isProposing ? 'SUBMITTING RELEASE PROPOSAL...' : isLocked ? 'RELEASE LOCK ACTIVE' : 'SUBMIT RELEASE PROPOSAL'}
                              </button>
                            </div>
                          );
                        })()}

                        {/* Actions: Disputed state */}
                        {activeEscrowDetails.status === 2 && (
                          <div className="action-section">
                            <div className="info-banner error">
                              <span>THIS ESCROW IS CURRENTLY DISPUTED</span>
                              <p className="dispute-reason-txt">{`Reason: "${activeEscrowDetails.disputeReason}"`}</p>
                            </div>

                            {/* Arbitrator Decision controls */}
                            {userAddress === activeEscrowDetails.arbitrator ? (
                              <div>
                                <h4 className="action-heading">ARBITRATOR TIE-BREAKER DECISION</h4>
                                <p className="action-desc">You are the registered arbitrator. Review the dispute between Tenant <strong>{activeEscrowDetails.tenantName}</strong> and Landlord <strong>{activeEscrowDetails.landlordName}</strong>, compare the proposals, and decide the final distribution split.</p>

                                {/* Side-by-Side Proposals Comparison */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1.25rem', marginBottom: '1.5rem' }}>
                                  <div style={{ padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)', textAlign: 'left' }}>
                                    <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', letterSpacing: '0.05em', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
                                      TENANT SETTLEMENT PROPOSAL
                                    </span>
                                    {activeEscrowDetails.tenantProposal ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                          <span style={{ color: 'var(--text-secondary)' }}>To Tenant:</span>
                                          <strong className="address-mono" style={{ color: 'var(--text-primary)' }}>{formatXlmAmount(activeEscrowDetails.tenantProposal[0])} XLM</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                          <span style={{ color: 'var(--text-secondary)' }}>To Landlord:</span>
                                          <strong className="address-mono" style={{ color: 'var(--text-primary)' }}>{formatXlmAmount(activeEscrowDetails.tenantProposal[1])} XLM</strong>
                                        </div>
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No proposal submitted</span>
                                    )}
                                  </div>

                                  <div style={{ padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)', textAlign: 'left' }}>
                                    <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', letterSpacing: '0.05em', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
                                      LANDLORD SETTLEMENT PROPOSAL
                                    </span>
                                    {activeEscrowDetails.landlordProposal ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                          <span style={{ color: 'var(--text-secondary)' }}>To Tenant:</span>
                                          <strong className="address-mono" style={{ color: 'var(--text-primary)' }}>{formatXlmAmount(activeEscrowDetails.landlordProposal[0])} XLM</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                          <span style={{ color: 'var(--text-secondary)' }}>To Landlord:</span>
                                          <strong className="address-mono" style={{ color: 'var(--text-primary)' }}>{formatXlmAmount(activeEscrowDetails.landlordProposal[1])} XLM</strong>
                                        </div>
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No proposal submitted</span>
                                    )}
                                  </div>
                                </div>

                                <div className="slider-container">
                                  <div className="slider-labels">
                                    <span>TO TENANT: <strong className="address-mono">{`${formatXlmAmount(rangeArbVal)} XLM`}</strong></span>
                                    <span>TO LANDLORD: <strong className="address-mono">{`${formatXlmAmount(activeEscrowDetails.amount - rangeArbVal)} XLM`}</strong></span>
                                  </div>
                                  {/* Locked banner */}
                                  {isLocked && (
                                    <div className="info-banner warning" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1.25rem', borderRadius: '16px', border: '1px solid rgba(255, 179, 0, 0.25)', background: 'rgba(255, 179, 0, 0.05)', marginTop: '1.25rem', marginBottom: '1.25rem' }}>
                                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#ffb300', flexShrink: 0 }}>
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                      </svg>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', textAlign: 'left' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#ffb300', letterSpacing: '0.05em' }}>ARBITRATION LOCK ACTIVE</span>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                          The dispute cannot be resolved until the contract locks expire on <strong>{formatDateTime(activeEscrowDetails.unlockTime * 1000)}</strong>.
                                        </span>
                                      </div>
                                    </div>
                                  )}

                                  <input 
                                    type="range" 
                                    min="0" 
                                    max={activeEscrowDetails.amount} 
                                    value={rangeArbVal} 
                                    onChange={(e) => setRangeArbVal(Number(e.target.value))}
                                    className="split-slider"
                                    disabled={isLocked}
                                    style={isLocked ? { cursor: 'not-allowed', opacity: 0.5 } : {}}
                                  />
                                </div>
                                <button 
                                  onClick={handleResolveDispute} 
                                  disabled={isResolving || isLocked} 
                                  className="btn btn-danger btn-full pill-btn"
                                  style={isLocked ? { cursor: 'not-allowed', opacity: 0.7 } : {}}
                                >
                                  {isResolving ? 'RESOLVING DISPUTE...' : isLocked ? 'ARBITRATION LOCKED' : 'EXECUTE ARBITRATOR RESOLUTION'}
                                </button>
                              </div>
                            ) : (
                              <div className="non-arbitrator-msg" style={{ width: '100%' }}>
                                <h4 style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-primary)', marginBottom: '0.75rem', textAlign: 'left' }}>
                                  COMPARE CONFLICTING PROPOSALS
                                </h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '0.25rem', marginBottom: '1.25rem', width: '100%' }}>
                                  <div style={{ padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)', textAlign: 'left' }}>
                                    <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', letterSpacing: '0.05em', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
                                      TENANT SETTLEMENT PROPOSAL
                                    </span>
                                    {activeEscrowDetails.tenantProposal ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                          <span style={{ color: 'var(--text-secondary)' }}>To Tenant:</span>
                                          <strong className="address-mono" style={{ color: 'var(--text-primary)' }}>{formatXlmAmount(activeEscrowDetails.tenantProposal[0])} XLM</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                          <span style={{ color: 'var(--text-secondary)' }}>To Landlord:</span>
                                          <strong className="address-mono" style={{ color: 'var(--text-primary)' }}>{formatXlmAmount(activeEscrowDetails.tenantProposal[1])} XLM</strong>
                                        </div>
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No proposal submitted</span>
                                    )}
                                  </div>

                                  <div style={{ padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)', textAlign: 'left' }}>
                                    <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', letterSpacing: '0.05em', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
                                      LANDLORD SETTLEMENT PROPOSAL
                                    </span>
                                    {activeEscrowDetails.landlordProposal ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                          <span style={{ color: 'var(--text-secondary)' }}>To Tenant:</span>
                                          <strong className="address-mono" style={{ color: 'var(--text-primary)' }}>{formatXlmAmount(activeEscrowDetails.landlordProposal[0])} XLM</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                          <span style={{ color: 'var(--text-secondary)' }}>To Landlord:</span>
                                          <strong className="address-mono" style={{ color: 'var(--text-primary)' }}>{formatXlmAmount(activeEscrowDetails.landlordProposal[1])} XLM</strong>
                                        </div>
                                      </div>
                                    ) : (
                                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No proposal submitted</span>
                                    )}
                                  </div>
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                  Waiting for the Arbitrator to review the evidence and submit a decision.
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Actions: Released state */}
                        {activeEscrowDetails.status === 3 && (
                          <div className="action-section">
                            <div className="info-banner success" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem', padding: '1.25rem' }}>
                              <span style={{ fontWeight: 700 }}>ESCROW RELEASED & RESOLVED SUCCESSFULLY</span>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <p style={{ margin: 0, fontSize: '0.85rem' }}>Funds sent back to accounts.</p>
                                <button onClick={() => setActivePage('dashboard')} className="btn btn-primary pill-btn" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', border: 'none', fontWeight: 600 }}>
                                  Check Dashboard
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* Page 2: Dashboard Section */}
        {activePage === 'dashboard' && (
          <div className="page-section">
            <div className="workspace-grid bento-grid">
              
              {/* Platform Metrics Card */}
              <div className="bento-card bento-card-metrics" style={{ gridColumn: 'span 1', gridRow: 'span 3' }}>
                <h2 className="section-title">PLATFORM PERFORMANCE</h2>
                <p className="section-desc">Real-time stats across all smart contract instances.</p>

                <div className="metrics-stack">
                  <div className="metric-item">
                    <span className="metric-label">TOTAL VOLUME LOCKED</span>
                    <span className="address-mono metric-value">{`${metrics.tvl} XLM`}</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">ACTIVE CONTRACTS</span>
                    <span className="address-mono metric-value">{metrics.activeCount}</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">TOTAL RESOLVED LEASES</span>
                    <span className="address-mono metric-value">{metrics.resolvedCount}</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">ON-CHAIN DISPUTES</span>
                    <span className="address-mono metric-value">{metrics.disputeCount}</span>
                  </div>
                </div>
              </div>

              {/* Live Escrow Dashboard */}
              <div className="bento-card bento-card-dashboard" style={{ gridColumn: 'span 2', gridRow: 'span 3' }}>
                <h2 className="section-title">ACTIVE AGENTS / PLATFORM DASHBOARD</h2>
                <p className="section-desc">Current escrows tracked by the platform backend coordinator.</p>
 
                <div className="escrow-list">
                  {!userAddress ? (
                    <div className="dashboard-placeholder">Please connect your wallet to view your active escrows.</div>
                  ) : (() => {
                    const activeEscrows = dashboardEscrows.filter(e => {
                      const status = String(e.status || '').toLowerCase();
                      return status !== 'released' && status !== 'released (disputed)' && status !== 'resolved' && status !== '3';
                    });
                    
                    if (activeEscrows.length === 0) {
                      return <div className="dashboard-placeholder">No active escrows registered for this wallet.</div>;
                    }
                    
                    return activeEscrows.map(escrow => (
                      <div 
                        key={escrow.leaseId} 
                        className="escrow-row" 
                        onClick={() => {
                          setActivePage('workspace');
                          setActiveTab('manage');
                          setSearchLeaseId(escrow.leaseId);
                          handleLoadEscrow(escrow.leaseId);
                        }}
                      >
                        <div className="escrow-row-meta">
                          <span className="escrow-row-title">{escrow.title}</span>
                          <span className="escrow-row-address address-mono text-truncate" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                            Tenant: <strong>{escrow.tenantName || 'Tenant'}</strong> | Landlord: <strong>{escrow.landlordName || 'Landlord'}</strong>
                          </span>
                          <span className="escrow-row-address address-mono text-truncate">{`Lease ID: ${escrow.leaseId}`}</span>
                        </div>
                        <div className="escrow-row-stats">
                          <span className="escrow-row-amount address-mono">{escrow.amount}</span>
                          <span className={`badge-status ${getStatusBadgeClass(escrow.status)}`}>{getStatusLabel(escrow.status)}</span>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Resolved Settlements Dashboard */}
              <div className="bento-card bento-card-resolved" style={{ gridColumn: 'span 3', gridRow: 'span 3', marginTop: '1.5rem' }}>
                <h2 className="section-title">RESOLVED SETTLEMENTS & DEPOSIT PAYOUTS</h2>
                <p className="section-desc">Historical timeline and final on-chain payout distributions.</p>
                <div className="escrow-list">
                  {!userAddress ? (
                    <div className="dashboard-placeholder">Please connect your wallet to view historical resolutions.</div>
                  ) : (() => {
                    const resolvedEscrows = dashboardEscrows.filter(e => {
                      const statusLower = String(e.status).toLowerCase();
                      const isResolved = statusLower === 'released' || statusLower === 'released (disputed)' || statusLower === 'resolved' || statusLower === '3';
                      if (!isResolved) return false;

                      // Filter based on connected wallet role
                      if (e.tenant === userAddress) {
                        return true;
                      }
                      if (e.landlord === userAddress) {
                        return true;
                      }
                      if (e.arbitrator === userAddress) {
                        // Arbitrator only sees disputes they were assigned to resolve
                        const isDisputed = statusLower.includes('disput') || statusLower === 'resolved' || statusLower === '2' || statusLower === '3';
                        const hasDisputeEvent = e.history && e.history.some(h => 
                          String(h.event).toLowerCase().includes('dispute')
                        );
                        return isDisputed || hasDisputeEvent;
                      }
                      return false;
                    });
                    
                    if (resolvedEscrows.length === 0) {
                      return <div className="dashboard-placeholder">No resolved escrows registered for this wallet.</div>;
                    }
                    
                    return resolvedEscrows.map(escrow => (
                      <div 
                        key={escrow.leaseId} 
                        className="escrow-row resolved-escrow-row" 
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem', cursor: 'default', height: 'auto', padding: '1.25rem' }}
                      >
                        {/* Title & Status Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            <span className="escrow-row-title" style={{ fontSize: '0.95rem' }}>{escrow.title}</span>
                            <span className="escrow-row-address address-mono">{`Lease ID: ${getSpoileredLeaseId(escrow.leaseId)}`}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span className="escrow-row-amount address-mono" style={{ fontSize: '1rem', fontWeight: 700 }}>{escrow.amount}</span>
                            <span className={`badge-status ${getStatusBadgeClass(escrow.status)}`}>
                              {getStatusLabel(escrow.status)}
                            </span>
                          </div>
                        </div>

                        {/* Participants context */}
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
                          <span>Tenant: <strong style={{ color: 'var(--text-primary)' }}>{escrow.tenantName}</strong></span>
                          <span>Landlord: <strong style={{ color: 'var(--text-primary)' }}>{escrow.landlordName}</strong></span>
                        </div>

                        {/* Timeline */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left', marginTop: '0.25rem' }}>
                          <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--color-primary)', letterSpacing: '0.05em', fontWeight: 700 }}>
                            ON-CHAIN INVOCATIONS TIMELINE & VERIFICATION
                          </span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', paddingLeft: '0.5rem', borderLeft: '2px solid rgba(255,255,255,0.05)' }}>
                            {escrow.history && escrow.history.map((event, idx) => {
                              let roleLabel = '';
                              let roleClass = '';
                              
                              if (event.callerRole) {
                                if (event.callerRole === 'Tenant') {
                                  roleLabel = 'Tenant Invocation';
                                  roleClass = 'role-tenant';
                                } else if (event.callerRole === 'Landlord') {
                                  roleLabel = 'Landlord Invocation';
                                  roleClass = 'role-landlord';
                                } else if (event.callerRole === 'Arbitrator') {
                                  roleLabel = 'Arbitrator Invocation';
                                  roleClass = 'role-arbitrator';
                                }
                              } else {
                                // Fallback substring parsing for legacy/historic timeline entries
                                const eventStr = event.event.toLowerCase();
                                const isCreated = eventStr.includes('created') || eventStr.includes('initialized');
                                const isFunded = eventStr.includes('funded');
                                const isTenantProposed = eventStr.startsWith('tenant proposed');
                                const isLandlordProposed = eventStr.startsWith('landlord proposed');
                                const isDisputeDeclaredByTenant = eventStr.includes('dispute declared by tenant');
                                const isDisputeDeclaredByLandlord = eventStr.includes('dispute declared by landlord');
                                const isArbitratorResolve = eventStr.includes('dispute resolved') || eventStr.includes('arbitrator');
                                
                                if (isCreated || isLandlordProposed || isDisputeDeclaredByLandlord) {
                                  roleLabel = 'Landlord Invocation';
                                  roleClass = 'role-landlord';
                                } else if (isFunded || isTenantProposed || isDisputeDeclaredByTenant) {
                                  roleLabel = 'Tenant Invocation';
                                  roleClass = 'role-tenant';
                                } else if (isArbitratorResolve) {
                                  roleLabel = 'Arbitrator Invocation';
                                  roleClass = 'role-arbitrator';
                                } else if (eventStr.includes('released')) {
                                  const tenantProposedFirst = escrow.history.some(h => h.event.toLowerCase().startsWith('tenant proposed'));
                                  if (tenantProposedFirst) {
                                    roleLabel = 'Landlord Invocation';
                                    roleClass = 'role-landlord';
                                  } else {
                                    roleLabel = 'Tenant Invocation';
                                    roleClass = 'role-tenant';
                                  }
                                }
                              }

                              return (
                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', gap: '1rem', padding: '0.25rem 0' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                    <span style={{ color: 'var(--text-primary)' }}>{event.event}</span>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{new Date(event.timestamp).toLocaleString()}</span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                    {roleLabel && (
                                      <span className={`role-badge ${roleClass}`} style={{ fontSize: '0.6rem', padding: '0.1rem 0.35rem', borderRadius: '4px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>
                                        {roleLabel}
                                      </span>
                                    )}
                                    {event.txHash ? (
                                      <a 
                                        href={`https://stellar.expert/explorer/testnet/tx/${event.txHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn btn-secondary"
                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', borderRadius: '4px', textDecoration: 'none' }}
                                      >
                                        Verify Tx &rarr;
                                      </a>
                                    ) : (
                                      <a 
                                        href={`https://stellar.expert/explorer/testnet/contract/${escrow.address || DEFAULT_CONTRACT_ID}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn btn-secondary"
                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', borderRadius: '4px', textDecoration: 'none', opacity: 0.8 }}
                                      >
                                        Verify Contract &rarr;
                                      </a>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Page 3: Documentation Section */}
        {activePage === 'docs' && (
          <div className="page-section">
            <div className="workspace-grid bento-grid">
              
              {/* Smart Contract Overview */}
              <div className="bento-card bento-card-docs-intro" style={{ gridColumn: 'span 2', gridRow: 'span 3' }}>
                <h2 className="section-title">SOROBAN SMART ESCROW SPECIFICATION</h2>
                <p className="section-desc">Technical layout of the cryptographic rental deposit protocol.</p>
                <div className="docs-content">
                  <p className="docs-paragraph">
                    Deposhield uses dedicated, WASM-compiled smart contract instances deployed to the <strong>Stellar Soroban Network</strong>.
                    By committing security deposits directly to code logic rather than a single entity, the platform ensures trustless, neutral dispute backstops.
                  </p>
                  <h3 className="docs-subheading">Escrow Role Permissions</h3>
                  <div className="role-grid">
                    <div className="role-card tenant">
                      <span className="role-badge">TENANT</span>
                      <p className="role-desc">Funds the escrow on-chain. Submits move-out refund split proposals. Can trigger formal arbitrator disputes.</p>
                    </div>
                    <div className="role-card landlord">
                      <span className="role-badge landlord">LANDLORD</span>
                      <p className="role-desc">Notified of lease funding. Proposes split refunds. Reclaims allocated damages once splits match.</p>
                    </div>
                    <div className="role-card arbitrator">
                      <span className="role-badge arbitrator">ARBITRATOR</span>
                      <p className="role-desc">Acts as a neutral third-party key-holder. Resolves active disputes by submitting the final distribution split.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lifecycle Steps Guide */}
              <div className="bento-card bento-card-docs-steps" style={{ gridColumn: 'span 1', gridRow: 'span 3' }}>
                <h2 className="section-title">ESCROW LIFECYCLE</h2>
                <p className="section-desc">Stages of contract progression on-chain.</p>
                <div className="lifecycle-timeline">
                  <div className="timeline-step">
                    <div className="step-num">1</div>
                    <div className="step-info">
                      <h4>INITIALIZE</h4>
                      <p>Deploy and initialize the lease contract on-chain with parties keys.</p>
                    </div>
                  </div>
                  <div className="timeline-step">
                    <div className="step-num">2</div>
                    <div className="step-info">
                      <h4>FUND DEPOSIT</h4>
                      <p>Tenant transfers the deposit amount to contract secure custody.</p>
                    </div>
                  </div>
                  <div className="timeline-step">
                    <div className="step-num">3</div>
                    <div className="step-info">
                      <h4>NEGOTIATE SPLIT</h4>
                      <p>Submit matching split proposals. Once splits match, payouts execute.</p>
                    </div>
                  </div>
                  <div className="timeline-step">
                    <div className="step-num">4</div>
                    <div className="step-info">
                      <h4>RESOLVE DISPUTE</h4>
                      <p>If negotiation stalls, the arbitrator breaks the tie to release funds.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Examples Card */}
              <div className="bento-card bento-card-docs-examples" style={{ gridColumn: 'span 3', marginTop: '1rem' }}>
                <h2 className="section-title">DETAILED USER WALKTHROUGH EXAMPLES</h2>
                <p className="section-desc">Practical usage scenarios demonstrating trustless deposit negotiation and arbitration.</p>
                
                <div className="docs-content" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginTop: '1.5rem' }}>
                  
                  {/* Example 1: Without Arbitrator */}
                  <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '1.5rem' }}>
                    <h3 style={{ color: 'var(--color-success)', fontFamily: 'var(--font-sans)', fontSize: '1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: 0 }}>
                      🤝 EXAMPLE 1: MUTUAL RELEASE (NO ARBITRATOR)
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1rem' }}>
                      Best suited for standard move-outs where tenant and landlord are in agreement regarding refund splits (e.g., minor wear-and-tear deductions).
                    </p>
                    <ol style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6, paddingLeft: '1.15rem', margin: 0 }}>
                      <li><strong>Deploy Lease:</strong> Tenant connects via Account 1, enters Landlord and Arbitrator keys under CREATE ESCROW, locks amount, and clicks Initialize to generate a unique Lease ID.</li>
                      <li><strong>Lock Funds:</strong> Tenant goes to MANAGE ESCROW, loads the Lease ID, and clicks FUND ESCROW NOW. Funds lock inside the contract.</li>
                      <li><strong>Tenant Proposes Split:</strong> At move-out, Tenant proposes a split refund via the split slider and signs.</li>
                      <li><strong>Landlord Matches Split:</strong> Landlord switches wallet to Account 2, connects, loads same Lease ID, drags slider to match split, and submits.</li>
                      <li><strong>Instant Payout:</strong> Contract detects matching splits, immediately transfers splits on-chain, and closes the lease.</li>
                    </ol>
                  </div>

                  {/* Example 2: With Arbitrator */}
                  <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-color)', borderRadius: '16px', padding: '1.5rem' }}>
                    <h3 style={{ color: 'var(--color-error)', fontFamily: 'var(--font-sans)', fontSize: '1rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: 0 }}>
                      ⚖️ EXAMPLE 2: DISPUTED RESOLUTION (WITH ARBITRATOR)
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1rem' }}>
                      Best suited for conflicts where negotiations fail (e.g., landlord claims major paint/cleaning damage and refuses a partial refund).
                    </p>
                    <ol style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6, paddingLeft: '1.15rem', margin: 0 }}>
                      <li><strong>Setup & Fund:</strong> Tenant initializes and funds the lease using the steps in Example 1.</li>
                      <li><strong>Conflicting Proposals:</strong> Tenant proposes a 90/10 split. Landlord disagrees and proposes a 30/70 split. The interface locks input sliders and displays a "Proposals Conflict" error warning.</li>
                      <li><strong>Declare Dispute:</strong> Tenant or Landlord types a reason under RAISE DISPUTE and submits. Contract status locks to DISPUTED.</li>
                      <li><strong>Arbitrator Verdict:</strong> Arbitrator switches wallet to Account 3, connects, and loads the Lease ID. The Arbitrator-only decision slider reveals.</li>
                      <li><strong>Final Payout:</strong> The neutral Arbitrator sets the final split and clicks RESOLVE DISPUTE. The contract executes payouts and closes.</li>
                    </ol>
                  </div>
                  
                </div>
              </div>

            </div>
          </div>
        )}

      </main>

      <footer className="footer">
        <div className="footer-inner">
          <span>DEPOSHIELD POWERED BY STELLAR SOROBAN SMART CONTRACT PROTOCOL</span>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <a 
              href={`https://stellar.expert/explorer/testnet/contract/${DEFAULT_CONTRACT_ID}`} 
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn btn-secondary pill-btn footer-btn" 
              style={{ padding: '0.45rem 1rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontFamily: 'var(--font-mono)', border: '1px solid var(--border-color)', textDecoration: 'none', borderRadius: '20px' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              VIEW SHARED CONTRACT
            </a>

          </div>
          <div className="status-indicator">
            <span className="status-dot green"></span>
            <span className="status-text font-mono">TESTNET ONLINE</span>
          </div>
        </div>
      </footer>

      {/* Web3 Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type} show`}>
            <span className="toast-icon">
              {toast.type === 'success' && (
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              )}
              {toast.type === 'error' && (
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              )}
              {toast.type === 'info' && (
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-info)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              )}
            </span>
            <span className="toast-message" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span>{toast.message}</span>
              {toast.txHash && (
                <a 
                  href={`https://stellar.expert/explorer/testnet/tx/${toast.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--color-primary)', textDecoration: 'underline', fontSize: '0.72rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', marginTop: '0.15rem' }}
                >
                  Verify Transaction &rarr;
                </a>
              )}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

export default App;
