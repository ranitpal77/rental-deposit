/**
 * Navigation utility to intercept standard left clicks for SPA routing,
 * while allowing Ctrl+Click, Cmd+Click, Shift+Click, and Middle-clicks
 * to open links in a new tab natively.
 */
export const handleLinkClick = (e, path, onNavigate) => {
  // Left-click (button 0) with no modifier keys
  if (
    e.button === 0 &&
    !e.ctrlKey &&
    !e.metaKey &&
    !e.shiftKey &&
    !e.altKey
  ) {
    e.preventDefault();
    onNavigate(path);
  }
};
