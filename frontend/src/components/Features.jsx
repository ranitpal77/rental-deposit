import React from 'react';
import './Features.css';

const CAPABILITIES = [
  {
    title: 'Trustless escrow',
    desc: 'Deposits are locked on-chain. Neither side can withdraw unilaterally without a matching release proposal.'
  },
  {
    title: 'Time-locked custody',
    desc: 'Programmatic time-locks hold funds for the agreed lease term and prevent premature release.'
  },
  {
    title: 'Automatic dispute detection',
    desc: 'Conflicting refund proposals move the contract into a Disputed state without any manual step.'
  },
  {
    title: 'Arbitrator resolution',
    desc: 'A pre-registered neutral third party breaks ties and signs the final split when parties disagree.'
  },
  {
    title: 'Wallet authentication',
    desc: 'Connect with the Stellar Freighter wallet and sign every state change cryptographically.'
  },
  {
    title: 'On-chain transparency',
    desc: 'Funding, proposals, splits and resolutions are permanently recorded on the Stellar ledger.'
  }
];

const Features = () => {
  return (
    <section className="features-section" id="features">
      <div className="hp-wrap">
        <div className="section-head">
          <span className="section-eyebrow">What we build</span>
          <h2 className="section-title">Infrastructure for deposit custody.</h2>
          <p className="section-sub">
            DepoShield is a focused set of contract capabilities for holding,
            releasing and resolving rental security deposits — built to stay
            neutral under pressure.
          </p>
        </div>

        <div className="cap-grid">
          {CAPABILITIES.map((c) => (
            <article className="cap-card" key={c.title}>
              <h3 className="cap-title">{c.title}</h3>
              <p className="cap-desc">{c.desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
