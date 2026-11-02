/**
 * The toolbar icon toggles the in-page panel (src/panel-host.js).
 *
 * Supported job boards already have the content scripts. On any other site the
 * click grants temporary access to that tab (activeTab), and the same bundle is
 * injected then.
 *
 * Tabs with the panel open are remembered in session storage, so the panel
 * reopens after the page in that tab changes.
 */

const PAGE_SCRIPTS = ['src/sites.js', 'src/fields.js', 'src/filler.js', 'src/launcher.js', 'src/panel-host.js', 'src/content.js'];
const PANEL_URL = chrome.runtime.getURL('src/sidepanel.html');

/** Pages where Chrome loads PAGE_SCRIPTS itself, from the manifest's match patterns. */
const MANIFEST_PAGES = chrome.runtime.getManifest().content_scripts
  .filter((entry) => entry.js.includes('src/panel-host.js'))
  .flatMap((entry) => entry.matches)
  .map((pattern) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`));
const hasManifestScripts = (url = '') => MANIFEST_PAGES.some((pattern) => pattern.test(url));

async function openTabs() {
  const { panelTabs = [] } = await chrome.storage.session.get('panelTabs');
  return new Set(panelTabs);
}
// Writes run one at a time so quick open/close messages cannot overwrite each other.
let writes = Promise.resolve();
function setTabOpen(tabId, open) {
  writes = writes.then(async () => {
    const tabs = await openTabs();
    if (open === tabs.has(tabId)) return;
    open ? tabs.add(tabId) : tabs.delete(tabId);
    await chrome.storage.session.set({ panelTabs: [...tabs] });
  }).catch(() => {});
  return writes;
}

/** True when the page already runs the panel host. */
async function hasPanelHost(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: () => Boolean(window.CVAutofillPanel) });
    return Boolean(result?.result);
  } catch {
    return false;
  }
}

async function injectPanel(tabId) {
  if (await hasPanelHost(tabId)) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: PAGE_SCRIPTS });
    return true;
  } catch {
    return false;
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!Number.isInteger(tab.id)) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'panel-toggle' }, { frameId: 0 });
    return;
  } catch {
    // No panel host in this page yet.
  }
  // Mark the tab first: the injected host asks for its state as it starts.
  await setTabOpen(tab.id, true);
  if (!(await injectPanel(tab.id))) {
    await setTabOpen(tab.id, false);
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    await chrome.action.setTitle({ tabId: tab.id, title: 'CV Autofill cannot open on this page.' });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !Number.isInteger(sender.tab?.id)) return false;
  const tabId = sender.tab.id;
  const fromPage = sender.frameId === 0 && !sender.url?.startsWith('chrome-extension:');
  const fromPanel = sender.url?.startsWith(PANEL_URL);

  if (message?.type === 'panel-tab' && fromPanel) {
    sendResponse({ tabId });
    return false;
  }
  if (!fromPage) return false;
  if (message?.type === 'panel-state') {
    openTabs().then((tabs) => sendResponse({ open: tabs.has(tabId) }), () => sendResponse({ open: false }));
    return true;
  }
  if (message?.type === 'panel-opened' || message?.type === 'panel-closed') {
    void setTabOpen(tabId, message.type === 'panel-opened');
  }
  return false;
});

// Pages without the manifest content scripts lose the panel on reload; put it back
// where this tab still allows it. A refused injection just forgets the tab.
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.url) void chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  if (info.status !== 'complete') return;
  if (!(await openTabs()).has(tabId)) return;
  if (hasManifestScripts(tab.url)) return; // The page's own host reopens the panel.
  if (!(await injectPanel(tabId))) await setTabOpen(tabId, false);
});
chrome.tabs.onRemoved.addListener((tabId) => void setTabOpen(tabId, false));
