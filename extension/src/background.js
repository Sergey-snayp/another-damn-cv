/**
 * Clicking the toolbar icon opens the side panel.
 *
 * Without setPanelBehavior the icon does nothing unless you also declare a
 * popup, and the panel can only be opened from a context menu.
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[cv-autofill] side panel setup failed', err));
});
