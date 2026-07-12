import React, { useState, useEffect, useRef } from 'react';
import './Documentation.css';

const Documentation = ({ onNavigate }) => {
  const [activeSection, setActiveSection] = useState('abstract');
  const rightPanelRef = useRef(null);

  const sections = [
    { id: 'abstract', label: 'ABSTRACT' },
    { id: 'introduction', label: 'INTRODUCTION' },
    { id: 'system-architecture', label: 'SYSTEM ARCHITECTURE' },
    { id: 'use-cases', label: 'USE CASES' }
  ];

  const handleScrollToSection = (id) => {
    const el = document.getElementById(`doc-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleExploreMoreClick = (e) => {
    e.preventDefault();
    if (onNavigate) {
      onNavigate('/');
      setTimeout(() => {
        const el = document.getElementById('explore-more');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      const triggerPos = window.innerHeight * 0.3; // Trigger when heading is near top 30% of screen
      
      sections.forEach((sec) => {
        const el = document.getElementById(`doc-${sec.id}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= triggerPos && rect.bottom > triggerPos) {
            setActiveSection(sec.id);
          }
        }
      });
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="docs-layout">
      {/* Left Panel: Sticky Contents Card */}
      <aside className="docs-left-panel">
        <div className="contents-card always-open">
          <div className="contents-card-header">
            <span className="contents-label">Contents</span>
          </div>

          <ul className="contents-list">
            {sections.map((sec) => (
              <li key={sec.id}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleScrollToSection(sec.id);
                  }}
                  className={`contents-item-btn ${activeSection === sec.id ? 'active' : ''}`}
                >
                  {sec.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Right Panel: Documentation Content */}
      <main className="docs-right-panel" ref={rightPanelRef}>
        
        {/* Section 1: Abstract */}
        <section id="doc-abstract" className="doc-section">
          <div className="docs-badge-row" style={{ marginBottom: '1.75rem' }}>
            <span className="docs-badge spec">TECHNICAL SPECIFICATION</span>
            <span className="docs-badge version">v1.0.0</span>
            <span className="docs-badge status">STELLAR SOROBAN</span>
          </div>
          <div className="doc-section-heading">
            <span className="doc-section-num">1</span>
            <h2>ABSTRACT</h2>
          </div>
          <p className="doc-p">
            This specification outlines the architecture of <strong>DepoShield</strong>, a non-custodial cryptographic rental deposit escrow protocol built on the Stellar Soroban network.
            By replacing landlord-controlled savings accounts with neutral, self-executing Web3 smart contracts, the system eliminates traditional deposit reclamation friction, enforces matching release proposals, and introduces a decentralized arbitrator backstop to resolve disputes transparently.
          </p>
          
          <div className="doc-banner info">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-info)" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: '2px' }}>
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <div>
              <strong>Key takeaway:</strong> Trust is shifted from the landlord's bank account to cryptographically verifiable code logic on the Stellar network.
            </div>
          </div>
        </section>

        {/* Section 2: Introduction */}
        <section id="doc-introduction" className="doc-section">
          <div className="doc-section-heading">
            <span className="doc-section-num">2</span>
            <h2>INTRODUCTION</h2>
          </div>
          <p className="doc-p">
            In standard residential leasing agreements, the security deposit provides the landlord with recourse for physical damages or default.
            However, storing these funds in bank accounts directly controlled by landlords creates asymmetric custody leverage:
          </p>
          
          <div className="numbered-subsections">
            <div className="subsection">
              <h4>2.1 Payout Imbalance</h4>
              <p>Landlords can arbitrarily withhold deposits post-tenancy, forcing tenants into costly, delayed legal claims.</p>
            </div>
            <div className="subsection">
              <h4>2.2 Lack of Transparency</h4>
              <p>Tenants have no visibility into where their funds are stored, whether they are commingled, or if they are being held in escrow.</p>
            </div>
            <div className="subsection">
              <h4>2.3 Double Claim Discrepancies</h4>
              <p>Resolving wear-and-tear vs. physical damage often comes down to word-of-mouth rather than evidentiary validation.</p>
            </div>
          </div>
        </section>

        {/* Section 3: System Architecture */}
        <section id="doc-system-architecture" className="doc-section">
          <div className="doc-section-heading">
            <span className="doc-section-num">3</span>
            <h2>SYSTEM ARCHITECTURE</h2>
          </div>
          <p className="doc-p">
            The smart contract acts as a state machine. It guarantees that funds can only move between states when predefined consensus rules are satisfied.
          </p>

          <h3 className="doc-sub-h">3.1 State Diagram</h3>
          <div className="diagram-container">
            <div className="flow-diagram">
              <div className="flow-step">
                <span className="step-tag">0</span>
                <div className="step-icon-wrap">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                  </svg>
                </div>
                <strong>Unfunded</strong>
                <p>Lease created, awaiting deposit funding</p>
              </div>
              <div className="flow-arrow">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </div>
              <div className="flow-step">
                <span className="step-tag">1</span>
                <div className="step-icon-wrap">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                </div>
                <strong>Active / Locked</strong>
                <p>Deposit locked under secure time-lock</p>
              </div>
              <div className="flow-arrow">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </div>
              <div className="flow-step">
                <span className="step-tag">2</span>
                <div className="step-icon-wrap">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                </div>
                <strong>Disputed</strong>
                <p>Conflicting split proposals submitted</p>
              </div>
              <div className="flow-arrow">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </div>
              <div className="flow-step">
                <span className="step-tag">3</span>
                <div className="step-icon-wrap">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                </div>
                <strong>Settled</strong>
                <p>Escrow distributed on-chain</p>
              </div>
            </div>
          </div>

          <h3 className="doc-sub-h">3.2 Soroban Smart Contract Entrypoints</h3>
          <div className="table-wrapper">
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Function</th>
                  <th>Invoker</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>initialize</code></td>
                  <td>Landlord</td>
                  <td>Deploys contract instance with Tenant, Landlord, and Arbitrator keys.</td>
                </tr>
                <tr>
                  <td><code>fund_escrow</code></td>
                  <td>Tenant</td>
                  <td>Locks deposit token balance into contract secure custody.</td>
                </tr>
                <tr>
                  <td><code>propose_split</code></td>
                  <td>Tenant / Landlord</td>
                  <td>Submits split proposal. Matching proposals trigger automatic settlement.</td>
                </tr>
                <tr>
                  <td><code>resolve_dispute</code></td>
                  <td>Arbitrator</td>
                  <td>Executes final split distribution if proposals conflict and dispute is raised.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3 className="doc-sub-h">3.3 Rust Smart Contract Snippet</h3>
          <div className="doc-code-block-wrapper">
            <div className="doc-code-block-header">
              <div className="mac-buttons">
                <span className="mac-dot close"></span>
                <span className="mac-dot minimize"></span>
                <span className="mac-dot expand"></span>
              </div>
              <span className="code-lang">rust (stellar-soroban-sdk)</span>
            </div>
            <div className="doc-code-block">
              <pre>
                <code>
                  <span className="token-annotation">#[contractimpl]</span>{"\n"}
                  <span className="token-keyword">impl</span> <span className="token-type">RentalEscrow</span> &#123;{"\n"}
                  {"    "}<span className="token-keyword">pub fn</span> <span className="token-func">propose_split</span>(env: <span className="token-type">Env</span>, caller: <span className="token-type">Address</span>, tenant_share: <span className="token-type">i128</span>) &#123;{"\n"}
                  {"        "}caller.<span className="token-func">require_auth</span>();{"\n"}
                  {"        "}<span className="token-keyword">let</span> state = <span className="token-func">get_state</span>(&amp;env);{"\n"}
                  {"        "}<span className="token-func">assert_eq!</span>(state.status, <span className="token-type">Status</span>::Active);{"\n"}
                  {"        "}{"\n"}
                  {"        "}<span className="token-comment">// Save proposal to contract storage</span>{"\n"}
                  {"        "}<span className="token-func">save_proposal</span>(&amp;env, &amp;caller, tenant_share);{"\n"}
                  {"        "}{"\n"}
                  {"        "}<span className="token-comment">// Match checking</span>{"\n"}
                  {"        "}<span className="token-keyword">if</span> <span className="token-func">match_proposals</span>(&amp;env) &#123;{"\n"}
                  {"            "}<span className="token-func">execute_payout</span>(&amp;env);{"\n"}
                  {"        "}&#125;{"\n"}
                  {"    "}&#125;{"\n"}
                  &#125;
                </code>
              </pre>
            </div>
          </div>
        </section>

        {/* Section 4: Use Cases */}
        <section id="doc-use-cases" className="doc-section">
          <div className="doc-section-heading">
            <span className="doc-section-num">4</span>
            <h2>USE CASES</h2>
          </div>
          
          <div className="use-cases-grid">
            <div className="use-case-card">
              <div className="use-case-header">
                <div className="use-case-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                </div>
                <h4>4.1 Case A: Mutual Release (Consensus Split)</h4>
                <span className="use-case-tag">AUTOMATED CONSENSUS</span>
              </div>
              <p>
                Upon lease expiration, the tenant proposes a refund split returning 90% of the funds to themselves and 10% to the landlord to cover minor wear-and-tear damages. 
                The landlord reviews the proposal on the dashboard and agrees. 
                Once the landlord signs the matching split, the contract executes the payouts instantly on-chain.
              </p>
            </div>

            <div className="use-case-card">
              <div className="use-case-header">
                <div className="use-case-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                </div>
                <h4>4.2 Case B: Conflicting Proposals & Arbitrator Verdict</h4>
                <span className="use-case-tag">DECENTRALIZED ARBITRATION</span>
              </div>
              <p>
                The tenant proposes a 100/0 split. The landlord claims significant carpet stains and submits a 40/60 split instead. 
                The contract detects the conflict, locks further user slider inputs, and prompts the parties to raise a formal dispute. 
                Once the dispute is raised, the arbitrator reviews the evidence (photos/receipts) and submits a binding split (e.g. 70/30). 
                The contract executes the arbitrator's verdict, distributing the funds accordingly.
              </p>
            </div>
          </div>
        </section>

        {/* Footer Buttons */}
        <div className="docs-footer-buttons">
          <a href="/#explore-more" onClick={handleExploreMoreClick} className="btn btn-primary pill-btn docs-footer-btn">
            Explore More
          </a>
          <a href="https://github.com/ranitpal77/rental-deposit" target="_blank" rel="noopener noreferrer" className="btn btn-secondary pill-btn docs-footer-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.35rem', verticalAlign: 'middle' }}>
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
            </svg>
            GitHub
          </a>
        </div>

      </main>
    </div>
  );
};

export default Documentation;
