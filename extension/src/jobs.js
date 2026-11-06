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

/** Saved details come from the backend; editing updates the same job, without recapturing the page. */
async function savedJobRequest(jobId, init = {}) {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.syncToken) throw new NotSignedInError();
  let response;
  try {
    response = await fetch(`${API_URL}/api/extension/jobs/${encodeURIComponent(jobId)}`, {
      ...init, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.syncToken}` },
    });
  } catch { throw new Error(`Can't reach the app at ${API_URL}. Is the backend running?`); }
  const current = await chrome.storage.local.get('auth');
  if (current.auth?.syncToken !== auth.syncToken) throw new NotSignedInError();
  if (response.status === 401) { await signOut(); throw new NotSignedInError(); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw Object.assign(new Error(body.message ?? `Server returned ${response.status}.`), { status: response.status });
  }
  const job = await response.json();
  if (!job || job.id !== jobId) throw new Error('The server returned unexpected job details. Try again.');
  return job;
}
export const getSavedJob = jobId => savedJobRequest(jobId);
export const updateSavedJob = (jobId, details) => savedJobRequest(jobId, { method: 'PATCH', body: JSON.stringify(details) });

/** Records on a saved job the CV Autofill uploaded and the answers on the form. Never saves a job. */
export async function recordApplication(jobId, { resumeId, answers }) {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.syncToken) throw new NotSignedInError();
  const response = await fetch(`${API_URL}/api/jobs/${encodeURIComponent(jobId)}/application`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.syncToken}` },
    body: JSON.stringify({ ...(resumeId && { resumeId }), ...(answers?.length && { answers: answers.slice(0, 200) }) }),
  });
  if (response.status === 401) { await signOut(); throw new NotSignedInError(); }
  if (!response.ok) throw new Error(`Server returned ${response.status}.`);
  return response.json();
}

/**
 * When the page's job was posted, from its job board (Greenhouse, Lever, Ashby,
 * SmartRecruiters), as Simplify shows it: { posted, updated, board } or null.
 */
export async function postingDatesFor(url) {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.syncToken) return null;
  try {
    const response = await fetch(`${API_URL}/api/jobs/posting-date?url=${encodeURIComponent(url)}`, { headers: { Authorization: `Bearer ${auth.syncToken}` } });
    return response.ok ? (await response.json()).posting ?? null : null;
  } catch { return null; }
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
