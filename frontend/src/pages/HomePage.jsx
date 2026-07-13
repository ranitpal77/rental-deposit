import React from 'react';
import Hero from '../components/Hero';
import { handleLinkClick } from '../utils/navigation';
import ExploreMore from '../components/ExploreMore';
import Features from '../components/Features';
import HowItWorks from '../components/HowItWorks';
import WhyStellar from '../components/WhyStellar';
import './HomePage.css';

const HomePage = ({ onNavigate }) => {
  return (
    <div className="homepage-container">
      <Hero onNavigate={onNavigate} />
      <ExploreMore onNavigate={onNavigate} />
      <Features />
      <HowItWorks />
      <WhyStellar />

      <div className="landing-bottom-cta">
        <a 
          href="/workspace" 
          onClick={(e) => handleLinkClick(e, '/workspace', onNavigate)} 
          className="btn btn-primary pill-btn cta-btn"
        >
          Open workspace
        </a>
        <a 
          href="/docs" 
          onClick={(e) => handleLinkClick(e, '/docs', onNavigate)} 
          className="btn btn-secondary pill-btn cta-btn"
        >
          Read the docs
        </a>
      </div>
    </div>
  );
};

export default HomePage;
