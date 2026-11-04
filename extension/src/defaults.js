import { API_URL, signOut } from './auth.js';
import { NotSignedInError } from './jobs.js';

/**
 * Default answers stored on your account, set from a field's icon on a form
 * (or the panel's "Answer once" card):
 *
 *   workAuthorization / requiresSponsorship, per country ("Poland")
 *   workedHereBefore, one answer for every company
 *   willingToRelocate, per country
 *
 * A copy is kept in chrome.storage.local as `autofillDefaults`, so the page
 * scripts can show the current default without asking the server.
 */

async function call(path, { method = 'GET', body } = {}) {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.syncToken) throw new NotSignedInError();
  let response;
  try {
    response = await fetch(`${API_URL}/api/extension${path}`, {
      method,
      headers: { Authorization: `Bearer ${auth.syncToken}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error(`Can't reach the app at ${API_URL}. Is the backend running?`);
  }
  if (response.status === 401) { await signOut(); throw new NotSignedInError(); }
  if (!response.ok) {
    const reply = await response.json().catch(() => ({}));
    throw new Error(typeof reply.message === 'string' ? reply.message : `Server returned ${response.status}.`);
  }
  return response.status === 204 ? null : response.json();
}

const sameScope = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/** The local copy, written only when it changed (the panel refreshes on every storage change). */
async function keep(defaults) {
  const rows = defaults.map(({ id, kind, scope, value }) => ({ id, kind, scope, value }));
  const { autofillDefaults = [] } = await chrome.storage.local.get('autofillDefaults');
  if (JSON.stringify(autofillDefaults) !== JSON.stringify(rows)) await chrome.storage.local.set({ autofillDefaults: rows });
  return rows;
}

/** Fetches the account's defaults and refreshes the local copy. */
export async function syncDefaults() {
  return keep(await call('/defaults'));
}

export async function saveDefault(kind, scope, value) {
  await call('/defaults', { method: 'POST', body: { defaults: [{ kind, scope: scope ?? '', value }] } });
  return syncDefaults();
}

export async function removeDefault(kind, scope) {
  const rows = await syncDefaults();
  const row = rows.find((item) => item.kind === kind && sameScope(item.scope, scope));
  if (row) await call(`/defaults/${encodeURIComponent(row.id)}`, { method: 'DELETE' });
  return syncDefaults();
}

export async function removeDefaultById(id) {
  await call(`/defaults/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return syncDefaults();
}

/**
 * Eligibility answers kept in this browser before 0.27.0 move to the account
 * once, the first time the panel opens signed in. The local copy is removed
 * only after the server stored them.
 */
export async function moveLocalEligibility() {
  const { eligibility } = await chrome.storage.local.get('eligibility');
  const entries = Object.entries(eligibility ?? {}).filter(([, value]) => String(value ?? '').trim());
  if (entries.length) {
    await call('/defaults', {
      method: 'POST',
      body: { defaults: entries.map(([key, value]) => { const [kind, ...scope] = key.split(':'); return { kind, scope: scope.join(':'), value }; }) },
    });
  }
  if (eligibility) await chrome.storage.local.remove('eligibility');
}

/** Eligibility answers as Autofill reads them: "requiresSponsorship:Poland" → "Yes"; the general one has no country. */
export function eligibilityMap(defaults = []) {
  return Object.fromEntries(defaults
    .filter((row) => row.kind === 'workAuthorization' || row.kind === 'requiresSponsorship')
    .map((row) => [row.scope ? `${row.kind}:${row.scope}` : row.kind, row.value]));
}

/** Relocation answers as Autofill reads them: { Poland: 'Yes', '': 'No' } ('' names no country). */
export function relocationMap(defaults = []) {
  return Object.fromEntries(defaults.filter((row) => row.kind === 'willingToRelocate').map((row) => [row.scope, row.value]));
}

/** Your one "worked here before" answer for every company, if you chose it. */
export function workedBeforeFor(defaults = []) {
  return defaults.find((row) => row.kind === 'workedHereBefore' && !row.scope)?.value ?? '';
}

/** Sets profile values the form asked for (phone, LinkedIn…), and updates the local profile. */
export async function saveProfileValues(values) {
  const saved = await call('/profile', { method: 'PATCH', body: values });
  const { profile = {} } = await chrome.storage.local.get('profile');
  await chrome.storage.local.set({ profile: { ...profile, ...saved } });
  return saved;
}

/** Forgets the saved answer to a company question ("Reset" on its icon). */
export function forgetAnswer(question) {
  return call('/answers/forget', { method: 'POST', body: { question } });
}
