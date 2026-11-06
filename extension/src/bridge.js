/**
 * The bridge between the CV Platform web app and this extension.
 *
 * Runs only on the web app's own page. No token: nothing crosses a trust
 * boundary — same browser, same user, and the page already proved who it was by
 * holding a valid session.
 *
 * Two checks matter. `event.source !== window` rejects anything posted from an
 * iframe, and the origin check rejects any other page. Without them any site
 * could overwrite your stored profile.
 */

const ALLOWED_ORIGIN = 'http://localhost:5173';

const PING = 'CV_PLATFORM_PING';
const READY = 'CV_PLATFORM_EXTENSION_READY';
const PROFILE = 'CV_PLATFORM_PROFILE';
const ACK = 'CV_PLATFORM_PROFILE_ACK';
// A CV changed in the app, or the app says which CV Autofill should use (as
// Simplify's site does after tailoring). Only ids cross over: the panel then
// fetches everything from the server itself.
const RESUMES_CHANGED = 'CV_PLATFORM_RESUMES_CHANGED';
const USE_RESUME = 'CV_PLATFORM_USE_RESUME';
const isResumeId = (value) => typeof value === 'string' && /^[\w-]{1,80}$/.test(value);

/** Tells the extension's open panels; none open is normal. */
function tellPanels(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

console.log('[cv-autofill] bridge injected on', location.origin);

function announce() {
  window.postMessage({ type: READY }, ALLOWED_ORIGIN);
}

async function storeProfile(incoming) {
  // Merge rather than replace: local-only details edited in the panel must
  // survive a sync. CV PDFs are stored separately (src/resumes.js).
  const { profile: existing = {} } = await chrome.storage.local.get('profile');
  const profile = { ...existing, ...incoming };

  await chrome.storage.local.set({
    profile,
    sync: { lastSyncedAt: new Date().toISOString(), source: 'web-app' },
  });
}

window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  if (event.origin !== ALLOWED_ORIGIN) return;

  const message = event.data;
  if (!message || typeof message.type !== 'string') return;

  // The page asks whether we are here. Announcing once on load is not enough:
  // the script may run before React has attached its listener, and that
  // announcement would be lost.
  if (message.type === PING) {
    announce();
    return;
  }

  if (message.type === RESUMES_CHANGED) {
    tellPanels({ type: 'app-resumes-changed', ...(isResumeId(message.resumeId) ? { resumeId: message.resumeId } : {}) });
    return;
  }

  if (message.type === USE_RESUME && isResumeId(message.resumeId)) {
    // Stored even with no panel open, so the next one uses it.
    await chrome.storage.local.set({ chosenResumeId: message.resumeId });
    tellPanels({ type: 'app-use-resume', resumeId: message.resumeId });
    return;
  }

  if (message.type === PROFILE) {
    try {
      await storeProfile(message.profile);
      window.postMessage({ type: ACK, ok: true }, ALLOWED_ORIGIN);
    } catch (err) {
      window.postMessage({ type: ACK, ok: false, error: err.message }, ALLOWED_ORIGIN);
    }
  }
});

// Covers the other order: page listening first, extension injected after.
announce();
