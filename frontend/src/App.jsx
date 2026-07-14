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

import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import DocsPage from './pages/DocsPage';
import Workspace from './pages/Workspace';

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
  // Path Routing State
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [activeTab, setActiveTab] = useState('create');
  const [theme, setTheme] = useState('light');

  // Wallet State
  const [userAddress, setUserAddress] = useState(null);
  const [walletBalance, setWalletBalance] = useState('-- XLM');

  // Search & Manage State
  const [searchLeaseId, setSearchLeaseId] = useState('');
  const [activeEscrowDetails, setActiveEscrowDetails] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);
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

  // SPA Navigator
  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
  const [isResolving, setIsResolving] = useState(false);

  // Dashboard & Metrics State
  const [dashboardEscrows, setDashboardEscrows] = useState([]);
  const [metrics, setMetrics] = useState({
    tvl: 0,
    activeCount: 0,
    resolvedCount: 0,
    disputedCount: 0,
    resolvedVol: 0
  });

  // Toast notifications State
  const [toasts, setToasts] = useState([]);

  // Default title per notification type
  const getToastTitle = (type) => {
    switch (type) {
      case 'success': return 'Success';
      case 'error': return 'Something went wrong';
      case 'warning': return 'Heads up';
      case 'info': return 'Notice';
      default: return 'Notification';
    }
  };

  // Dismiss a toast with an exit animation before removing it
  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.map(t => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 350);
  }, []);

  // Toast Notification Helper
  const showToast = useCallback((message, type = 'success', txHash = null, title = null) => {
    const id = Date.now() + Math.random();
    // Mount hidden (entered:false) so the enter transition can play on the next frame
    setToasts(prev => [...prev, { id, message, type, txHash, title: title || getToastTitle(type), leaving: false, entered: false }]);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setToasts(prev => prev.map(t => (t.id === id ? { ...t, entered: true } : t)));
      });
    });
    setTimeout(() => {
      dismissToast(id);
    }, 5000);
  }, [dismissToast]);

  // Theme Sync on Mount — restore persisted preference (default: light)
  useEffect(() => {
    const stored = localStorage.getItem('deposhield_theme');
    const initialTheme = stored === 'dark' ? 'dark' : 'light';
    setTheme(initialTheme);
    document.body.classList.toggle('light-theme', initialTheme === 'light');
  }, []);

  const handleToggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('deposhield_theme', next);
      document.body.classList.toggle('light-theme', next === 'light');
      return next;
    });
  }, []);

  // Wallet Connection helper
  const updateWalletBalance = useCallback(async (address) => {
    const addrStr = (address && typeof address === 'object') ? address.address : address;
    if (!addrStr || typeof addrStr !== 'string') {
      setWalletBalance('-- XLM');
      return;
    }
    try {
      const res = await fetch(`https://horizon-testnet.stellar.org/accounts/${addrStr}`);
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
      console.warn('Failed to load wallet balance:', err);
      setWalletBalance('-- XLM');
    }
  }, []);

  const handleConnectWallet = useCallback(async () => {
    // Check if mock mode is requested via query param
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mock') === 'true' || window.location.search.includes('mock=true')) {
      const mockAddress = 'GB5RQIXLSAJD32EUJNIIFD23TUB74J3N54OKQUJXYODRPLR7EOKQNIWQ'; // Alan
      setUserAddress(mockAddress);
      localStorage.setItem('deposhield_connected_address', mockAddress);
      showToast('Simulated Freighter wallet connected successfully.', 'success', null, 'Wallet Connected');
      updateWalletBalance(mockAddress);
      return;
    }

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
      
      let address = null;
      if (typeof accessResult === 'string') {
        address = accessResult;
      } else if (accessResult && accessResult.address) {
        address = accessResult.address;
      }

      if (address) {
        setUserAddress(address);
        localStorage.setItem('deposhield_connected_address', address);
        showToast('Your Freighter wallet is now connected.', 'success', null, 'Wallet Connected');
        updateWalletBalance(address);
      } else {
        throw new Error('No address returned from Freighter');
      }
    } catch (err) {
      console.error('Wallet connection rejected:', err);
      showToast('Could not connect to your Freighter wallet.', 'error', null, 'Connection Failed');
    }
  }, [updateWalletBalance, showToast]);

  const handleDisconnectWallet = useCallback(() => {
    setUserAddress(null);
    setWalletBalance('-- XLM');
    localStorage.removeItem('deposhield_connected_address');
    showToast('Your wallet has been disconnected.', 'info', null, 'Wallet Disconnected');
  }, [showToast]);

  // Load wallet on mount
  useEffect(() => {
    const storedAddress = localStorage.getItem('deposhield_connected_address');
    if (storedAddress) {
      // In case storedAddress was previously saved as an object string or contains invalid formatting
      let cleanAddress = storedAddress;
      try {
        if (storedAddress.startsWith('{')) {
          const parsed = JSON.parse(storedAddress);
          cleanAddress = parsed.address || storedAddress;
        }
      } catch (e) {}

      if (cleanAddress && cleanAddress !== '[object Object]') {
        setUserAddress(cleanAddress);
        updateWalletBalance(cleanAddress);
      } else {
        localStorage.removeItem('deposhield_connected_address');
      }
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

          let leaseIdVal = null;
          try {
            if (eventName === 'init') {
              // value contains spoilered ID
            } else if (evt.topic[1]) {
              leaseIdVal = scValToNative(evt.topic[1]).toString();
            }
          } catch (e) {}

          if (leaseIdVal) {
            if (!eventTxMap[leaseIdVal]) eventTxMap[leaseIdVal] = [];
            eventTxMap[leaseIdVal].push({
              eventName,
              txHash: actualTxHash,
              value: evt.value,
              topic: evt.topic,
              ledgerClosedAt: evt.ledgerClosedAt
            });
          }
        });
      } catch (e) {
        console.warn('Failed to fetch transaction events from ledger:', e);
      }

      const escrows = allEscrows.map(escrow => {
        const key = fnv1a64(escrow.leaseId).toString();
        const leaseEvents = eventTxMap[key] || [];

        // Map events back to human readable logs
        const formattedEvents = leaseEvents.map(le => {
          let eventText = '';
          let callerRole = '';
          const leName = le.eventName;

          if (leName === 'funded') {
            eventText = 'Escrow Funded';
            callerRole = 'Tenant';
          } else if (leName === 'proposed') {
            try {
              const val = scValToNative(le.value);
              const tAmt = formatXlmAmount(Number(val[0]) / 10_000_000);
              const lAmt = formatXlmAmount(Number(val[1]) / 10_000_000);
              const callerAddr = scValToNative(le.topic[2]);
              callerRole = (callerAddr === escrow.tenant) ? 'Tenant' : 'Landlord';
              eventText = `${callerRole} proposed release split: Tenant: ${tAmt} XLM, Landlord: ${lAmt} XLM`;
            } catch (e) {
              eventText = 'Release split proposal submitted';
            }
          } else if (leName === 'disputed') {
            try {
              const reasonStr = scValToNative(le.value);
              const callerAddr = scValToNative(le.topic[2]);
              callerRole = (callerAddr === escrow.tenant) ? 'Tenant' : 'Landlord';
              eventText = `Dispute declared by ${callerRole}. Reason: "${reasonStr}"`;
            } catch (e) {
              eventText = 'Dispute declared';
            }
          } else if (leName === 'released') {
            try {
              const val = scValToNative(le.value);
              const tAmt = formatXlmAmount(Number(val[0]) / 10_000_000);
              const lAmt = formatXlmAmount(Number(val[1]) / 10_000_000);
              const typeSym = scValToNative(le.topic[2]);
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

          return {
            timestamp: le.ledgerClosedAt || new Date().toISOString(),
            event: eventText,
            txHash: le.txHash,
            callerRole
          };
        });

        // Merge existing offline history and new on-chain synced history
        const mergedHistory = [...(escrow.history || [])];
        formattedEvents.forEach(fe => {
          if (!mergedHistory.some(mh => mh.txHash === fe.txHash)) {
            mergedHistory.push(fe);
          }
        });
        mergedHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Reconstruct mutual release caller role if empty
        mergedHistory.forEach((le, idx) => {
          if (le.eventName === 'released' && !le.callerRole) {
            const firstProposer = mergedHistory.find(e => e.eventName === 'proposed');
            if (firstProposer) {
              le.callerRole = firstProposer.callerRole === 'Tenant' ? 'Landlord' : 'Tenant';
            } else {
              le.callerRole = 'Tenant'; // fallback
            }
          }
        });

        return { ...escrow, history: mergedHistory };
      });
      
      setDashboardEscrows(escrows);

      // Compute metrics based on connected wallet
      let tvl = 0;
      let activeCount = 0;
      let resolvedCount = 0;
      let disputedCount = 0;
      let resolvedVol = 0;

      if (userAddress) {
        escrows.forEach(escrow => {
          const statusLower = String(escrow.status ?? '').toLowerCase();
          const amount = parseFloat(escrow.amount) || 0;
          
          // Check role
          const isTenant = escrow.tenant === userAddress;
          const isLandlord = escrow.landlord === userAddress;
          const isArbitrator = escrow.arbitrator === userAddress;
          const isMember = isTenant || isLandlord || isArbitrator;

          if (!isMember) return;

          const isResolved = statusLower === 'released' || statusLower === 'released (disputed)' || statusLower === 'resolved' || statusLower === '3';
          const hasDisputeEvent = escrow.history && escrow.history.some(h =>
            String(h.event).toLowerCase().includes('dispute')
          );
          const hasHadDispute = statusLower === 'disputed' || statusLower === '2' || statusLower === 'released (disputed)' || statusLower === 'resolved' || hasDisputeEvent;

          if (isResolved) {
            // For resolved, apply exact display filters
            let shouldInclude = false;
            if (isTenant || isLandlord) {
              shouldInclude = true;
            } else if (isArbitrator) {
              const isDisputed = statusLower.includes('disput') || statusLower === 'resolved' || statusLower === '2' || statusLower === '3';
              shouldInclude = isDisputed || hasDisputeEvent;
            }
            
            if (shouldInclude) {
              resolvedCount++;
              resolvedVol += amount;
              if (hasHadDispute) {
                disputedCount++;
              }
            }
          } else {
            // For active/created (exclude Created/unfunded state from Active counts and TVL)
            const isCreated = statusLower === 'created' || statusLower === '0';
            if (!isCreated) {
              activeCount++;
              tvl += amount;
            }
            if (hasHadDispute) {
              disputedCount++;
            }
          }
        });
      }

      setMetrics({
        tvl,
        activeCount,
        resolvedCount,
        disputedCount,
        resolvedVol
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
      const [tenantAddr, landlordAddr, arbitratorAddr, amountValRaw, isFunded, statusRaw, unlockTimeRawSc] = await Promise.all([
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
      const unlockTime = Number(unlockTimeRawSc);

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

  const getStatusBadgeClass = (statusStr) => {
    switch (String(statusStr ?? '').toLowerCase()) {
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
    const s = String(statusStr ?? '').toLowerCase();
    if (s === 'created' || s === '0') return 'CREATED';
    if (s === 'active' || s === '1') return 'ACTIVE';
    if (s === 'disputed' || s === '2') return 'DISPUTED';
    if (s === 'released' || s === '3') return 'RELEASED';
    if (s === 'released (disputed)') return 'RELEASED (DISPUTED)';
    if (s === 'resolved') return 'RESOLVED';
    return s.toUpperCase();
  };

  // Filter lists for dashboard view
  const myEscrows = dashboardEscrows.filter(e => {
    const status = String(e.status ?? '').toLowerCase();
    return status !== 'released' && status !== 'released (disputed)' && status !== 'resolved' && status !== '3';
  });

  const historicalEscrows = dashboardEscrows.filter(e => {
    const statusLower = String(e.status).toLowerCase();
    const isResolved = statusLower === 'released' || statusLower === 'released (disputed)' || statusLower === 'resolved' || statusLower === '3';
    if (!isResolved) return false;
    
    if (e.tenant === userAddress || e.landlord === userAddress) return true;
    if (e.arbitrator === userAddress) {
      const isDisputed = statusLower.includes('disput') || statusLower === 'resolved' || statusLower === '2' || statusLower === '3';
      const hasDisputeEvent = e.history && e.history.some(h => 
        String(h.event).toLowerCase().includes('dispute')
      );
      return isDisputed || hasDisputeEvent;
    }
    return false;
  });

  return (
    <>
      {/* Background Grid Texture */}
      <div className="grid-background"></div>



      {/* Header Sticky Navigation */}
      <Navbar 
        currentPath={currentPath} 
        onNavigate={navigate}
        userAddress={userAddress}
        handleConnectWallet={handleConnectWallet}
        handleDisconnectWallet={handleDisconnectWallet}
      />

      <main className={
        (currentPath.toLowerCase() === '/workspace' || currentPath.toLowerCase() === '/dashboard')
          ? "container"
          : "main-content"
      }>
        {(() => {
          const pathLower = currentPath.toLowerCase();
          if (pathLower === '/workspace' || pathLower === '/dashboard') {
            return (
              <Workspace
                currentPath={currentPath}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                userAddress={userAddress}
                walletBalance={walletBalance}
                createFormData={createFormData}
                setCreateFormData={setCreateFormData}
                handleCreateEscrow={handleCreateEscrow}
                isCreating={isCreating}
                searchLeaseId={searchLeaseId}
                setSearchLeaseId={setSearchLeaseId}
                handleLoadEscrow={handleLoadEscrow}
                activeEscrowDetails={activeEscrowDetails}
                errorDetails={errorDetails}
                handleFundEscrow={handleFundEscrow}
                isFunding={isFunding}
                rangeSplitVal={rangeSplitVal}
                setRangeSplitVal={setRangeSplitVal}
                landlordDisputeReason={landlordDisputeReason}
                setLandlordDisputeReason={setLandlordDisputeReason}
                showDisputeReasonError={showDisputeReasonError}
                setShowDisputeReasonError={setShowDisputeReasonError}
                handleProposeSplit={handleProposeSplit}
                isProposing={isProposing}
                rangeArbVal={rangeArbVal}
                setRangeArbVal={setRangeArbVal}
                handleArbitratorDecision={handleResolveDispute}
                isResolving={isResolving}
                metrics={metrics}
                dashboardEscrows={dashboardEscrows}
                myEscrows={myEscrows}
                historicalEscrows={historicalEscrows}
                quickDurationIndex={quickDurationIndex}
                setQuickDurationIndex={setQuickDurationIndex}
                lockDurationSeconds={lockDurationSeconds}
                unlockDateTime={unlockDateTime}
                formatXlmAmount={formatXlmAmount}
                formatDateTime={formatDateTime}
                getSpoileredLeaseId={getSpoileredLeaseId}
                PREDEFINED_DURATION_LABELS={PREDEFINED_DURATION_LABELS}
                handleQuickDurationChange={syncFromSlider}
                handleUnlockDateTimeChange={syncFromDateTime}
                onNavigate={navigate}
              />
            );
          } else if (pathLower === '/docs') {
            return <DocsPage onNavigate={navigate} />;
          } else {
            return <HomePage onNavigate={navigate} />;
          }
        })()}
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-col brand-col">
            <a 
              href="/" 
              onClick={(e) => {
                e.preventDefault();
                navigate('/');
                setTimeout(() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }, 50);
              }}
              className="footer-brand-title"
              style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer', display: 'block' }}
            >
              DEPOSHIELD
            </a>
            <p className="footer-brand-desc">Decentralized, trustless security deposit escrow built on Stellar and Soroban. Safe, secure, and neutral.</p>
          </div>
          
          <div className="footer-col protocol-col">
            <span className="footer-col-title">PROTOCOL</span>
            <span className="footer-col-text">DEPOSHIELD POWERED BY STELLAR SOROBAN SMART CONTRACT PROTOCOL</span>
            <div className="footer-status-wrap">
              <div className="status-indicator">
                <span className="status-dot green"></span>
                <span className="status-text font-mono">TESTNET ONLINE</span>
              </div>
            </div>
          </div>
          
          <div className="footer-col contract-col">
            <span className="footer-col-title">VERIFICATION</span>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
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
          </div>
        </div>
        <div className="footer-bottom">
          <div className="footer-bottom-inner">
            <span>&copy; {new Date().getFullYear()} DepoShield. All rights reserved.</span>
            <span>Decentralized trustless escrow on Stellar.</span>
          </div>
        </div>
      </footer>

      {/* Web3 Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type} ${toast.leaving ? 'hide' : (toast.entered ? 'show' : '')}`} role="status" aria-live="polite">
            <span className="toast-icon">
              {toast.type === 'success' && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                  <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
              )}
              {toast.type === 'error' && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              )}
              {toast.type === 'warning' && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              )}
              {toast.type === 'info' && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="16" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
              )}
            </span>
            <span className="toast-body">
              <span className="toast-title">{toast.title}</span>
              <span className="toast-message-text">{toast.message}</span>
              {toast.txHash && (
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${toast.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="toast-verify-link"
                >
                  Verify Transaction
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '11px', height: '11px' }}>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                  </svg>
                </a>
              )}
            </span>
            <button className="toast-close" onClick={() => dismissToast(toast.id)} aria-label="Dismiss notification">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Floating Dark Mode Toggle */}
      <button
        type="button"
        className={`theme-toggle-btn ${theme === 'dark' ? 'is-dark' : 'is-light'}`}
        onClick={handleToggleTheme}
        aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      >
        <span className="theme-toggle-icon" aria-hidden="true">
          {/* Sun (shown in dark mode = tap to go light) */}
          <svg className="theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4"></circle>
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path>
          </svg>
          {/* Moon (shown in light mode = tap to go dark) */}
          <svg className="theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
          </svg>
        </span>
      </button>
    </>
  );
}

export default App;
