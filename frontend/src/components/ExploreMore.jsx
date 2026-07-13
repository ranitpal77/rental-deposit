import React from 'react';
import './ExploreMore.css';

const PRINCIPLES = [
  {
    tag: 'Neutral custody',
    heading: 'Deposits leave both parties’ control.',
    body: 'Traditional deposits sit in a landlord-controlled account, giving one side all the leverage. DepoShield holds the funds inside the contract instead, so neither the landlord nor the tenant can move them alone.',
    rows: [
      ['No unilateral withdrawal', 'Enforced by contract'],
      ['Matched-split release', 'Both sides must agree']
    ],
    principle: 'A deposit should never sit in one party’s account.',
    cta: { label: 'Features', path: '#features' }
  },
  {
    tag: 'Auditable settlement',
    heading: 'Every action on the public ledger.',
    body: 'The frontend speaks directly to Stellar nodes and the contract code is open and verifiable. You don’t need to trust DepoShield — funding, proposals, disputes and payouts are all recorded on-chain and provable on the explorer.',
    rows: [
      ['On-chain event log', 'Permanent record'],
      ['Explorer-verifiable', 'stellar.expert links']
    ],
    principle: 'Trust the mathematics, not the middleman.',
    cta: { label: 'Read the docs', path: '/docs' }
  }
];

const ExploreMore = ({ onNavigate }) => {
  return (
    <section className="explore-section" id="explore-more">
      <div className="hp-wrap">
        <div className="section-head">
          <span className="section-eyebrow">Core protocol principles</span>
          <h2 className="section-title">Rules built to hold up in public.</h2>
          <p className="section-sub">
            Each part of the protocol is designed around one idea: no single
            party should be able to bend the outcome in their own favour.
          </p>
        </div>

        <div className="principle-rows">
          {PRINCIPLES.map((p) => (
            <article className="principle-card" key={p.tag}>
              <div className="principle-card-grid">
                {/* Left Column: Explainer details */}
                <div className="principle-card-info">
                  <span className="principle-tag">{p.tag}</span>
                  <h3 className="principle-heading">{p.heading}</h3>
                  <p className="principle-body">{p.body}</p>
                  <div className="principle-table">
                    {p.rows.map(([k, v]) => (
                      <div className="principle-tr" key={k}>
                        <span className="principle-k">{k}</span>
                        <span className="principle-v">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Column: Dark navy core-principle callout */}
                <aside className="principle-dark">
                  <div>
                    <span className="principle-dark-eyebrow">Core principle</span>
                    <p className="principle-dark-text">{p.principle}</p>
                  </div>
                  <button
                    className="principle-dark-btn"
                    onClick={() => {
                      if (p.cta.label === 'Features') {
                        const el = document.getElementById('features');
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth' });
                        }
                      } else {
                        onNavigate && onNavigate(p.cta.path);
                      }
                    }}
                  >
                    {p.cta.label}
                  </button>
                </aside>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ExploreMore;
