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
 * Storage (chrome.storage.local):
 *   appResumes        the server's last answer, so the panel can draw at once
 *   chosenResumeId    the CV Autofill uploads; the primary CV when unset
 */

/** Drops this account's CV list, choice and texts: after a failed fetch or a sign-out. */
export function forgetResumes() {
  return chrome.storage.local.remove(['appResumes', 'chosenResumeId', 'cvTexts']);
}

/** The CV was deleted in the app since the list was fetched. */
export class ResumeGoneError extends Error {
  constructor() { super('That CV was deleted in the app. Choose another.'); this.name = 'ResumeGoneError'; }
}

/** Cached list and choice, without a network call. */
export async function cachedResumes() {
  const { appResumes, chosenResumeId } = await chrome.storage.local.get(['appResumes', 'chosenResumeId']);
  return withChoice(Array.isArray(appResumes) ? appResumes : [], chosenResumeId);
}

function withChoice(items, chosenId) {
  const chosen = items.find(item => item.id === chosenId) ?? items.find(item => item.isPrimary) ?? items[0] ?? null;
  return { items, chosen };
}

/** Fetches the CV list from the app and stores it. */
export async function fetchResumes() {
  const { auth, chosenResumeId } = await chrome.storage.local.get(['auth', 'chosenResumeId']);
  if (!auth?.syncToken) throw new NotSignedInError();
  let response;
  try {
    response = await fetch(`${API_URL}/api/extension/resumes`, { headers: { Authorization: `Bearer ${auth.syncToken}` } });
  } catch {
    throw new Error(`Can't reach the app at ${API_URL}. Is the backend running?`);
  }
  if (response.status === 401) { await signOut(); throw new NotSignedInError(); }
  if (!response.ok) throw new Error(`Server returned ${response.status}.`);
  const items = await response.json();
  await chrome.storage.local.set({ appResumes: items });
  // A choice of a CV that is gone is forgotten, so it can never come back.
  if (chosenResumeId && !items.some(item => item.id === chosenResumeId)) await chrome.storage.local.remove('chosenResumeId');
  return withChoice(items, chosenResumeId);
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
 * ("Sergey_Proniuk_Resume.pdf"). The server makes it when the CV or its design
 * changed; otherwise it sends the kept file at once.
 */
export async function pdfFor(resume) {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.syncToken) throw new NotSignedInError();
  let response;
  try {
    response = await fetch(`${API_URL}/api/extension/resumes/${encodeURIComponent(resume.id)}/pdf`, { headers: { Authorization: `Bearer ${auth.syncToken}` } });
  } catch {
    throw new Error(`Can't reach the app at ${API_URL}. Is the backend running?`);
  }
  if (response.status === 401) { await signOut(); throw new NotSignedInError(); }
  if (response.status === 404) throw new ResumeGoneError();
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.message === 'string' ? body.message : `Server returned ${response.status}.`);
  }
  const fileName = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? fileNameFor(resume);
  return { dataUrl: toDataUrl(await response.arrayBuffer()), fileName };
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
    const response = await fetch(`${API_URL}/api/extension/resumes/${encodeURIComponent(item.id)}/text`, { headers: { Authorization: `Bearer ${auth.syncToken}` } }).catch(() => null);
    if (response?.status === 401) { await signOut(); throw new NotSignedInError(); }
    if (!response?.ok) return; // Left out of the match until it can be read.
    next[item.id] = { updatedAt: item.updatedAt, text: (await response.json()).text };
    changed = true;
  }));
  if (changed) await chrome.storage.local.set({ cvTexts: next });
  return Object.fromEntries(Object.entries(next).map(([id, entry]) => [id, entry.text]));
}
