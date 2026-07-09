const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const serverless = require('serverless-http');

const app = express();

app.use(cors());
app.use(express.json());

// In serverless environments, the file system is read-only except for /tmp.
// We use a database file path that works for local testing and falls back gracefully.
const DB_FILE = path.join('/tmp', 'escrows.json');

// Helper to load escrows
const loadEscrows = () => {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading escrows database:', err);
  }
  return [];
};

// Helper to save escrows
const saveEscrows = (data) => {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving escrows database:', err);
  }
};

// Initial load (will reside in-memory for the lifetime of the warm container)
let escrows = loadEscrows();

// Helper to log notifications to console
function sendNotification(toName, toRole, message, txHash = null) {
  console.log(`\n========================================`);
  console.log(`[NOTIFICATION SYSTEM - SMS/EMAIL]`);
  console.log(`TO: ${toName} (${toRole})`);
  console.log(`MESSAGE: ${message}`);
  if (txHash) {
    console.log(`TRANSACTION VERIFICATION: https://stellar.expert/explorer/testnet/tx/${txHash}`);
  }
  console.log(`========================================\n`);
}

// Endpoints
app.get('/api/escrows', (req, res) => {
  // Always reload escrows in case we are running locally or memory has updated
  escrows = loadEscrows();
  res.json(escrows);
});

app.get('/api/escrows/:leaseId', (req, res) => {
  escrows = loadEscrows();
  const escrow = escrows.find(e => e.leaseId.toString() === req.params.leaseId);
  if (!escrow) return res.status(404).json({ error: 'Escrow not found' });
  res.json(escrow);
});

app.post('/api/escrows', (req, res) => {
  const { leaseId, address, tenant, tenantName, landlord, landlordName, arbitrator, arbitratorName, amount, title, description, txHash } = req.body;
  
  if (!leaseId || !address || !tenant || !landlord || !amount) {
    return res.status(400).json({ error: 'Missing required escrow fields' });
  }

  escrows = loadEscrows();

  const finalTxHash = txHash || req.body.txHash || (req.body.history && req.body.history[0] && req.body.history[0].txHash);

  const newEscrow = {
    leaseId,
    address,
    tenant,
    tenantName: tenantName || 'Tenant',
    landlord,
    landlordName: landlordName || 'Landlord',
    arbitrator: arbitrator || 'GAARBITRATOR77O76P6RYMFLZ26J6R74WSHU6DCOFHRFDFYJZ4TZZ2JARBI',
    arbitratorName: arbitratorName || 'Metropolitan Housing Authority',
    amount,
    status: 'Created',
    title: title || 'Rental Escrow Deposit',
    description: description || 'Security deposit for rental contract',
    history: req.body.history || [
      { timestamp: new Date().toISOString(), event: 'Escrow Created & Initialized', txHash: finalTxHash, callerRole: 'Landlord' }
    ]
  };

  escrows.push(newEscrow);
  saveEscrows(escrows);
  
  // Notify landlord of initialization
  sendNotification(newEscrow.landlordName, 'Landlord', `A new rental security deposit escrow has been initialized for you by ${newEscrow.tenantName}. Lease ID: ${leaseId}. Amount: ${amount}. Please review the terms.`, finalTxHash);

  res.status(201).json(newEscrow);
});

app.post('/api/escrows/:leaseId/fund', (req, res) => {
  const { txHash } = req.body;
  escrows = loadEscrows();
  const escrow = escrows.find(e => e.leaseId.toString() === req.params.leaseId);
  if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

  escrow.status = 'Active';
  escrow.history.push({ timestamp: new Date().toISOString(), event: 'Escrow Funded', txHash, callerRole: 'Tenant' });
  saveEscrows(escrows);

  // Notify landlord & tenant
  sendNotification(escrow.landlordName, 'Landlord', `Great news! Tenant ${escrow.tenantName} has funded the security deposit of ${escrow.amount} to Lease ID ${escrow.leaseId}. The funds are locked on-chain under mutual release rules.`, txHash);
  sendNotification(escrow.tenantName, 'Tenant', `Your deposit of ${escrow.amount} has been successfully locked in the escrow contract under Lease ID ${escrow.leaseId}.`, txHash);

  res.json(escrow);
});

app.post('/api/escrows/:leaseId/propose', (req, res) => {
  const { caller, tenantAmount, landlordAmount, txHash } = req.body;
  escrows = loadEscrows();
  const escrow = escrows.find(e => e.leaseId.toString() === req.params.leaseId);
  if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

  const callerName = caller === escrow.tenant ? escrow.tenantName : escrow.landlordName;
  const callerRole = caller === escrow.tenant ? 'Tenant' : 'Landlord';
  const otherName = caller === escrow.tenant ? escrow.landlordName : escrow.tenantName;
  const otherRole = caller === escrow.tenant ? 'Landlord' : 'Tenant';

  escrow.history.push({ 
    timestamp: new Date().toISOString(), 
    event: `${callerRole} proposed release split: Tenant: ${tenantAmount}, Landlord: ${landlordAmount}`,
    txHash,
    callerRole
  });
  saveEscrows(escrows);

  // Notify the other party
  sendNotification(otherName, otherRole, `${callerName} has proposed a release split for the security deposit: Tenant: ${tenantAmount}, Landlord: ${landlordAmount}. Please login to approve or counter-propose.`, txHash);

  res.json(escrow);
});

app.post('/api/escrows/:leaseId/release', (req, res) => {
  const { tenantAmount, landlordAmount, txHash, callerRole } = req.body;
  escrows = loadEscrows();
  const escrow = escrows.find(e => e.leaseId.toString() === req.params.leaseId);
  if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

  escrow.status = 'Released';
  escrow.history.push({ 
    timestamp: new Date().toISOString(), 
    event: `Escrow Released! (Tenant: ${tenantAmount}, Landlord: ${landlordAmount})`,
    txHash,
    callerRole: callerRole || 'Tenant'
  });
  saveEscrows(escrows);

  // Notify both
  sendNotification(escrow.tenantName, 'Tenant', `The escrow contract for Lease ID ${escrow.leaseId} has been successfully released. You received: ${tenantAmount}.`, txHash);
  sendNotification(escrow.landlordName, 'Landlord', `The escrow contract for Lease ID ${escrow.leaseId} has been successfully released. You received: ${landlordAmount}.`, txHash);

  res.json(escrow);
});

app.post('/api/escrows/:leaseId/dispute', (req, res) => {
  const { caller, reason, txHash } = req.body;
  escrows = loadEscrows();
  const escrow = escrows.find(e => e.leaseId.toString() === req.params.leaseId);
  if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

  const callerName = caller === escrow.tenant ? escrow.tenantName : escrow.landlordName;
  const callerRole = caller === escrow.tenant ? 'Tenant' : 'Landlord';

  escrow.status = 'Disputed';
  escrow.history.push({ 
    timestamp: new Date().toISOString(), 
    event: `Dispute declared by ${callerRole}. Reason: "${reason}"`,
    txHash,
    callerRole
  });
  saveEscrows(escrows);

  // Notify arbitrator & other party
  sendNotification(escrow.arbitratorName, 'Arbitrator', `A dispute has been declared by the ${callerRole} (${callerName}) on Lease ID ${escrow.leaseId}. Reason: "${reason}". Please investigate and resolve.`, txHash);
  
  const otherName = caller === escrow.tenant ? escrow.landlordName : escrow.tenantName;
  const otherRole = caller === escrow.tenant ? 'Landlord' : 'Tenant';
  sendNotification(otherName, otherRole, `A formal dispute has been declared by ${callerName} regarding your security deposit (Lease ID: ${escrow.leaseId}). The arbitrator (${escrow.arbitratorName}) has been notified.`, txHash);

  res.json(escrow);
});

app.post('/api/escrows/:leaseId/resolve', (req, res) => {
  const { tenantAmount, landlordAmount, txHash } = req.body;
  escrows = loadEscrows();
  const escrow = escrows.find(e => e.leaseId.toString() === req.params.leaseId);
  if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

  escrow.status = 'Released (Disputed)';
  escrow.history.push({ 
    timestamp: new Date().toISOString(), 
    event: `Dispute resolved by Arbitrator! (Tenant: ${tenantAmount}, Landlord: ${landlordAmount})`,
    txHash,
    callerRole: 'Arbitrator'
  });
  saveEscrows(escrows);

  // Notify both
  sendNotification(escrow.tenantName, 'Tenant', `The arbitrator has resolved the dispute for Lease ID ${escrow.leaseId}. Release split: You get: ${tenantAmount}, Landlord gets: ${landlordAmount}. Funds have been sent.`, txHash);
  sendNotification(escrow.landlordName, 'Landlord', `The arbitrator has resolved the dispute for Lease ID ${escrow.leaseId}. Release split: Tenant gets: ${tenantAmount}, You get: ${landlordAmount}. Funds have been sent.`, txHash);

  res.json(escrow);
});

module.exports = app;
module.exports.handler = serverless(app);
