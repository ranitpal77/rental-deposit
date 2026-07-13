import React from 'react';
import './Workspace.css';

const DEFAULT_CONTRACT_ID = 'CBFMZXLLIW2JUUWOC4ZQEJWRQCIGJEY34SHCVUDVIZ7NFVONF3G63LO6';

const getStatusBadgeClass = (statusStr) => {
  switch (String(statusStr || '').toLowerCase()) {
    case 'active':
    case '1':
      return 'status-active';
    case 'disputed':
    case '2':
      return 'status-disputed';
    case 'created':
    case '0':
      return 'status-created';
    case 'released':
    case 'released (disputed)':
    case 'resolved':
    case '3':
      return 'status-released';
    default: return 'status-released';
  }
};

const getStatusLabel = (statusStr) => {
  const s = String(statusStr || '').toLowerCase();
  if (s === 'created' || s === '0') return 'CREATED';
  if (s === 'active' || s === '1') return 'ACTIVE';
  if (s === 'disputed' || s === '2') return 'DISPUTED';
  if (s === 'released' || s === '3') return 'RELEASED';
  if (s === 'released (disputed)') return 'RELEASED (DISPUTED)';
  if (s === 'resolved') return 'RESOLVED';
  return s.toUpperCase();
};

const Workspace = ({
  currentPath,
  activeTab,
  setActiveTab,
  userAddress,
  walletBalance,
  createFormData,
  setCreateFormData,
  handleCreateEscrow,
  isCreating,
  searchLeaseId,
  setSearchLeaseId,
  handleLoadEscrow,
  activeEscrowDetails,
  errorDetails,
  handleFundEscrow,
  isFunding,
  rangeSplitVal,
  setRangeSplitVal,
  landlordDisputeReason,
  setLandlordDisputeReason,
  showDisputeReasonError,
  setShowDisputeReasonError,
  handleProposeSplit,
  isProposing,
  rangeArbVal,
  setRangeArbVal,
  handleArbitratorDecision,
  isResolving,
  metrics,
  dashboardEscrows,
  quickDurationIndex,
  lockDurationSeconds,
  unlockDateTime,
  formatXlmAmount,
  formatDateTime,
  getSpoileredLeaseId,
  PREDEFINED_DURATION_LABELS,
  handleQuickDurationChange,
  handleUnlockDateTimeChange,
  onNavigate
}) => {
  const isDashboardPage = currentPath.toLowerCase() === '/dashboard';

  if (isDashboardPage) {
    return (
      <div className="page-section">
        <div className="dashboard-grid bento-grid" style={{ marginTop: '0' }}>

          {/* Platform Metrics Card */}
          <div className="bento-card bento-card-metrics" style={{ gridColumn: 'span 1', gridRow: 'span 3' }}>
            <h2 className="section-title">PLATFORM PERFORMANCE</h2>
            <p className="section-desc">Real-time stats across all smart contract instances.</p>

            <div className="metrics-stack">
              <div className="metric-item">
                <span className="metric-label">TOTAL VOLUME LOCKED</span>
                <span className="address-mono metric-value">{`${metrics.tvl} XLM`}</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">ACTIVE CONTRACTS</span>
                <span className="address-mono metric-value">{metrics.activeCount}</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">TOTAL RESOLVED LEASES</span>
                <span className="address-mono metric-value">{metrics.resolvedCount}</span>
              </div>
              <div className="metric-item">
                <span className="metric-label">ON-CHAIN DISPUTES</span>
                <span className="address-mono metric-value">{metrics.disputedCount}</span>
              </div>
            </div>
          </div>

          {/* Live Escrow Dashboard */}
          <div className="bento-card bento-card-dashboard" style={{ gridColumn: 'span 2', gridRow: 'span 3' }}>
            <h2 className="section-title">ACTIVE AGENTS / PLATFORM DASHBOARD</h2>
            <p className="section-desc">Current escrows tracked by the platform backend coordinator.</p>

            <div className="escrow-list">
              {!userAddress ? (
                <div className="dashboard-placeholder">Please connect your wallet to view your active escrows.</div>
              ) : (() => {
                const activeEscrows = dashboardEscrows.filter(e => {
                  const status = String(e.status || '').toLowerCase();
                  const isNotResolved = status !== 'released' && status !== 'released (disputed)' && status !== 'resolved' && status !== '3';
                  if (!isNotResolved) return false;
                  return e.tenant === userAddress || e.landlord === userAddress || e.arbitrator === userAddress;
                });

                if (activeEscrows.length === 0) {
                  return <div className="dashboard-placeholder">No active escrows registered for this wallet.</div>;
                }

                return activeEscrows.map(escrow => (
                  <div
                    key={escrow.leaseId}
                    className="escrow-row"
                    onClick={() => {
                      onNavigate('/workspace');
                      setActiveTab('manage');
                      setSearchLeaseId(escrow.leaseId);
                      handleLoadEscrow(escrow.leaseId);
                    }}
                  >
                    <div className="escrow-row-meta">
                      <span className="escrow-row-title">{escrow.title}</span>
                      <span className="escrow-row-address address-mono text-truncate" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        Tenant: <strong>{escrow.tenantName || 'Tenant'}</strong> | Landlord: <strong>{escrow.landlordName || 'Landlord'}</strong>
                      </span>
                      <span className="escrow-row-address address-mono text-truncate">{`Lease ID: ${escrow.leaseId}`}</span>
                    </div>
                    <div className="escrow-row-stats">
                      <span className="escrow-row-amount address-mono">{escrow.amount}</span>
                      <span className={`badge-status ${getStatusBadgeClass(escrow.status)}`}>{getStatusLabel(escrow.status)}</span>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Resolved Settlements Dashboard */}
          <div className="bento-card bento-card-resolved" style={{ gridColumn: 'span 3', gridRow: 'span 3', marginTop: '1.5rem' }}>
            <h2 className="section-title">RESOLVED SETTLEMENTS & DEPOSIT PAYOUTS</h2>
            <p className="section-desc">Historical timeline and final on-chain payout distributions.</p>
            <div className="escrow-list">
              {!userAddress ? (
                <div className="dashboard-placeholder">Please connect your wallet to view historical resolutions.</div>
              ) : (() => {
                const resolvedEscrows = dashboardEscrows.filter(e => {
                  const statusLower = String(e.status).toLowerCase();
                  const isResolved = statusLower === 'released' || statusLower === 'released (disputed)' || statusLower === 'resolved' || statusLower === '3';
                  if (!isResolved) return false;

                  // Filter based on connected wallet role
                  if (e.tenant === userAddress) {
                    return true;
                  }
                  if (e.landlord === userAddress) {
                    return true;
                  }
                  if (e.arbitrator === userAddress) {
                    const isDisputed = statusLower.includes('disput') || statusLower === 'resolved' || statusLower === '2' || statusLower === '3';
                    const hasDisputeEvent = e.history && e.history.some(h =>
                      String(h.event).toLowerCase().includes('dispute')
                    );
                    return isDisputed || hasDisputeEvent;
                  }
                  return false;
                });

                if (resolvedEscrows.length === 0) {
                  return <div className="dashboard-placeholder">No resolved escrows registered for this wallet.</div>;
                }

                return resolvedEscrows.map(escrow => (
                  <div
                    key={escrow.leaseId}
                    className="escrow-row resolved-escrow-row"
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem', cursor: 'default', height: 'auto', padding: '1.25rem' }}
                  >
                    {/* Title & Status Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        <span className="escrow-row-title" style={{ fontSize: '0.95rem' }}>{escrow.title}</span>
                        <span className="escrow-row-address address-mono">{`Lease ID: ${getSpoileredLeaseId(escrow.leaseId)}`}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span className="escrow-row-amount address-mono" style={{ fontSize: '1rem', fontWeight: 700 }}>{escrow.amount}</span>
                        <span className={`badge-status ${getStatusBadgeClass(escrow.status)}`}>
                          {getStatusLabel(escrow.status)}
                        </span>
                      </div>
                    </div>

                    {/* Participants context */}
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                      <span>Tenant: <strong style={{ color: 'var(--text-primary)' }}>{escrow.tenantName}</strong></span>
                      <span>Landlord: <strong style={{ color: 'var(--text-primary)' }}>{escrow.landlordName}</strong></span>
                    </div>

                    {/* Timeline */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'left', marginTop: '0.25rem' }}>
                      <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--color-info)', letterSpacing: '0.05em', fontWeight: 700 }}>
                        ON-CHAIN INVOCATIONS TIMELINE & VERIFICATION
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', paddingLeft: '0.5rem', borderLeft: '2px solid var(--border-color)' }}>
                        {escrow.history && escrow.history.map((event, idx) => {
                          let roleLabel = '';
                          let roleClass = '';

                          if (event.callerRole) {
                            if (event.callerRole === 'Tenant') {
                              roleLabel = 'Tenant Invocation';
                              roleClass = 'role-tenant';
                            } else if (event.callerRole === 'Landlord') {
                              roleLabel = 'Landlord Invocation';
                              roleClass = 'role-landlord';
                            } else if (event.callerRole === 'Arbitrator') {
                              roleLabel = 'Arbitrator Invocation';
                              roleClass = 'role-arbitrator';
                            }
                          } else {
                            const eventStr = event.event.toLowerCase();
                            const isCreated = eventStr.includes('created') || eventStr.includes('initialized');
                            const isFunded = eventStr.includes('funded');
                            const isTenantProposed = eventStr.startsWith('tenant proposed');
                            const isLandlordProposed = eventStr.startsWith('landlord proposed');
                            const isDisputeDeclaredByTenant = eventStr.includes('dispute declared by tenant');
                            const isDisputeDeclaredByLandlord = eventStr.includes('dispute declared by landlord');
                            const isArbitratorResolve = eventStr.includes('dispute resolved') || eventStr.includes('arbitrator');

                            if (isCreated || isLandlordProposed || isDisputeDeclaredByLandlord) {
                              roleLabel = 'Landlord Invocation';
                              roleClass = 'role-landlord';
                            } else if (isFunded || isTenantProposed || isDisputeDeclaredByTenant) {
                              roleLabel = 'Tenant Invocation';
                              roleClass = 'role-tenant';
                            } else if (isArbitratorResolve) {
                              roleLabel = 'Arbitrator Invocation';
                              roleClass = 'role-arbitrator';
                            } else if (eventStr.includes('released')) {
                              const tenantProposedFirst = escrow.history.some(h => h.event.toLowerCase().startsWith('tenant proposed'));
                              if (tenantProposedFirst) {
                                roleLabel = 'Landlord Invocation';
                                roleClass = 'role-landlord';
                              } else {
                                roleLabel = 'Tenant Invocation';
                                roleClass = 'role-tenant';
                              }
                            }
                          }

                          return (
                            <div key={idx} className="timeline-event-row" style={{ fontSize: '0.75rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0 }}>
                                <span style={{ color: 'var(--text-primary)' }}>{event.event}</span>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{new Date(event.timestamp).toLocaleString()}</span>
                              </div>
                              <div className="timeline-event-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                {roleLabel && (
                                  <span className={`role-badge ${roleClass}`} style={{ fontSize: '0.6rem', padding: '0.1rem 0.35rem', borderRadius: '4px', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>
                                    {roleLabel}
                                  </span>
                                )}
                                {event.txHash ? (
                                  <a
                                    href={`https://stellar.expert/explorer/testnet/tx/${event.txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-secondary"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', borderRadius: '4px', textDecoration: 'none' }}
                                  >
                                    Verify Tx &rarr;
                                  </a>
                                ) : (
                                  <a
                                    href={`https://stellar.expert/explorer/testnet/contract/${escrow.address || DEFAULT_CONTRACT_ID}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-secondary"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem', fontFamily: 'var(--font-mono)', borderRadius: '4px', textDecoration: 'none', opacity: 0.8 }}
                                  >
                                    Verify Contract &rarr;
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>

        </div>
      </div>
    );
  }

  // Workspace Page
  return (
    <div className="page-section">
      <div className={`workspace-grid bento-grid ${userAddress ? 'wallet-connected' : ''}`}>

        {/* Wallet Status Card (hidden when not connected) */}
        {userAddress && (
          <div className="bento-card bento-card-wallet">
            <h2 className="section-title">CONNECTED WALLET STATUS</h2>
            <p className="section-desc">Details and real-time balance of the active Freighter wallet account.</p>

            <div className="escrow-stats" style={{ marginBottom: 0 }}>
              <div className="stat-item">
                <span className="stat-label">ACCOUNT ADDRESS</span>
                <span className="address-mono stat-value text-truncate">
                  {userAddress ? `${userAddress.slice(0, 8)}...${userAddress.slice(-8)}` : '--'}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">NATIVE XLM BALANCE</span>
                <span className="address-mono stat-value">{walletBalance}</span>
              </div>
            </div>
          </div>
        )}

        {/* Main Workspace Card */}
        <div className="bento-card bento-card-workspace">
          <div className="tab-control">
            <button
              onClick={() => setActiveTab('create')}
              className={`tab-btn ${activeTab === 'create' ? 'active' : ''}`}
            >
              CREATE ESCROW
            </button>
            <button
              onClick={() => setActiveTab('manage')}
              className={`tab-btn ${activeTab === 'manage' ? 'active' : ''}`}
            >
              MANAGE ESCROW
            </button>
          </div>

          {/* Create Escrow Panel */}
          {activeTab === 'create' && (
            <div className="workspace-panel">
              <h2 className="section-title">INITIALIZE NEW LEASE</h2>
              <p className="section-desc">Set up a secure escrow contract instance. The tenant will fund it, and release conditions will lock it.</p>

              <form onSubmit={handleCreateEscrow} className="form-container">

                <div className="form-group">
                  <label htmlFor="input-title">LEASE TITLE</label>
                  <input
                    type="text"
                    id="input-title"
                    placeholder="e.g., APARTMENT 4B - GREENVIEW HEIGHTS"
                    required
                    value={createFormData.title}
                    onChange={(e) => setCreateFormData({ ...createFormData, title: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="input-desc">LEASE DESCRIPTION</label>
                  <textarea
                    id="input-desc"
                    placeholder="Detail move-in dates, terms, or conditions..."
                    rows="6"
                    value={createFormData.desc}
                    onChange={(e) => setCreateFormData({ ...createFormData, desc: e.target.value })}
                  />
                </div>

                <div className="form-grid form-grid-stack">
                  <div className="form-group">
                    <label htmlFor="input-tenant">TENANT PUBLIC KEY</label>
                    <input
                      type="text"
                      id="input-tenant"
                      className="address-mono"
                      placeholder="GD..."
                      required
                      value={createFormData.tenant}
                      onChange={(e) => setCreateFormData({ ...createFormData, tenant: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="input-arbitrator">ARBITRATOR PUBLIC KEY</label>
                    <input
                      type="text"
                      id="input-arbitrator"
                      className="address-mono"
                      placeholder="GA..."
                      required
                      value={createFormData.arbitrator}
                      onChange={(e) => setCreateFormData({ ...createFormData, arbitrator: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="input-amount">DEPOSIT AMOUNT (XLM)</label>
                    <input
                      type="number"
                      id="input-amount"
                      placeholder="e.g., 500"
                      required
                      min="1"
                      value={createFormData.amount}
                      onChange={(e) => setCreateFormData({ ...createFormData, amount: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="select-token">TOKEN ASSET</label>
                    <select
                      id="select-token"
                      value={createFormData.token}
                      onChange={(e) => setCreateFormData({ ...createFormData, token: e.target.value })}
                    >
                      <option value="native">XLM (Native Stellar)</option>
                      <option value="usdc">USDC (Stellar Anchor)</option>
                    </select>
                  </div>
                </div>

                {/* Escrow Lock Duration Options */}
                <div style={{ marginTop: '1.5rem', marginBottom: '1.5rem', padding: '1.25rem', border: '1px solid var(--border-color)', borderRadius: '16px', background: 'var(--surface-color-light)' }}>
                  <h4 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-primary)', marginBottom: '1rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-info)' }}>
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    SECURITY DEPOSIT TIME-LOCK CONFIGURATION
                  </h4>

                  <div className="form-grid" style={{ marginBottom: '1.25rem' }}>
                    <div className="form-group">
                      <label htmlFor="input-unlock-time">UNLOCK DATE & TIME</label>
                      <input
                        type="datetime-local"
                        id="input-unlock-time"
                        required
                        value={unlockDateTime}
                        onChange={(e) => handleUnlockDateTimeChange(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="input-lock-seconds">LOCK DURATION (SECONDS)</label>
                      <input
                        type="number"
                        id="input-lock-seconds"
                        placeholder="e.g., 86400"
                        required
                        min="1"
                        value={lockDurationSeconds === 0 ? '0' : Number(lockDurationSeconds).toString()}
                        onChange={(e) => handleUnlockDateTimeChange(new Date(Date.now() + Number(e.target.value) * 1000).toISOString().slice(0, 16))}
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <label style={{ margin: 0 }}>QUICK LOCK DURATION SELECTOR</label>
                      <span className="address-mono" style={{ fontSize: '0.75rem', color: 'var(--color-info)', fontWeight: 600 }}>
                        {PREDEFINED_DURATION_LABELS[quickDurationIndex]} ({lockDurationSeconds.toLocaleString()} seconds)
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="7"
                      value={quickDurationIndex}
                      onChange={(e) => handleQuickDurationChange(e.target.value)}
                      className="split-slider"
                      style={{ margin: '0.5rem 0' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      <span>30s</span>
                      <span>5m</span>
                      <span>1h</span>
                      <span>1d</span>
                      <span>1w</span>
                      <span>1m</span>
                      <span>6m</span>
                      <span>1y</span>
                    </div>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="input-tenant-name">TENANT NAME (FOR NOTIFICATION)</label>
                  <input
                    type="text"
                    id="input-tenant-name"
                    placeholder="Your Name"
                    required
                    value={createFormData.tenantName}
                    onChange={(e) => setCreateFormData({ ...createFormData, tenantName: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="input-landlord-name">LANDLORD NAME (FOR NOTIFICATION)</label>
                  <input
                    type="text"
                    id="input-landlord-name"
                    placeholder="Landlord Name"
                    required
                    value={createFormData.landlordName}
                    onChange={(e) => setCreateFormData({ ...createFormData, landlordName: e.target.value })}
                  />
                </div>

                <button type="submit" disabled={isCreating} className="btn btn-primary btn-full pill-btn">
                  {isCreating ? 'PROPOSING LEASE INITIALIZATION...' : 'INITIALIZE ESCROW ON-CHAIN'}
                </button>
              </form>
            </div>
          )}

          {/* Manage / Interact Panel */}
          {activeTab === 'manage' && (
            <div className="workspace-panel">
              <h2 className="section-title">ACTIVE INTERACTION</h2>
              <p className="section-desc">Search and load a lease escrow by its unique numeric Lease ID to perform actions.</p>

              <div className="search-box">
                <input
                  type="text"
                  className="address-mono"
                  placeholder="Enter Lease ID (e.g., 578129031)..."
                  value={searchLeaseId}
                  onChange={(e) => setSearchLeaseId(e.target.value)}
                />
                <button onClick={() => handleLoadEscrow(searchLeaseId)} className="btn btn-secondary pill-btn">LOAD</button>
              </div>

              {/* Simulation Error Panel */}
              {errorDetails && (
                <div className="info-banner error" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1.25rem', borderRadius: '16px', width: '100%' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px', flexShrink: 0 }}>
                    <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                  </svg>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', textAlign: 'left' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-error)', letterSpacing: '0.05em' }}>ERROR</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>This ID is invalid.</span>
                  </div>
                </div>
              )}

              {/* Escrow Details */}
              {activeEscrowDetails && (() => {
                const isLocked = activeEscrowDetails.unlockTime * 1000 > Date.now();
                return (
                  <div>
                    <div className="loaded-escrow-header">
                      <h3 className="escrow-title-text">{activeEscrowDetails.title}</h3>
                      <span className={`badge-status ${activeEscrowDetails.status === 0 ? 'status-created' :
                          activeEscrowDetails.status === 1 ? 'status-active' :
                            activeEscrowDetails.status === 2 ? 'status-disputed' : 'status-released'
                        }`}>
                        {activeEscrowDetails.status === 0 ? 'UNFUNDED / CREATED' :
                          activeEscrowDetails.status === 1 ? 'ACTIVE / LOCKED' :
                            activeEscrowDetails.status === 2 ? 'DISPUTED' : 'RELEASED / CLOSED'}
                      </span>
                    </div>
                    <p className="escrow-desc-text">{activeEscrowDetails.description}</p>

                    {/* Visualizer columns */}
                    <div className="transfer-visualizer">
                      <div className="visual-col">
                        <span className="visual-label">TENANT</span>
                        <span className="address-mono text-truncate">{activeEscrowDetails.tenant}</span>
                        <span className="visual-subtext">{activeEscrowDetails.tenantName}</span>
                      </div>
                      <div className="visual-divider">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 5v14M5 12h14"></path>
                        </svg>
                      </div>
                      <div className="visual-col">
                        <span className="visual-label">LANDLORD</span>
                        <span className="address-mono text-truncate">{activeEscrowDetails.landlord}</span>
                        <span className="visual-subtext">{activeEscrowDetails.landlordName}</span>
                      </div>
                    </div>

                    {/* Escrow Stats */}
                    <div className="escrow-stats">
                      <div className="stat-item">
                        <span className="stat-label">TOTAL ESCROW AMOUNT</span>
                        <span className="address-mono stat-value">{`${formatXlmAmount(activeEscrowDetails.amount)} XLM`}</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">LEASE ID</span>
                        <span className="address-mono stat-value">{activeEscrowDetails.leaseId}</span>
                      </div>
                    </div>

                    {/* Actions: Unfunded state */}
                    {activeEscrowDetails.status === 0 && (() => {
                      const isCurrentUserTenant = userAddress === activeEscrowDetails.tenant;
                      if (isCurrentUserTenant) {
                        return (
                          <div className="action-section">
                            <div className="info-banner warning" style={{ marginBottom: '1.25rem' }}>
                              <span>Escrow initialized. Please deposit the security deposit to activate the contract.</span>
                            </div>
                            <button
                              onClick={handleFundEscrow}
                              disabled={isFunding}
                              className="btn btn-primary btn-full pill-btn"
                            >
                              {isFunding ? 'FUNDING ESCROW ON-CHAIN...' : 'FUND ESCROW NOW (DEPOSIT)'}
                            </button>
                          </div>
                        );
                      } else {
                        return (
                          <div className="action-section">
                            <div className="info-banner warning" style={{ padding: '1.25rem', textAlign: 'left' }}>
                              <span style={{ fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>WAITING FOR TENANT DEPOSIT</span>
                              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                Lease initialized on-chain. Waiting for the tenant to deposit the security deposit funds.
                              </p>
                            </div>
                          </div>
                        );
                      }
                    })()}

                    {/* Actions: Active state */}
                    {activeEscrowDetails.status === 1 && (() => {
                      const isCurrentUserTenant = userAddress === activeEscrowDetails.tenant;
                      const isCurrentUserLandlord = userAddress === activeEscrowDetails.landlord;

                      if (isCurrentUserTenant) {
                        if (activeEscrowDetails.tenantProposal) {
                          return (
                            <div className="action-section">
                              <div className="info-banner success" style={{ padding: '1.25rem', textAlign: 'left' }}>
                                <span style={{ fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>SETTLEMENT PROPOSAL SUBMITTED</span>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                  You proposed: <strong>Tenant {formatXlmAmount(activeEscrowDetails.tenantProposal[0])} XLM / Landlord {formatXlmAmount(activeEscrowDetails.tenantProposal[1])} XLM</strong>.
                                </p>
                                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                  Waiting for Landlord review. You cannot perform further actions.
                                </p>
                              </div>
                            </div>
                          );
                        }
                      } else if (isCurrentUserLandlord) {
                        if (!activeEscrowDetails.tenantProposal) {
                          return (
                            <div className="action-section">
                              <div className="info-banner warning" style={{ padding: '1.25rem', textAlign: 'left' }}>
                                <span style={{ fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>WAITING FOR TENANT PROPOSAL</span>
                                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                  The tenant has not submitted their settlement proposal yet. You will be able to review it and submit your proposal once they do.
                                </p>
                              </div>
                            </div>
                          );
                        }
                      }

                      return (
                        <div className="action-section">
                          <h4 className="action-heading">PROPOSE RELEASE SPLIT</h4>
                          <p className="action-desc">Negotiate the refund. Enter the split. If landlord and tenant splits match, release executes automatically. Conflicting splits will trigger a dispute.</p>

                          {/* Show details of existing split proposals */}
                          {(activeEscrowDetails.tenantProposal || activeEscrowDetails.landlordProposal) && (
                            <div className="info-banner success" style={{ marginBottom: '1.25rem', padding: '1rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', textAlign: 'left', fontSize: '0.85rem' }}>
                                {activeEscrowDetails.tenantProposal && (
                                  <span>
                                    <strong>Tenant proposed:</strong> Tenant {formatXlmAmount(activeEscrowDetails.tenantProposal[0])} XLM / Landlord {formatXlmAmount(activeEscrowDetails.tenantProposal[1])} XLM
                                  </span>
                                )}
                                {activeEscrowDetails.landlordProposal && (
                                  <span>
                                    <strong>Landlord proposed:</strong> Tenant {formatXlmAmount(activeEscrowDetails.landlordProposal[0])} XLM / Landlord {formatXlmAmount(activeEscrowDetails.landlordProposal[1])} XLM
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Range Slider for proposals */}
                          <div className="slider-container">
                            <div className="slider-labels">
                              <span>TO TENANT: <strong className="address-mono">{`${formatXlmAmount(rangeSplitVal)} XLM`}</strong></span>
                              <span>TO LANDLORD: <strong className="address-mono">{`${formatXlmAmount(activeEscrowDetails.amount - rangeSplitVal)} XLM`}</strong></span>
                            </div>
                            {/* Locked banner */}
                            {isLocked && (
                              <div className="info-banner warning" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1.25rem', borderRadius: '16px', marginBottom: '1.5rem' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-pending)', flexShrink: 0 }}>
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                </svg>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', textAlign: 'left' }}>
                                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-pending)', letterSpacing: '0.05em' }}>FUNDS DEPOSIT TIME-LOCKED</span>
                                  {isCurrentUserLandlord ? (
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                      The escrow is locked. You can accept the Tenant's proposal to release funds immediately, but you cannot modify the slider or submit a conflicting proposal until the time lock expires on <strong>{formatDateTime(activeEscrowDetails.unlockTime * 1000)}</strong>.
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                      The escrow is locked. You can propose your split below, but the Landlord cannot adjust the slider or declare a dispute until the time lock expires on <strong>{formatDateTime(activeEscrowDetails.unlockTime * 1000)}</strong>.
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}

                            <input
                              type="range"
                              min="0"
                              max={activeEscrowDetails.amount}
                              value={rangeSplitVal}
                              onChange={(e) => setRangeSplitVal(Number(e.target.value))}
                              className="split-slider"
                              disabled={isCurrentUserLandlord && isLocked}
                              style={(isCurrentUserLandlord && isLocked) ? { cursor: 'not-allowed', opacity: 0.5 } : {}}
                            />
                          </div>

                          {isCurrentUserLandlord && (
                            <div className="form-group" style={{ marginTop: '1.25rem', marginBottom: '1.25rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label htmlFor="landlord-dispute-reason">RAISE DISPUTE REASON</label>
                                {rangeSplitVal !== Number(activeEscrowDetails.tenantProposal?.[0]) && (
                                  <span style={{ fontSize: '0.65rem', color: 'var(--color-error)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>REQUIRED (CONFLICTING PROPOSAL)</span>
                                )}
                              </div>
                              <textarea
                                id="landlord-dispute-reason"
                                placeholder={
                                  rangeSplitVal === Number(activeEscrowDetails.tenantProposal?.[0])
                                    ? "Dispute reason disabled (your proposal matches Tenant's split)"
                                    : "Enter reason for conflicting proposal/dispute..."
                                }
                                rows="3"
                                value={landlordDisputeReason}
                                onChange={(e) => {
                                  setLandlordDisputeReason(e.target.value);
                                  if (e.target.value.trim()) {
                                    setShowDisputeReasonError(false);
                                  }
                                }}
                                disabled={rangeSplitVal === Number(activeEscrowDetails.tenantProposal?.[0])}
                                style={{
                                   opacity: (rangeSplitVal === Number(activeEscrowDetails.tenantProposal?.[0])) ? 0.5 : 1,
                                   cursor: (rangeSplitVal === Number(activeEscrowDetails.tenantProposal?.[0])) ? 'not-allowed' : 'text',
                                   backgroundColor: (rangeSplitVal === Number(activeEscrowDetails.tenantProposal?.[0])) ? 'var(--surface-color)' : 'var(--surface-color-light)',
                                   borderColor: showDisputeReasonError ? 'var(--color-error)' : 'var(--border-color)',
                                   borderRadius: '12px',
                                   padding: '0.9rem 1.1rem',
                                   color: 'var(--text-primary)',
                                   fontFamily: 'var(--font-sans)',
                                   fontSize: '0.95rem',
                                   transition: 'border-color var(--transition-fast), outline var(--transition-fast)',
                                   width: '100%',
                                   resize: 'vertical'
                                }}
                              />
                            </div>
                          )}

                          <button
                            onClick={handleProposeSplit}
                            disabled={isProposing || isLocked}
                            className="btn btn-primary btn-full pill-btn"
                            style={isLocked ? { cursor: 'not-allowed', opacity: 0.7 } : {}}
                          >
                            {isProposing ? 'SUBMITTING RELEASE PROPOSAL...' : isLocked ? 'RELEASE LOCK ACTIVE' : 'SUBMIT RELEASE PROPOSAL'}
                          </button>
                        </div>
                      );
                    })()}

                    {/* Actions: Disputed state */}
                    {activeEscrowDetails.status === 2 && (
                      <div className="action-section">
                        <div className="info-banner error">
                          <span>THIS ESCROW IS CURRENTLY DISPUTED</span>
                          <p className="dispute-reason-txt">{`Reason: "${activeEscrowDetails.disputeReason}"`}</p>
                        </div>

                        {/* Arbitrator Decision controls */}
                        {userAddress === activeEscrowDetails.arbitrator ? (
                          <div>
                            <h4 className="action-heading">ARBITRATOR TIE-BREAKER DECISION</h4>
                            <p className="action-desc">You are the registered arbitrator. Review the dispute between Tenant <strong>{activeEscrowDetails.tenantName}</strong> and Landlord <strong>{activeEscrowDetails.landlordName}</strong>, compare the proposals, and decide the final distribution split.</p>

                            {/* Side-by-Side Proposals Comparison */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1.25rem', marginBottom: '1.5rem' }}>
                              <div style={{ padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--surface-color-light)', textAlign: 'left' }}>
                                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--color-info)', letterSpacing: '0.05em', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
                                  TENANT SETTLEMENT PROPOSAL
                                </span>
                                {activeEscrowDetails.tenantProposal ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                      <span style={{ color: 'var(--text-secondary)' }}>To Tenant:</span>
                                      <strong className="address-mono" style={{ color: 'var(--text-primary)' }}>{formatXlmAmount(activeEscrowDetails.tenantProposal[0])} XLM</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                      <span style={{ color: 'var(--text-secondary)' }}>To Landlord:</span>
                                      <strong className="address-mono" style={{ color: 'var(--text-primary)' }}>{formatXlmAmount(activeEscrowDetails.tenantProposal[1])} XLM</strong>
                                    </div>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No proposal submitted</span>
                                )}
                              </div>

                              <div style={{ padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--surface-color-light)', textAlign: 'left' }}>
                                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--color-info)', letterSpacing: '0.05em', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
                                  LANDLORD SETTLEMENT PROPOSAL
                                </span>
                                {activeEscrowDetails.landlordProposal ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                      <span style={{ color: 'var(--text-secondary)' }}>To Tenant:</span>
                                      <strong className="address-mono" style={{ color: 'var(--text-primary)' }}>{formatXlmAmount(activeEscrowDetails.landlordProposal[0])} XLM</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                      <span style={{ color: 'var(--text-secondary)' }}>To Landlord:</span>
                                      <strong className="address-mono" style={{ color: 'var(--text-primary)' }}>{formatXlmAmount(activeEscrowDetails.landlordProposal[1])} XLM</strong>
                                    </div>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No proposal submitted</span>
                                )}
                              </div>
                            </div>

                            <div className="slider-container">
                              <div className="slider-labels">
                                <span>TO TENANT: <strong className="address-mono">{`${formatXlmAmount(rangeArbVal)} XLM`}</strong></span>
                                <span>TO LANDLORD: <strong className="address-mono">{`${formatXlmAmount(activeEscrowDetails.amount - rangeArbVal)} XLM`}</strong></span>
                              </div>
                              {/* Locked banner */}
                              {isLocked && (
                                <div className="info-banner warning" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1.25rem', borderRadius: '16px', marginTop: '1.25rem', marginBottom: '1.25rem' }}>
                                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-pending)', flexShrink: 0 }}>
                                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                  </svg>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', textAlign: 'left' }}>
                                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-pending)', letterSpacing: '0.05em' }}>ARBITRATION LOCK ACTIVE</span>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                      The dispute cannot be resolved until the contract locks expire on <strong>{formatDateTime(activeEscrowDetails.unlockTime * 1000)}</strong>.
                                    </span>
                                  </div>
                                </div>
                              )}

                              <input
                                type="range"
                                min="0"
                                max={activeEscrowDetails.amount}
                                value={rangeArbVal}
                                onChange={(e) => setRangeArbVal(Number(e.target.value))}
                                className="split-slider"
                                disabled={isLocked}
                                style={isLocked ? { cursor: 'not-allowed', opacity: 0.5 } : {}}
                              />
                            </div>
                            <button
                              onClick={handleArbitratorDecision}
                              disabled={isResolving || isLocked}
                              className="btn btn-danger btn-full pill-btn"
                              style={isLocked ? { cursor: 'not-allowed', opacity: 0.7 } : {}}
                            >
                              {isResolving ? 'RESOLVING DISPUTE...' : isLocked ? 'ARBITRATION LOCKED' : 'EXECUTE ARBITRATOR RESOLUTION'}
                            </button>
                          </div>
                        ) : (
                          <div className="non-arbitrator-msg" style={{ width: '100%' }}>
                            <h4 style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-primary)', marginBottom: '0.75rem', textAlign: 'left' }}>
                              COMPARE CONFLICTING PROPOSALS
                            </h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '0.25rem', marginBottom: '1.25rem', width: '100%' }}>
                              <div style={{ padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--surface-color-light)', textAlign: 'left' }}>
                                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--color-info)', letterSpacing: '0.05em', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
                                  TENANT SETTLEMENT PROPOSAL
                                </span>
                                {activeEscrowDetails.tenantProposal ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                      <span style={{ color: 'var(--text-secondary)' }}>To Tenant:</span>
                                      <strong className="address-mono" style={{ color: 'var(--text-primary)' }}>{formatXlmAmount(activeEscrowDetails.tenantProposal[0])} XLM</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                      <span style={{ color: 'var(--text-secondary)' }}>To Landlord:</span>
                                      <strong className="address-mono" style={{ color: 'var(--text-primary)' }}>{formatXlmAmount(activeEscrowDetails.tenantProposal[1])} XLM</strong>
                                    </div>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No proposal submitted</span>
                                )}
                              </div>

                              <div style={{ padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-color)', background: 'var(--surface-color-light)', textAlign: 'left' }}>
                                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)', color: 'var(--color-info)', letterSpacing: '0.05em', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
                                  LANDLORD SETTLEMENT PROPOSAL
                                </span>
                                {activeEscrowDetails.landlordProposal ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                      <span style={{ color: 'var(--text-secondary)' }}>To Tenant:</span>
                                      <strong className="address-mono" style={{ color: 'var(--text-primary)' }}>{formatXlmAmount(activeEscrowDetails.landlordProposal[0])} XLM</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                      <span style={{ color: 'var(--text-secondary)' }}>To Landlord:</span>
                                      <strong className="address-mono" style={{ color: 'var(--text-primary)' }}>{formatXlmAmount(activeEscrowDetails.landlordProposal[1])} XLM</strong>
                                    </div>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No proposal submitted</span>
                                )}
                              </div>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                              Waiting for the Arbitrator to review the evidence and submit a decision.
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions: Released state */}
                    {activeEscrowDetails.status === 3 && (
                      <div className="action-section">
                        <div className="info-banner success" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem', padding: '1.25rem' }}>
                          <span style={{ fontWeight: 700 }}>ESCROW RELEASED & RESOLVED SUCCESSFULLY</span>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <p style={{ margin: 0, fontSize: '0.85rem' }}>Funds sent back to accounts.</p>
                            <button onClick={() => onNavigate('/dashboard')} className="btn btn-primary pill-btn" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', border: 'none', fontWeight: 600 }}>
                              Check Dashboard
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                  </div>
                );
              })()}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Workspace;
