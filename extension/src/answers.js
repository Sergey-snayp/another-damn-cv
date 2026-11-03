import { API_URL, signOut } from './auth.js';
import { NotSignedInError } from './jobs.js';

/**
 * Saved answers to application questions, stored on your account. Autofill
 * asks for matches to the form's questions; "Save answers from this form"
 * stores what you typed. Matching rules live on the server (answers module).
 */
async function post(path, body) {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.syncToken) throw new NotSignedInError();
  let response;
  try {
    response = await fetch(`${API_URL}/api/extension/answers${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.syncToken}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Can't reach the app at ${API_URL}. Is the backend running?`);
  }
  if (response.status === 401) { await signOut(); throw new NotSignedInError(); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.message === 'string' ? body.message : `Server returned ${response.status}.`);
  }
  return response.json();
}

/** Matches for the form's questions: { matches: [{ id, value, match, savedQuestion }], skipped }. */
export function matchAnswers(company, questions) {
  return post('/match', { company, questions: questions.slice(0, 100).map(({ id, question, kind, options }) => ({ id, question, kind, ...(options && { options: options.slice(0, 200) }) })) });
}

export function saveAnswers(company, answers) {
  return post('', { company, answers });
}

/** An AI draft for one question: { answer, needsInput }. Runs Claude on the server. */
export function draftAnswer(request) {
  return post('/draft', request);
}
