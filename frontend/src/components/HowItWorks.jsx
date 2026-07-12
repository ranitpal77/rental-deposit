import React, { useState, useEffect } from 'react';
import SectionHeading from './SectionHeading';
import './HowItWorks.css';

const HowItWorks = () => {
  const [activeStep, setActiveStep] = useState(0);

  const steps = [
    {
      num: 1,
      title: 'Landlord Creates Lease',
      desc: 'Landlord configures the lease terms (Lease Title, Deposit Amount, Lock Time Duration, and Tenant Address) and specifies a neutral third-party Arbitrator.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
        </svg>
      )
    },
    {
      num: 2,
      title: 'Escrow Initialized',
      desc: 'The lease escrow is registered and initialized on the Stellar Soroban network, generating a unique, secure on-chain Lease ID.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
          <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
          <line x1="6" y1="10" x2="6" y2="14" />
          <line x1="18" y1="10" x2="18" y2="14" />
        </svg>
      )
    },
    {
      num: 3,
      title: 'Tenant Funds Deposit',
      desc: 'The tenant retrieves the initialized lease on the dashboard and deposits the security deposit amount to the contract address securely.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      )
    },
    {
      num: 4,
      title: 'Tenant Submits Proposal',
      desc: 'At move-out, the tenant submits a proposed split refund (e.g. 100% to tenant, 0% to landlord) on-chain.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
      )
    },
    {
      num: 5,
      title: 'Landlord Reviews & Proposes',
      desc: 'The landlord receives notification, reviews the proposal, and either accepts the tenant split or submits their own counterproposal.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    },
    {
      num: 6,
      title: 'Automatic Settlement or Dispute',
      desc: 'If proposals match, funds are released instantly. If proposals conflict, the escrow automatically locks into a Disputed state.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      )
    },
    {
      num: 7,
      title: 'Arbitrator Verdict (If Needed)',
      desc: 'The pre-registered arbitrator evaluates both claims, decides the final split on the interactive tie-breaker dashboard, and signs.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
      )
    },
    {
      num: 8,
      title: 'Escrow Payout Released',
      desc: 'The smart contract resolves the dispute on-chain and triggers the transaction to transfer respective splits instantly to the tenant and landlord.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      )
    },
    {
      num: 9,
      title: 'Settlement History Tracked',
      desc: 'The completed lease record is archived in the settlement history ledger with explorer links for reference and receipts.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      )
    }
  ];

  useEffect(() => {
    const handleScroll = () => {
      const stepElements = document.querySelectorAll('.timeline-step-card');
      const triggerPosition = window.innerHeight * 0.65;
      
      let maxActive = 0;
      stepElements.forEach((el, index) => {
        const rect = el.getBoundingClientRect();
        if (rect.top < triggerPosition) {
          maxActive = index + 1;
        }
      });
      setActiveStep(maxActive);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <section className="how-it-works-section" id="how-it-works">
      <div className="how-it-works-container">
        <SectionHeading 
          badge="Escrow Workflow"
          title="How It Works"
          subtitle="Follow the step-by-step smart contract progression from lease initialization to settlement."
          centered={true}
        />

        <div className="timeline-flow-wrapper">
          {/* Vertical progress bar */}
          <div className="timeline-line">
            <div 
              className="timeline-line-progress"
              style={{ height: `${((activeStep - 1) / (steps.length - 1)) * 100}%` }}
            ></div>
          </div>

          <div className="timeline-steps-list">
            {steps.map((step, index) => {
              const isPassed = index + 1 <= activeStep;
              const isCurrent = index + 1 === activeStep;
              
              return (
                <div 
                  key={step.num} 
                  className={`timeline-step-card ${isPassed ? 'passed' : ''} ${isCurrent ? 'current' : ''}`}
                >
                  <div className="timeline-node-column">
                    <div className="timeline-indicator-node">
                      <div className="node-glow"></div>
                    </div>
                  </div>
                  
                  <div className="timeline-step-content">
                    <span className="step-number-tag">Step {step.num}</span>
                    <h3 className="step-title">{step.title}</h3>
                    <p className="step-description">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
