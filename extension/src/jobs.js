import { API_URL, signOut } from './auth.js';

/**
 * "Send this job to the app".
 *
 * The extension may read any site (manifest host_permissions), so the access
 * request below normally resolves at once. Pressing the button injects the
 * capture script once and posts what it found.
 */

export const APP_URL = 'http://localhost:5173';

/** Chrome never lets extensions script these, whatever the permissions. */
const BLOCKED_HOSTS = ['chromewebstore.google.com', 'chrome.google.com'];

/** Why this tab cannot be sent, or null if it can. */
export function unsendableReason(tab) {
  if (!tab?.url) return 'No page open.';
  let url;
  try {
    url = new URL(tab.url);
  } catch {
    return 'This page has no web address.';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Only web pages can be sent.';
  if (BLOCKED_HOSTS.includes(url.hostname)) return 'Chrome does not let extensions read this page.';
  if (url.origin === APP_URL || url.origin === API_URL) return 'This is the app itself.';
  return null;
}

/**
 * Must be called straight from the click, before any other await: Chrome only
 * shows the permission prompt during a user gesture.
 */
export function requestSiteAccess(tab) {
  const { protocol, hostname } = new URL(tab.url);
  return chrome.permissions.request({ origins: [`${protocol}//${hostname}/*`] });
}

export async function captureTab(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/capture-sites.js', 'src/capture.js'],
  });
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => globalThis.__cvCapture(),
  });
  if (!result?.result) throw new Error('Could not read this page.');
  return result.result;
}

export async function sendCapture(capture) {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.syncToken) throw new NotSignedInError();

  const { matched: _matched, ...payload } = capture;

  let response;
  try {
    response = await fetch(`${API_URL}/api/jobs/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.syncToken}` },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(`Can't reach the app at ${API_URL}. Is the backend running?`);
  }

  if (response.status === 401) {
    await signOut();
    throw new NotSignedInError();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Server returned ${response.status}.`);
  }

  return response.json();
}

/** The saved job for a page address, or null: the panel's job card shows "Saved" for it. */
export async function lookupJob(url) {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.syncToken) throw new NotSignedInError();
  let response;
  try {
    response = await fetch(`${API_URL}/api/jobs/lookup?url=${encodeURIComponent(url)}`, { headers: { Authorization: `Bearer ${auth.syncToken}` } });
  } catch {
    throw new Error(`Can't reach the app at ${API_URL}. Is the backend running?`);
  }
  if (response.status === 401) { await signOut(); throw new NotSignedInError(); }
  if (!response.ok) throw new Error(`Server returned ${response.status}.`);
  return (await response.json()).job ?? null;
}

export class NotSignedInError extends Error {
  constructor() {
    super('Sign in first: open the Profile tab.');
    this.name = 'NotSignedInError';
  }
}

export function jobUrl(id) {
  return `${APP_URL}/jobs/${id}`;
}
