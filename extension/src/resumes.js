import { API_URL, signOut } from './auth.js';
import { APP_URL, NotSignedInError } from './jobs.js';

/**
 * Your CVs from the app's Documents, which one Autofill uploads, and its PDF.
 *
 * The list comes from the API with the sync token. The PDF is made by the
 * background worker, which saves the app's own CV page exactly as Print / PDF
 * does (src/background.js, makeCvPdf). That keeps the CV style you chose in the
 * app, which lives only in this browser.
 *
 * Storage (chrome.storage.local):
 *   appResumes        last fetched list, so the panel can draw before the API answers
 *   chosenResumeId    the CV Autofill uploads; the primary CV when unset
 *   cvPdf             { resumeId, updatedAt, dataUrl } for the chosen CV
 */

export function cvUrl(id) {
  return `${APP_URL}/documents/${encodeURIComponent(id)}`;
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
  return withChoice(items, chosenResumeId);
}

export function chooseResume(id) {
  return chrome.storage.local.set({ chosenResumeId: id });
}

/** True when the stored PDF matches this version of the CV. */
export async function hasFreshPdf(resume) {
  const { cvPdf } = await chrome.storage.local.get('cvPdf');
  return cvPdf?.resumeId === resume.id && cvPdf.updatedAt === resume.updatedAt && Boolean(cvPdf.dataUrl);
}

/**
 * The PDF for this CV, made now if the stored one is missing or older than the
 * CV. Making one opens the CV in a background tab for a few seconds.
 */
export async function pdfFor(resume) {
  const { cvPdf } = await chrome.storage.local.get('cvPdf');
  if (cvPdf?.resumeId === resume.id && cvPdf.updatedAt === resume.updatedAt && cvPdf.dataUrl) {
    return { dataUrl: cvPdf.dataUrl, fileName: fileNameFor(resume) };
  }
  const result = await chrome.runtime.sendMessage({ type: 'make-cv-pdf', url: cvUrl(resume.id) });
  if (!result?.dataUrl) throw new Error(result?.error || 'Could not make the CV PDF.');
  await chrome.storage.local.set({ cvPdf: { resumeId: resume.id, updatedAt: resume.updatedAt, dataUrl: result.dataUrl } });
  return { dataUrl: result.dataUrl, fileName: fileNameFor(resume) };
}

export function fileNameFor(resume) {
  const base = resume.name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Resume';
  return `${base.replace(/\.pdf$/i, '')}.pdf`;
}
