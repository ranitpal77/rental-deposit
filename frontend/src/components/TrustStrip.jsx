import React from 'react';
import './TrustStrip.css';

const PARTNERS = ['Stellar', 'Soroban', 'Freighter', 'stellar.expert', 'Horizon'];

const TrustStrip = () => {
  return (
    <section className="trust-section">
      <div className="hp-wrap">
        <span className="trust-eyebrow">Built on</span>
        <p className="trust-note">
          Powered by open Stellar infrastructure and audited, publicly
          verifiable smart contracts.
        </p>
        <div className="trust-logos">
          {PARTNERS.map((name) => (
            <span className="trust-logo" key={name}>{name}</span>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustStrip;
