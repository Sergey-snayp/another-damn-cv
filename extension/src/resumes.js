import { API_URL, signOut } from './auth.js';
import { APP_URL, NotSignedInError } from './jobs.js';

/**
 * Your CVs from the app's Documents, which one Autofill uploads, and its PDF.
 *
 * As in Simplify, each CV's PDF is a file kept on the server (made there from
 * the CV and its design). The extension only downloads it: nothing opens in
 * the browser to make it.
 *
 * The extension shows exactly the app's CVs: the list is the server's last
 * answer, replaced on every fetch and dropped when a fetch fails or the
 * account signs out, so a CV deleted in the app never stays here.
 *
 * The list lives only in this panel's memory, after the server answered for
 * the current sign-in. A persisted list from an older visit is never shown.
 * Only chosenResumeId (the CV to upload) is remembered between visits.
 */
let library = null;
let pending = null;

/** Drops this account's CV list, choice and texts: after a failed fetch or a sign-out. */
export function forgetResumes() {
  library = null;
  return chrome.storage.local.remove(['appResumes', 'chosenResumeId', 'cvTexts']);
}

/** The CV was deleted in the app since the list was fetched. */
export class ResumeGoneError extends Error {
  constructor() { super('That CV was deleted in the app. Choose another.'); this.name = 'ResumeGoneError'; }
}

/** This panel's last server answer, only for the current sign-in. */
export async function cachedResumes() {
  const { auth, chosenResumeId } = await chrome.storage.local.get(['auth', 'chosenResumeId']);
  return withChoice(auth?.syncToken && library?.token === auth.syncToken ? library.items : [], chosenResumeId);
}

function withChoice(items, chosenId) {
  const chosen = items.find(item => item.id === chosenId) ?? items.find(item => item.isPrimary) ?? items[0] ?? null;
  return { items, chosen };
}

/** Fetches the backend library. Concurrent readers share one request. */
export async function fetchResumes() {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.syncToken) { await forgetResumes(); throw new NotSignedInError(); }
  if (pending?.token === auth.syncToken) return pending.promise;
  const request = { token: auth.syncToken, promise: null };
  request.promise = readLibrary(auth.syncToken).finally(() => { if (pending === request) pending = null; });
  pending = request;
  return request.promise;
}

async function readLibrary(token) {
  try {
    const response = await fetch(`${API_URL}/api/extension/resumes`, {
      headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
    });
    const items = response.ok ? await response.json() : null;
    // A slow response from an earlier account must never restore its CVs or
    // sign out the account selected while the request was in flight.
    const { auth, chosenResumeId } = await chrome.storage.local.get(['auth', 'chosenResumeId']);
    if (auth?.syncToken !== token) throw new NotSignedInError();
    if (response.status === 401) { await signOut(); throw new NotSignedInError(); }
    if (!response.ok) throw new Error(`Server returned ${response.status}.`);
    if (!Array.isArray(items)) throw new Error('The app returned an invalid CV list. Try again.');
    library = { token, items };
    // Remove the old persisted library; it is never a source of documents.
    await chrome.storage.local.remove('appResumes');
    if (chosenResumeId && !items.some(item => item.id === chosenResumeId)) await chrome.storage.local.remove('chosenResumeId');
    return withChoice(items, chosenResumeId);
  } catch (error) {
    // Leave a newer account's successful request alone.
    const { auth } = await chrome.storage.local.get('auth');
    if (auth?.syncToken === token) await forgetResumes();
    else if (library?.token === token) library = null;
    if (error instanceof TypeError) throw new Error(`Can't reach the app at ${API_URL}. Is the backend running?`);
    throw error;
  }
}

/** Recheck ownership after downloading a file, just as for the library. */
async function currentSignIn(token) {
  return (await chrome.storage.local.get('auth')).auth?.syncToken === token;
}

export function chooseResume(id) {
  return chrome.storage.local.set({ chosenResumeId: id });
}

/** The CV's PDF in the app, for "Preview resume" (the app's own sign-in). */
export function pdfUrl(id) {
  return `${APP_URL}/api/resumes/${encodeURIComponent(id)}/pdf`;
}

function toDataUrl(bytes) {
  let binary = '';
  const view = new Uint8Array(bytes);
  for (let start = 0; start < view.length; start += 0x8000) binary += String.fromCharCode(...view.subarray(start, start + 0x8000));
  return `data:application/pdf;base64,${btoa(binary)}`;
}

/**
 * The CV's PDF from the server, with the server's file name
 * ("Sergey_Proniuk_CV_Box_Software_Engineer.pdf" for a job's CV).
 * The server creates the PDF only on Save; downloading never creates one.
 */
export async function pdfFor(resume) {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.syncToken) throw new NotSignedInError();
  let response;
  try {
    response = await fetch(`${API_URL}/api/extension/resumes/${encodeURIComponent(resume.id)}/pdf`, { headers: { Authorization: `Bearer ${auth.syncToken}` }, cache: 'no-store' });
  } catch {
    throw new Error(`Can't reach the app at ${API_URL}. Is the backend running?`);
  }
  if (!await currentSignIn(auth.syncToken)) throw new NotSignedInError();
  if (response.status === 401) { await signOut(); throw new NotSignedInError(); }
  if (response.status === 404) throw new ResumeGoneError();
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.message === 'string' ? body.message : `Server returned ${response.status}.`);
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  let fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fileNameFor(resume);
  const encodedName = /filename\*=UTF-8''([^;\s]+)/i.exec(disposition)?.[1];
  if (encodedName) { try { fileName = decodeURIComponent(encodedName); } catch { /* use the fallback */ } }
  const bytes = await response.arrayBuffer();
  if (!await currentSignIn(auth.syncToken)) throw new NotSignedInError();
  return { dataUrl: toDataUrl(bytes), fileName };
}

export function fileNameFor(resume) {
  const base = resume.name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Resume';
  return `${base.replace(/\.pdf$/i, '')}.pdf`;
}

/**
 * Each CV's plain text for keyword matching, keyed by id. Fetched once per CV
 * version and kept in storage (cvTexts); CVs that are gone are dropped.
 */
export async function cvTexts(items) {
  const { auth, cvTexts: cached = {} } = await chrome.storage.local.get(['auth', 'cvTexts']);
  if (!auth?.syncToken) throw new NotSignedInError();
  const next = {};
  let changed = Object.keys(cached).some(id => !items.some(item => item.id === id));
  await Promise.all(items.map(async item => {
    if (cached[item.id]?.updatedAt === item.updatedAt) { next[item.id] = cached[item.id]; return; }
    const response = await fetch(`${API_URL}/api/extension/resumes/${encodeURIComponent(item.id)}/text`, { headers: { Authorization: `Bearer ${auth.syncToken}` }, cache: 'no-store' }).catch(() => null);
    if (!await currentSignIn(auth.syncToken)) throw new NotSignedInError();
    if (response?.status === 401) { await signOut(); throw new NotSignedInError(); }
    if (!response?.ok) return; // Left out of the match until it can be read.
    next[item.id] = { updatedAt: item.updatedAt, text: (await response.json()).text };
    changed = true;
  }));
  if (!await currentSignIn(auth.syncToken)) throw new NotSignedInError();
  if (changed) await chrome.storage.local.set({ cvTexts: next });
  return Object.fromEntries(Object.entries(next).map(([id, entry]) => [id, entry.text]));
}
