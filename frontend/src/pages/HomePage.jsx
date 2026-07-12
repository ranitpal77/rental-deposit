import React from 'react';
import Hero from '../components/Hero';
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

      {/* Bottom Landing Page Call to Action */}
      <div className="landing-bottom-cta">
        <button onClick={() => onNavigate('/workspace')} className="btn btn-primary pill-btn cta-btn">
          Open workspace
        </button>
        <button onClick={() => onNavigate('/docs')} className="btn btn-secondary pill-btn cta-btn">
          Read the docs
        </button>
      </div>
    </div>
  );
};

export default HomePage;
