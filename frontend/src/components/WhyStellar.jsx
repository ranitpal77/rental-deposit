import React from 'react';
import './WhyStellar.css';

const WhyStellar = () => {
  const codeLines = [
    <span key="1"><span className="token-comment">// Initialize contract & transaction</span></span>,
    <span key="2"><span className="token-keyword">const</span> contract = <span className="token-keyword">new</span> <span className="token-type">Contract</span>(CONTRACT_ID);</span>,
    <span key="3"><span className="token-keyword">let</span> tx = <span className="token-keyword">new</span> <span className="token-type">TransactionBuilder</span>(acc, &#123; fee &#125;)</span>,
    <span key="4">  .addOperation(</span>,
    <span key="5">    contract.call(<span className="token-string">'propose_split'</span>, share)</span>,
    <span key="6">  )</span>,
    <span key="7">  .build();</span>,
    <span key="8"></span>,
    <span key="9"><span className="token-comment">// Sign transaction with Freighter wallet</span></span>,
    <span key="10">tx = <span className="token-keyword">await</span> rpc.prepareTransaction(tx);</span>,
    <span key="11"><span className="token-keyword">const</span> signed = <span className="token-keyword">await</span> <span className="token-func">signTransaction</span>(tx.toXDR());</span>
  ];

  return (
    <section className="why-stellar-section" id="why-stellar">
      <div className="hp-wrap">
        <div className="why-stellar-grid">
          
          {/* Left Column: Explanatory Content */}
          <div className="why-stellar-content">
            <span className="why-stellar-eyebrow">Why it must be on Stellar</span>
            <h2 className="why-stellar-title">
              Instant settlement. Smart contract security.
            </h2>
            <p className="why-stellar-desc">
              Stellar acts as a public ledger and neutral custodian. Funds locked inside the Soroban smart contract are protected by cryptographic rules that cannot be unilaterally bypassed, ensuring absolute neutrality for both parties.
            </p>

            <div className="why-stellar-list">
              <div className="why-stellar-item">
                <div className="why-item-icon">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <div className="why-item-content">
                  <span className="why-item-title">Sub-second speed</span>
                  <span className="why-item-text">Stellar processes payments in 2-5 seconds, ensuring fast escrow funding.</span>
                </div>
              </div>

              <div className="why-stellar-item">
                <div className="why-item-icon">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <div className="why-item-content">
                  <span className="why-item-title">Predictable cost</span>
                  <span className="why-item-text">Soroban smart contract calls require gas fees costing less than a cent.</span>
                </div>
              </div>

              <div className="why-stellar-item">
                <div className="why-item-icon">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <div className="why-item-content">
                  <span className="why-item-title">Cryptographic consensus</span>
                  <span className="why-item-text">Ledger rules guarantee neither party can unilaterally withdraw funds.</span>
                </div>
              </div>

              <div className="why-stellar-item">
                <div className="why-item-icon">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <div className="why-item-content">
                  <span className="why-item-title">Neutral security</span>
                  <span className="why-item-text">Stellar holds escrow values directly in the contract, not individual accounts.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Code Editor Mockup */}
          <div className="why-code-editor">
            <div className="why-code-header">
              <div className="mac-buttons">
                <span className="mac-dot close"></span>
                <span className="mac-dot minimize"></span>
                <span className="mac-dot expand"></span>
              </div>
            </div>
            <div className="why-code-body">
              <div className="line-numbers">
                {codeLines.map((_, i) => (
                  <span key={i}>{i + 1}</span>
                ))}
              </div>
              <pre className="code-content">
                <code>
                  {codeLines.map((line, idx) => (
                    <React.Fragment key={idx}>
                      {line}
                      {idx < codeLines.length - 1 && '\n'}
                    </React.Fragment>
                  ))}
                </code>
              </pre>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default WhyStellar;
