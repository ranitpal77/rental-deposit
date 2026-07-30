import { useEffect } from 'react';

/**
 * Custom hook to initialize scroll-reveal animations using IntersectionObserver.
 * Observes elements with reveal classes or card selectors and adds '.revealed' when visible.
 */
export const useScrollReveal = (dependency) => {
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;

    const selector = [
      '.reveal',
      '.reveal-up',
      '.reveal-down',
      '.reveal-left',
      '.reveal-right',
      '.reveal-scale',
      '.reveal-fade',
      '.hero-lead',
      '.hero-status-card',
      '.principle-card',
      '.cap-card',
      '.timeline-step-card',
      '.why-stellar-content',
      '.why-code-editor',
      '.bento-card',
      '.doc-card',
      '.doc-section',
      '.doc-banner',
      '.use-case-card',
      '.diagram-container',
      '.doc-table',
      '.doc-code-block-wrapper',
      '.docs-left-panel',
      '.docs-footer-buttons-wrapper',
      '.subsection',
      '.section-head',
      '.section-heading'
    ].join(', ');

    const observerOptions = {
      root: null,
      rootMargin: '0px 0px -40px 0px',
      threshold: 0.08
    };

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          obs.unobserve(entry.target);
        }
      });
    }, observerOptions);

    const observeElements = () => {
      const elements = document.querySelectorAll(selector);
      elements.forEach((el) => {
        if (!el.classList.contains('revealed')) {
          observer.observe(el);
        }
      });
    };

    observeElements();

    // Observe DOM mutations to handle dynamic page changes
    const mutationObserver = new MutationObserver(() => {
      observeElements();
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [dependency]);
};

export default useScrollReveal;
