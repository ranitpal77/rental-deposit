const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// In-memory database of escrows
let escrows = [
  {
    address: 'CD3W5QYXZP44B36OHTQJ3SGWEXJZQHLM3UMLWNEI6I5VNZR6NDUULQPL',
    tenant: 'GD7HBP77O76P6RYMFLZ26J6R74WSHU6DCOFHRFDFYJZ4TZZ2J4E2PWTN',
    tenantName: 'Alex Mercer (Tenant)',
    landlord: 'GB543SZG2HMLW6WJ56TCR5UHQEHLCOHRFDFYJZ4TZZ2J4E2PLANDLORD',
    landlordName: 'Sarah Jenkins (Landlord)',
    arbitrator: 'GAARBITRATOR77O76P6RYMFLZ26J6R74WSHU6DCOFHRFDFYJZ4TZZ2JARBI',
    arbitratorName: 'Metropolitan Housing Authority',
    amount: '800 XLM',
    status: 'Active',
    title: 'Apartment 4B - Greenview Heights',
    description: 'Security deposit for lease contract active from July 2026.',
    history: [
      { timestamp: new Date(Date.now() - 3600000 * 24).toISOString(), event: 'Escrow Created on-chain' },
      { timestamp: new Date(Date.now() - 3600000 * 23).toISOString(), event: 'Escrow Funded by Tenant (800 XLM)' }
    ]
  }
];

// Helper to log notifications to console
function sendNotification(toName, toRole, message) {
  console.log(`\n========================================`);
  console.log(`[NOTIFICATION SYSTEM - SMS/EMAIL]`);
  console.log(`TO: ${toName} (${toRole})`);
  console.log(`MESSAGE: ${message}`);
  console.log(`========================================\n`);
}

// Endpoints
app.get('/api/escrows', (req, res) => {
  res.json(escrows);
});

app.get('/api/escrows/:address', (req, res) => {
  const escrow = escrows.find(e => e.address === req.params.address);
  if (!escrow) return res.status(404).json({ error: 'Escrow not found' });
  res.json(escrow);
});

app.post('/api/escrows', (req, res) => {
  const { address, tenant, tenantName, landlord, landlordName, arbitrator, arbitratorName, amount, title, description } = req.body;
  
  if (!address || !tenant || !landlord || !amount) {
    return res.status(400).json({ error: 'Missing required escrow fields' });
  }

  const newEscrow = {
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
    history: [
      { timestamp: new Date().toISOString(), event: 'Escrow Created & Initialized' }
    ]
  };

  escrows.push(newEscrow);
  
  // Notify landlord of initialization
  sendNotification(newEscrow.landlordName, 'Landlord', `A new rental security deposit escrow has been initialized for you by ${newEscrow.tenantName}. Escrow Contract: ${address}. Amount: ${amount}. Please review the terms.`);

  res.status(201).json(newEscrow);
});

app.post('/api/escrows/:address/fund', (req, res) => {
  const escrow = escrows.find(e => e.address === req.params.address);
  if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

  escrow.status = 'Active';
  escrow.history.push({ timestamp: new Date().toISOString(), event: 'Escrow Funded' });

  // Notify landlord & tenant
  sendNotification(escrow.landlordName, 'Landlord', `Great news! Tenant ${escrow.tenantName} has funded the security deposit of ${escrow.amount} to escrow contract ${escrow.address}. The funds are locked on-chain under mutual release rules.`);
  sendNotification(escrow.tenantName, 'Tenant', `Your deposit of ${escrow.amount} has been successfully locked in the escrow contract ${escrow.address}.`);

  res.json(escrow);
});

app.post('/api/escrows/:address/propose', (req, res) => {
  const { caller, tenantAmount, landlordAmount } = req.body;
  const escrow = escrows.find(e => e.address === req.params.address);
  if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

  const callerName = caller === escrow.tenant ? escrow.tenantName : escrow.landlordName;
  const callerRole = caller === escrow.tenant ? 'Tenant' : 'Landlord';
  const otherName = caller === escrow.tenant ? escrow.landlordName : escrow.tenantName;
  const otherRole = caller === escrow.tenant ? 'Landlord' : 'Tenant';

  escrow.history.push({ 
    timestamp: new Date().toISOString(), 
    event: `${callerRole} proposed release split: Tenant: ${tenantAmount}, Landlord: ${landlordAmount}` 
  });

  // Notify the other party
  sendNotification(otherName, otherRole, `${callerName} has proposed a release split for the security deposit: Tenant: ${tenantAmount}, Landlord: ${landlordAmount}. Please login to approve or counter-propose.`);

  res.json(escrow);
});

app.post('/api/escrows/:address/release', (req, res) => {
  const { tenantAmount, landlordAmount } = req.body;
  const escrow = escrows.find(e => e.address === req.params.address);
  if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

  escrow.status = 'Released';
  escrow.history.push({ 
    timestamp: new Date().toISOString(), 
    event: `Escrow Released! (Tenant: ${tenantAmount}, Landlord: ${landlordAmount})` 
  });

  // Notify both
  sendNotification(escrow.tenantName, 'Tenant', `The escrow contract ${escrow.address} has been successfully released. You received: ${tenantAmount}.`);
  sendNotification(escrow.landlordName, 'Landlord', `The escrow contract ${escrow.address} has been successfully released. You received: ${landlordAmount}.`);

  res.json(escrow);
});

app.post('/api/escrows/:address/dispute', (req, res) => {
  const { caller, reason } = req.body;
  const escrow = escrows.find(e => e.address === req.params.address);
  if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

  const callerName = caller === escrow.tenant ? escrow.tenantName : escrow.landlordName;
  const callerRole = caller === escrow.tenant ? 'Tenant' : 'Landlord';

  escrow.status = 'Disputed';
  escrow.history.push({ 
    timestamp: new Date().toISOString(), 
    event: `Dispute declared by ${callerRole}. Reason: "${reason}"` 
  });

  // Notify arbitrator & other party
  sendNotification(escrow.arbitratorName, 'Arbitrator', `A dispute has been declared by the ${callerRole} (${callerName}) on escrow ${escrow.address}. Reason: "${reason}". Please investigate and resolve.`);
  
  const otherName = caller === escrow.tenant ? escrow.landlordName : escrow.tenantName;
  const otherRole = caller === escrow.tenant ? 'Landlord' : 'Tenant';
  sendNotification(otherName, otherRole, `A formal dispute has been declared by ${callerName} regarding your security deposit. The arbitrator (${escrow.arbitratorName}) has been notified.`);

  res.json(escrow);
});

app.post('/api/escrows/:address/resolve', (req, res) => {
  const { tenantAmount, landlordAmount } = req.body;
  const escrow = escrows.find(e => e.address === req.params.address);
  if (!escrow) return res.status(404).json({ error: 'Escrow not found' });

  escrow.status = 'Released (Disputed)';
  escrow.history.push({ 
    timestamp: new Date().toISOString(), 
    event: `Dispute resolved by Arbitrator! (Tenant: ${tenantAmount}, Landlord: ${landlordAmount})` 
  });

  // Notify both
  sendNotification(escrow.tenantName, 'Tenant', `The arbitrator has resolved the dispute for escrow ${escrow.address}. Release split: You get: ${tenantAmount}, Landlord gets: ${landlordAmount}. Funds have been sent.`);
  sendNotification(escrow.landlordName, 'Landlord', `The arbitrator has resolved the dispute for escrow ${escrow.address}. Release split: Tenant gets: ${tenantAmount}, You get: ${landlordAmount}. Funds have been sent.`);

  res.json(escrow);
});

app.listen(PORT, () => {
  console.log(`Rental Escrow backend running on port ${PORT}`);
});
