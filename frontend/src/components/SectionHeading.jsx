import React from 'react';
import './SectionHeading.css';

const SectionHeading = ({ badge, title, subtitle, centered = false }) => {
  return (
    <div className={`section-header-block ${centered ? 'centered' : ''}`}>
      {badge && <span className="section-badge-pill">{badge}</span>}
      <h2 className="section-title-grad">{title}</h2>
      {subtitle && <p className="section-subtitle-text">{subtitle}</p>}
    </div>
  );
};

export default SectionHeading;
