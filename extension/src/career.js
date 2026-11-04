import { API_URL, signOut } from './auth.js';
import { NotSignedInError } from './jobs.js';

/**
 * Experience, education, skills and summary for the Profile tab, from the
 * app's Profile or from one CV, plus the fields Autofill takes from them
 * (`fields`: current company and title, years, school, degree…).
 *
 * The last copy of each is kept in chrome.storage.local (`careerCache`), so
 * the tab shows something at once and offline.
 */

async function get(path) {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.syncToken) throw new NotSignedInError();
  let response;
  try {
    response = await fetch(`${API_URL}/api/extension/profile${path}`, { headers: { Authorization: `Bearer ${auth.syncToken}` } });
  } catch {
    throw new Error(`Can't reach the app at ${API_URL}. Is the backend running?`);
  }
  if (response.status === 401) { await signOut(); throw new NotSignedInError(); }
  if (!response.ok) {
    const reply = await response.json().catch(() => ({}));
    throw new Error(typeof reply.message === 'string' ? reply.message : `Server returned ${response.status}.`);
  }
  return response.json();
}

/** The cached copies: { profile, resumes: { [id]: view } }. */
export async function cachedCareer() {
  const { careerCache } = await chrome.storage.local.get('careerCache');
  return { profile: careerCache?.profile ?? null, resumes: careerCache?.resumes ?? {} };
}

async function keep(update) {
  const current = await cachedCareer();
  const next = update(current);
  if (JSON.stringify(next) !== JSON.stringify(current)) await chrome.storage.local.set({ careerCache: next });
  return next;
}

/** The Profile's career sections, fresh from the server. */
export async function fetchProfileCareer() {
  const view = await get('/career');
  await keep((cache) => ({ ...cache, profile: view }));
  return view;
}

/** One CV's career sections, fresh from the server. Only the latest few CVs are cached. */
export async function fetchResumeCareer(id) {
  const view = await get(`/career/resume/${encodeURIComponent(id)}`);
  await keep((cache) => ({ ...cache, resumes: Object.fromEntries([...Object.entries(cache.resumes).filter(([key]) => key !== id).slice(-4), [id, view]]) }));
  return view;
}

/** Fields Autofill takes from a career view. */
export const CAREER_KEYS = ['currentCompany', 'currentTitle', 'yearsExperience', 'school', 'degree', 'fieldOfStudy', 'graduationYear'];
