import { API_URL, signOut } from './auth.js';
import { NotSignedInError } from './jobs.js';

/**
 * The one login the extension creates and signs in to job-site accounts with
 * (Workday's Create Account), as Simplify keeps one for every site. It lives on
 * your account on the server, encrypted, so a new computer or a cleared browser
 * keeps it. The extension never stores it: it reads it when it fills a form.
 */
async function call(method, body) {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.syncToken) throw new NotSignedInError();
  let response;
  try {
    response = await fetch(`${API_URL}/api/extension/site-login`, {
      method,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${auth.syncToken}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error(`Can't reach the app at ${API_URL}. Is the backend running?`);
  }
  if (response.status === 401) { await signOut(); throw new NotSignedInError(); }
  const reply = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof reply.message === 'string' ? reply.message : `Server returned ${response.status}.`);
  return reply.login ?? null;
}

/** { email, password, updatedAt }, or null before the first account. */
export const readSiteLogin = () => call('GET');
export const saveSiteLogin = (email, password) => call('PUT', { email, password });

/**
 * A new password, as Simplify makes one: a capital, a small letter, a digit and
 * a symbol, then 12 more from all four, shuffled. No look-alikes (I, l, O, 0, 1).
 */
export function newSitePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ', lower = 'abcdefghjkmnpqrstuvwxyz', digits = '23456789', symbols = '!@#$%^&*';
  const all = upper + lower + digits + symbols;
  const random = crypto.getRandomValues(new Uint32Array(16));
  const pick = (set, index) => set[random[index] % set.length];
  const characters = [pick(upper, 0), pick(lower, 1), pick(digits, 2), pick(symbols, 3), ...Array.from({ length: 12 }, (_, index) => pick(all, 4 + index))];
  const order = crypto.getRandomValues(new Uint32Array(characters.length));
  return characters.map((character, index) => ({ character, sort: order[index] })).sort((a, b) => a.sort - b.sort).map(({ character }) => character).join('');
}
