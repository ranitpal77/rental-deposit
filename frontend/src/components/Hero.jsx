import React from 'react';
import './Hero.css';
import { handleLinkClick } from '../utils/navigation';

const Hero = ({ onNavigate }) => {
  return (
    <section className="hero-section" id="home">
      <div className="hero-wrap">
        <div className="hero-grid">
          {/* Left column — message */}
          <div className="hero-lead">
            <span className="hero-eyebrow">DepoShield Protocol · Stellar Soroban</span>

            <h1 className="hero-title">
              Rental deposits<br />
              secured by neutral code.
            </h1>

            <p className="hero-description">
              DepoShield locks security deposits in an automated, non-custodial
              smart contract. No landlord-controlled accounts, no arbitrary
              deductions — funds move only on a matched split or an arbitrator's
              verdict.
            </p>

            <div className="hero-actions">
              <a
                href="/workspace"
                onClick={(e) => handleLinkClick(e, '/workspace', onNavigate)}
                className="hero-btn hero-btn-primary"
              >
                Open workspace
              </a>
              <a
                href="#explore-more"
                onClick={(e) => {
                  if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                    e.preventDefault();
                    const el = document.getElementById('explore-more');
                    if (el) {
                      el.scrollIntoView({ behavior: 'smooth' });
                    }
                  }
                }}
                className="hero-btn hero-btn-secondary"
              >
                Explore more
              </a>
            </div>
          </div>

          {/* Right column — live protocol status card */}
          <aside className="hero-status-card">
            <span className="status-card-eyebrow">Operational profile</span>
            <div className="status-card-head">
              <span className="status-card-title">Escrow protocol</span>
              <span className="status-card-live">
                <span className="live-dot"></span>
                TESTNET LIVE
              </span>
            </div>

            <ul className="status-rows">
              <li className="status-row">
                Escrow contract deployed on Soroban testnet
              </li>
              <li className="status-row">
                Neutral custody held for landlord and tenant
              </li>
              <li className="status-row">
                Arbitrator tie-break resolution available
              </li>
              <li className="status-row">
                Every action verifiable on the Stellar ledger
              </li>
            </ul>
          </aside>
        </div>
      </div>
    </section>
  );
};

export default Hero;
