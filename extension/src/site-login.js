import { API_URL, signOut } from './auth.js';
import { NotSignedInError } from './jobs.js';

/**
 * The one login the extension creates and signs in to job-site accounts with
 * (Workday's Create Account), as Simplify keeps one for every site, plus a
 * login of its own for a site where the person changed the password. It lives on
 * your account on the server, encrypted, so a new computer or a cleared browser
 * keeps it. The extension never stores it: it reads it when it fills a form.
 */
async function call(method, body, path = '') {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.syncToken) throw new NotSignedInError();
  let response;
  try {
    response = await fetch(`${API_URL}/api/extension/site-login${path}`, {
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
  return reply;
}

/**
 * { email, password, updatedAt }, or null before the first account. With a
 * site's host: that site's own login when it has one (then `site` is set),
 * else the one saved login.
 */
export const readSiteLogin = async (host) => (await call('GET', undefined, host ? `?host=${encodeURIComponent(host)}` : '')).login ?? null;
export const saveSiteLogin = async (email, password) => (await call('PUT', { email, password })).login ?? null;
/** One site keeps its own login: a password changed on that company's site only. */
export const saveSiteOwnLogin = async (host, email, password) => (await call('PUT', { email, password }, `/sites/${encodeURIComponent(host)}/login`)).login ?? null;
/** The site goes back to the one saved login. Returns the sites that still have their own. */
export const forgetSiteOwnLogin = async (host) => (await call('DELETE', undefined, `/sites/${encodeURIComponent(host)}/login`)).ownLogins ?? [];
/** The job sites (hosts) you have an account on, those with a login of their own, and the email (never a password): for the panel. */
export const siteState = async (host) => {
  const reply = await call('GET', undefined, host ? `?host=${encodeURIComponent(host)}` : '');
  return { email: reply.login?.email ?? null, sites: reply.sites ?? [], ownLogins: reply.ownLogins ?? [] };
};
/** Signing in or creating an account worked on this site. */
export const rememberSite = async (host) => (await call('POST', { host }, '/sites')).sites ?? [];

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

const validLogin = (email, password) => typeof email === 'string' && typeof password === 'string' && /^[^\s@]+@[^\s@]+$/.test(email.trim()) && password.length >= 8 && password.length <= 128;

// ─── "Update your job-site password?" ───────────────────────────────────
// A login that worked on a job site and is not the saved one (a password
// changed on the site) is not saved by itself: the panel asks first, as a
// password manager does. Until then it waits in memory (chrome.storage.session)
// for ten minutes; the panel learns only the site and the email.
const OFFER_MS = 10 * 60_000;
const offerKey = (tabId) => `siteLoginOffer:${tabId}`;

/**
 * 'offered' (the panel will ask), 'same' (already the login this site uses:
 * its own, or the one saved login) or 'skipped'.
 */
export async function offerSiteLogin(tabId, host, email, password) {
  if (!validLogin(email, password)) return 'skipped';
  const login = await readSiteLogin(host);
  if (login && login.email === email.trim() && login.password === password) return 'same';
  await chrome.storage.session.set({ [offerKey(tabId)]: { host, email: email.trim(), password, update: Boolean(login), own: Boolean(login?.site), at: Date.now() } });
  return 'offered';
}

async function storedOffer(tabId) {
  const key = offerKey(tabId);
  const offer = (await chrome.storage.session.get(key))[key];
  if (!offer) return null;
  if (Date.now() - offer.at > OFFER_MS) { await chrome.storage.session.remove(key); return null; }
  return offer;
}

/**
 * What the panel shows: the site, the email, whether it replaces a saved login
 * and whether that site already has its own. Never the password.
 */
export async function offerFor(tabId) {
  const offer = await storedOffer(tabId);
  return offer ? { host: offer.host, email: offer.email, update: offer.update, own: Boolean(offer.own) } : null;
}

/**
 * The person's answer. `scope` 'site': this site keeps the new password as its
 * own, every other site keeps the saved login. 'all': it becomes the saved
 * login for every site (this site's own, if any, is dropped). With no saved
 * login yet it becomes the saved one either way. 'saved' or 'skipped'.
 */
export async function acceptOffer(tabId, scope = 'site') {
  const offer = await storedOffer(tabId);
  await chrome.storage.session.remove(offerKey(tabId));
  if (!offer) return 'skipped';
  if (offer.update && scope === 'site') {
    await saveSiteOwnLogin(offer.host, offer.email, offer.password);
    return 'saved';
  }
  await saveSiteLogin(offer.email, offer.password);
  if (offer.own) await forgetSiteOwnLogin(offer.host);
  return 'saved';
}

export const dismissOffer = (tabId) => chrome.storage.session.remove(offerKey(tabId));

// ─── A sign-in in flight ──────────────────────────────────────────────────
// What was sent on a job site's account form, kept by the background in memory
// only (chrome.storage.session, which page scripts cannot read) for a minute,
// so the next page can confirm it worked even when the site loads a new page.
const ATTEMPT_MS = 60_000;
const attemptKey = (tabId) => `siteLoginAttempt:${tabId}`;

export async function noteAttempt(tabId, host, email, password) {
  if (typeof email !== 'string' || typeof password !== 'string') return;
  await chrome.storage.session.set({ [attemptKey(tabId)]: { host, email: email.trim(), password, at: Date.now() } });
}

export async function attemptFor(tabId, host) {
  const key = attemptKey(tabId);
  const attempt = (await chrome.storage.session.get(key))[key];
  if (!attempt) return null;
  if (attempt.host !== host || Date.now() - attempt.at > ATTEMPT_MS) { await chrome.storage.session.remove(key); return null; }
  return attempt;
}

export const dropAttempt = (tabId) => chrome.storage.session.remove(attemptKey(tabId));

/** The next page says the sign-in worked: offered if it is not the saved login. 'offered', 'same' or 'skipped'. */
export async function confirmAttempt(tabId, host) {
  const attempt = await attemptFor(tabId, host);
  await dropAttempt(tabId);
  return attempt ? offerSiteLogin(tabId, host, attempt.email, attempt.password) : 'skipped';
}
