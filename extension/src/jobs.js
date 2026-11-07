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
    files: ['src/linkedin.js', 'src/capture-sites.js', 'src/capture.js'],
  });
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async () => {
      // Chrome can turn a rejected injected promise into an empty result.
      // Return the error explicitly so loading failures can be retried.
      try { return { ok: true, capture: await globalThis.__cvCapture() }; }
      catch (error) { return { ok: false, error: error?.message || 'The job description is not ready.' }; }
    },
  });
  const reading = result?.result;
  if (reading?.ok === false) throw new Error(reading.error);
  const capture = reading?.ok === true ? reading.capture : reading;
  if (!capture?.url) throw new Error(result?.error?.message || 'The job description is not ready.');
  return capture;
}

export async function sendCapture(capture) {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.syncToken) throw new NotSignedInError();

  const { matched: _matched, description: _description, ...payload } = capture;

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

/**
 * Claude's answer to one form question, written from the chosen CV and the
 * job. Runs only on the person's click. { answer, needsInput }: what only the
 * person can say (a date, a preference) is listed instead of invented.
 */
export async function draftAnswer(request) {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.syncToken) throw new NotSignedInError();
  let response;
  try {
    response = await fetch(`${API_URL}/api/extension/answers/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.syncToken}` },
      body: JSON.stringify(request),
    });
  } catch { throw new Error(`Can't reach the app at ${API_URL}. Is the backend running?`); }
  if (response.status === 401) { await signOut(); throw new NotSignedInError(); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? `Server returned ${response.status}.`);
  return { answer: String(body.answer ?? ''), needsInput: Array.isArray(body.needsInput) ? body.needsInput.map(String) : [] };
}

/** The job a question is answered for: the saved job, with its full description, or what the page shows. */
export async function jobForDraft(url, fromPage) {
  try {
    const saved = /^https?:\/\//i.test(url) ? await lookupJob(url) : null;
    if (saved?.id) {
      const job = await getSavedJob(saved.id);
      if (job.description?.trim()) return { title: job.title || fromPage.title, company: job.company || fromPage.company, text: job.description.slice(0, 40000) };
    }
  } catch { /* the page's own text below */ }
  return fromPage;
}

/**
 * A submitted application: its saved job moves from Saved (or Dismissed) to
 * Applied, which also records when. A job further along is left as it is, and
 * a page that is not a saved job changes nothing. The form's answers are
 * recorded on the job either way. True when it moved.
 */
export async function markApplied(url, answers = []) {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const job = await lookupJob(url);
    if (!job) return false;
    // What the form said, kept on the job ("Your answers"), added to earlier steps' answers.
    if (answers.length) await recordApplication(job.id, { answers }).catch(() => {});
    if (!['saved', 'dismissed'].includes(job.status)) return false;
    await updateSavedJob(job.id, { status: 'applied' });
    return true;
  } catch { return false; /* signed out or offline: the job stays as it is */ }
}

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
