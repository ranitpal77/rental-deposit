import React, { useState, useEffect, useRef } from 'react';
import './Navbar.css';
import { handleLinkClick } from '../utils/navigation';

const Navbar = ({
  currentPath,
  onNavigate,
  userAddress,
  handleConnectWallet,
  handleDisconnectWallet
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef(null);

  const isWorkspaceArea = 
    currentPath.toLowerCase() === '/workspace' || 
    currentPath.toLowerCase() === '/dashboard';

  const [activeSection, setActiveSection] = useState('home');

  useEffect(() => {
    if (currentPath !== '/') {
      return;
    }

    const sections = ['home', 'features', 'how-it-works', 'why-stellar'];

    const observerOptions = {
      root: null,
      rootMargin: '-30% 0px -50% 0px',
      threshold: 0
    };

    const observerCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);

    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        observer.observe(el);
      }
    });

    return () => {
      observer.disconnect();
    };
  }, [currentPath]);

  const handleAnchorClick = (e, targetId) => {
    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      setIsMobileMenuOpen(false);
      
      if (currentPath !== '/') {
        onNavigate('/');
        setTimeout(() => {
          const el = document.getElementById(targetId);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth' });
          }
        }, 100);
      } else {
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
  };

  const handleLogoClick = (e) => {
    handleLinkClick(e, '/', onNavigate);
    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 50);
    }
  };

  // Close mobile menu on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Do not close if clicking the theme toggle button
      if (e.target.closest('.theme-toggle-btn')) {
        return;
      }
      if (isMobileMenuOpen && mobileMenuRef.current && !mobileMenuRef.current.contains(e.target)) {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobileMenuOpen]);

  const handleConnectWalletClick = () => {
    if (!isWorkspaceArea) {
      onNavigate('/workspace');
      setTimeout(() => {
        if (handleConnectWallet) {
          handleConnectWallet();
        }
      }, 200);
    } else {
      if (handleConnectWallet) {
        handleConnectWallet();
      }
    }
  };

  return (
    <header className={`navbar ${isMobileMenuOpen ? 'menu-open' : ''}`}>
      <div className="navbar-container">
        
        {/* Left Side: Logo */}
        <div className="navbar-logo-area">
          <a href="/" onClick={handleLogoClick} className="navbar-brand">
            DEPOSHIELD
          </a>
        </div>

        {/* Right Side: Links */}
        <nav className="navbar-nav-desktop">
          {!isWorkspaceArea ? (
            /* MARKETING NAVIGATION MODE */
            <ul className="nav-links-list">
              <li>
                <a 
                  href="/" 
                  onClick={(e) => {
                    handleLinkClick(e, '/', onNavigate);
                    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                      setTimeout(() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }, 50);
                    }
                  }} 
                  className={`nav-item ${currentPath === '/' && activeSection === 'home' ? 'active' : ''}`}
                >
                  HOME
                </a>
              </li>
              <li>
                <a 
                  href="/#features" 
                  onClick={(e) => handleAnchorClick(e, 'features')} 
                  className={`nav-item ${activeSection === 'features' && currentPath === '/' ? 'active' : ''}`}
                >
                  FEATURES
                </a>
              </li>
              <li>
                <a 
                  href="/#how-it-works" 
                  onClick={(e) => handleAnchorClick(e, 'how-it-works')} 
                  className={`nav-item ${activeSection === 'how-it-works' && currentPath === '/' ? 'active' : ''}`}
                >
                  HOW IT WORKS
                </a>
              </li>
              <li>
                <a 
                  href="/#why-stellar" 
                  onClick={(e) => handleAnchorClick(e, 'why-stellar')} 
                  className={`nav-item ${activeSection === 'why-stellar' && currentPath === '/' ? 'active' : ''}`}
                >
                  WHY STELLAR
                </a>
              </li>
              <li>
                <a 
                  href="/workspace"
                  onClick={(e) => handleLinkClick(e, '/workspace', onNavigate)} 
                  className={`nav-item nav-btn-link ${currentPath.toLowerCase() === '/workspace' ? 'active' : ''}`}
                >
                  WORKSPACE
                </a>
              </li>
              <li>
                <a 
                  href="/docs"
                  onClick={(e) => handleLinkClick(e, '/docs', onNavigate)} 
                  className={`nav-item nav-btn-link ${currentPath.toLowerCase() === '/docs' ? 'active' : ''}`}
                >
                  DOCS
                </a>
              </li>
              <li className="wallet-btn-item" style={{ marginLeft: '1rem' }}>
                {userAddress ? (() => {
                  const addrStr = typeof userAddress === 'object' ? userAddress.address : userAddress;
                  return (
                    <div className="wallet-connected-wrapper">
                      <span className="wallet-address-pill">
                        {addrStr ? `${addrStr.slice(0, 5)}...${addrStr.slice(-4)}` : '--'}
                      </span>
                      <button onClick={handleDisconnectWallet} className="btn btn-secondary disconnect-btn" title="Disconnect Wallet">
                        DISCONNECT
                      </button>
                    </div>
                  );
                })() : (
                  <button onClick={handleConnectWalletClick} className="btn btn-primary connect-wallet-btn">
                    CONNECT WALLET
                  </button>
                )}
              </li>
            </ul>
          ) : (
            /* WORKSPACE NAVIGATION MODE */
            <ul className="nav-links-list workspace-nav-list">
              <li>
                <a 
                  href="/workspace"
                  onClick={(e) => handleLinkClick(e, '/workspace', onNavigate)} 
                  className={`nav-item nav-btn-link ${currentPath.toLowerCase() === '/workspace' ? 'active' : ''}`}
                >
                  WORKSPACE
                </a>
              </li>
              <li>
                <a 
                  href="/dashboard"
                  onClick={(e) => handleLinkClick(e, '/dashboard', onNavigate)} 
                  className={`nav-item nav-btn-link ${currentPath.toLowerCase() === '/dashboard' ? 'active' : ''}`}
                >
                  DASHBOARD
                </a>
              </li>
              <li className="wallet-btn-item">
                {userAddress ? (() => {
                  const addrStr = typeof userAddress === 'object' ? userAddress.address : userAddress;
                  return (
                    <div className="wallet-connected-wrapper">
                      <span className="wallet-address-pill">
                        {addrStr ? `${addrStr.slice(0, 5)}...${addrStr.slice(-4)}` : '--'}
                      </span>
                      <button onClick={handleDisconnectWallet} className="btn btn-secondary disconnect-btn" title="Disconnect Wallet">
                        DISCONNECT
                      </button>
                    </div>
                  );
                })() : (
                  <button onClick={handleConnectWalletClick} className="btn btn-primary connect-wallet-btn">
                    CONNECT WALLET
                  </button>
                )}
              </li>
            </ul>
          )}
        </nav>

        {/* Mobile Hamburger toggle button */}
        <div className="navbar-mobile-toggle">
          {userAddress ? (
            <div className="wallet-connected-wrapper" style={{ marginRight: '0.75rem', padding: '0.3rem 0.6rem', border: '1px solid var(--border-color)', borderRadius: '100px', display: 'flex', alignItems: 'center' }}>
              <span className="wallet-address-pill" style={{ fontSize: '0.65rem', fontWeight: 600 }}>
                {(() => {
                  const addrStr = typeof userAddress === 'object' ? userAddress.address : userAddress;
                  return addrStr ? `${addrStr.slice(0, 4)}...${addrStr.slice(-3)}` : '--';
                })()}
              </span>
            </div>
          ) : (
            <button 
              onClick={handleConnectWalletClick} 
              className="btn btn-primary connect-wallet-btn" 
              style={{ marginRight: '0.75rem', padding: '0.4rem 0.85rem', fontSize: '0.7rem', height: 'auto', minHeight: 'unset' }}
            >
              CONNECT WALLET
            </button>
          )}

          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
            className="hamburger-btn"
            aria-label="Toggle menu"
          >
            <svg width="20" height="16" viewBox="0 0 20 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="hamburger-svg">
              <rect y="1" width="20" height="2" rx="1" fill="currentColor"/>
              <rect y="7" width="20" height="2" rx="1" fill="currentColor"/>
              <rect y="13" width="20" height="2" rx="1" fill="currentColor"/>
            </svg>
          </button>
        </div>

      </div>

      {/* Mobile Drawer (Slide-out menu) */}
      <div className={`mobile-nav-overlay ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className={`mobile-nav-drawer ${isMobileMenuOpen ? 'open' : ''}`} ref={mobileMenuRef}>
          <div className="mobile-drawer-header">
            DEPOSHIELD
            <button 
              className="mobile-drawer-close" 
              onClick={() => setIsMobileMenuOpen(false)}
              aria-label="Close menu"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <ul className="mobile-links-list">
            {!isWorkspaceArea ? (
              <>
                <li>
                  <a 
                    href="/" 
                    onClick={(e) => {
                      e.preventDefault();
                      setIsMobileMenuOpen(false);
                      onNavigate('/');
                      setTimeout(() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }, 50);
                    }} 
                    className={`mobile-nav-item ${currentPath === '/' && activeSection === 'home' ? 'active' : ''}`}
                  >
                    HOME
                  </a>
                </li>
                <li>
                  <a 
                    href="#features" 
                    onClick={(e) => handleAnchorClick(e, 'features')} 
                    className={`mobile-nav-item ${activeSection === 'features' && currentPath === '/' ? 'active' : ''}`}
                  >
                    FEATURES
                  </a>
                </li>
                <li>
                  <a 
                    href="/#how-it-works" 
                    onClick={(e) => handleAnchorClick(e, 'how-it-works')} 
                    className={`mobile-nav-item ${activeSection === 'how-it-works' && currentPath === '/' ? 'active' : ''}`}
                  >
                    HOW IT WORKS
                  </a>
                </li>
                <li>
                  <a 
                    href="/#why-stellar" 
                    onClick={(e) => handleAnchorClick(e, 'why-stellar')} 
                    className={`mobile-nav-item ${activeSection === 'why-stellar' && currentPath === '/' ? 'active' : ''}`}
                  >
                    WHY STELLAR
                  </a>
                </li>
                <li>
                  <a 
                    href="/workspace"
                    onClick={(e) => {
                      handleLinkClick(e, '/workspace', onNavigate);
                      if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                        setIsMobileMenuOpen(false);
                      }
                    }} 
                    className={`mobile-nav-item ${currentPath.toLowerCase() === '/workspace' ? 'active' : ''}`}
                  >
                    WORKSPACE
                  </a>
                </li>
                <li>
                  <a 
                    href="/docs"
                    onClick={(e) => {
                      handleLinkClick(e, '/docs', onNavigate);
                      if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                        setIsMobileMenuOpen(false);
                      }
                    }} 
                    className={`mobile-nav-item ${currentPath.toLowerCase() === '/docs' ? 'active' : ''}`}
                  >
                    DOCS
                  </a>
                </li>
                <li className="mobile-wallet-btn-li">
                  {userAddress ? (
                    <button onClick={() => { setIsMobileMenuOpen(false); handleDisconnectWallet(); }} className="btn btn-secondary pill-btn btn-full">
                      DISCONNECT WALLET
                    </button>
                  ) : (
                    <button onClick={() => { setIsMobileMenuOpen(false); handleConnectWalletClick(); }} className="btn btn-primary pill-btn btn-full">
                      CONNECT WALLET
                    </button>
                  )}
                </li>
              </>
            ) : (
              <>
                <li>
                  <a 
                    href="/workspace"
                    onClick={(e) => {
                      handleLinkClick(e, '/workspace', onNavigate);
                      if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                        setIsMobileMenuOpen(false);
                      }
                    }} 
                    className={`mobile-nav-item ${currentPath.toLowerCase() === '/workspace' ? 'active' : ''}`}
                  >
                    WORKSPACE
                  </a>
                </li>
                <li>
                  <a 
                    href="/dashboard"
                    onClick={(e) => {
                      handleLinkClick(e, '/dashboard', onNavigate);
                      if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                        setIsMobileMenuOpen(false);
                      }
                    }} 
                    className={`mobile-nav-item ${currentPath.toLowerCase() === '/dashboard' ? 'active' : ''}`}
                  >
                    DASHBOARD
                  </a>
                </li>
                <li className="mobile-wallet-btn-li">
                  {userAddress ? (
                    <button onClick={() => { setIsMobileMenuOpen(false); handleDisconnectWallet(); }} className="btn btn-secondary pill-btn btn-full">
                      DISCONNECT WALLET
                    </button>
                  ) : (
                    <button onClick={() => { setIsMobileMenuOpen(false); handleConnectWallet(); }} className="btn btn-primary pill-btn btn-full">
                      CONNECT WALLET
                    </button>
                  )}
                </li>
              </>
            )}
          </ul>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
