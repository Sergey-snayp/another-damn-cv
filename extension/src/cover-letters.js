import { API_URL, signOut } from './auth.js';
import { NotSignedInError } from './jobs.js';
import { toDataUrl } from './resumes.js';

/**
 * The cover letter for a saved job. As with CVs, it is kept on the server:
 * written there by the AI from the chosen CV and the job's description, edited
 * here, and downloaded as a PDF when Autofill attaches it.
 */
async function call(path, init = {}) {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.syncToken) throw new NotSignedInError();
  let response;
  try {
    response = await fetch(`${API_URL}/api/extension/jobs/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${auth.syncToken}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
      cache: 'no-store',
    });
  } catch {
    throw new Error(`Can't reach the app at ${API_URL}. Is the backend running?`);
  }
  if (response.status === 401) { await signOut(); throw new NotSignedInError(); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    throw new Error(typeof message === 'string' ? message : `Server returned ${response.status}.`);
  }
  return response;
}

/** The job's letter, or null when none is written yet. */
export async function coverLetterFor(jobId) {
  return (await (await call(`${encodeURIComponent(jobId)}/cover-letter`)).json()).letter ?? null;
}

/** Writes the letter from the chosen CV (a minute or so). Returns it with notes to check. */
export async function generateCoverLetter(jobId, resumeId, instruction = '') {
  const body = { resumeId, ...(instruction.trim() ? { instruction: instruction.trim().slice(0, 500) } : {}) };
  return (await call(`${encodeURIComponent(jobId)}/cover-letter`, { method: 'POST', body: JSON.stringify(body) })).json();
}

/** The person's own edit. */
export async function saveCoverLetter(jobId, text) {
  return (await call(`${encodeURIComponent(jobId)}/cover-letter`, { method: 'PUT', body: JSON.stringify({ text }) })).json();
}

/** The letter's PDF, printed by the server, ready to attach. */
export async function coverLetterPdf(jobId, fallbackName = 'Cover_Letter.pdf') {
  const response = await call(`${encodeURIComponent(jobId)}/cover-letter/pdf`);
  const disposition = response.headers.get('content-disposition') ?? '';
  let fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const encodedName = /filename\*=UTF-8''([^;\s]+)/i.exec(disposition)?.[1];
  if (encodedName) { try { fileName = decodeURIComponent(encodedName); } catch { /* keep the fallback */ } }
  return { dataUrl: toDataUrl(await response.arrayBuffer()), fileName };
}
