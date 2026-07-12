import React from 'react';
import Documentation from '../components/Documentation';
import './DocsPage.css';

const DocsPage = ({ onNavigate }) => {
  return (
    <div className="docspage-container">
      <Documentation onNavigate={onNavigate} />
    </div>
  );
};

export default DocsPage;
