import React from 'react';
import './StatsBand.css';

const STATS = [
  { value: '100%', label: 'Non-custodial custody', desc: 'Deposits are held by the contract, never a private account.' },
  { value: '0', label: 'Arbitrary deductions', desc: 'No party can unilaterally withhold or drain locked funds.' },
  { value: '2 of 2', label: 'Signatures to release', desc: 'Funds move only when both sides submit a matching split.' },
  { value: '24/7', label: 'On-chain availability', desc: 'Settlement runs continuously on the Stellar network.' }
];

const StatsBand = () => {
  return (
    <section className="stats-section">
      <div className="hp-wrap">
        <div className="stats-head">
          <h2 className="stats-title">These deposits are protected on-chain.</h2>
          <p className="stats-sub">
            DepoShield operates neutral escrow at protocol level. The rules are
            enforced by code that neither the landlord nor the tenant can
            override.
          </p>
        </div>

        <div className="stats-grid">
          {STATS.map((s) => (
            <div className="stat-cell" key={s.label}>
              <span className="stat-value">{s.value}</span>
              <span className="stat-label">{s.label}</span>
              <p className="stat-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default StatsBand;
