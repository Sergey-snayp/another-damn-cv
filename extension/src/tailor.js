/**
 * Quick tailoring inside the job page: this extension page holds the web app in
 * a frame (panel-host.js puts it in a window over the page).
 *
 * There the app is a third-party frame, so its session cookie is not sent. This
 * page asks the server for a one-time ticket with the extension's sync token and
 * hands it to the app, which trades it for a short session of its own. It also
 * passes on what the app tells the extension (which CV to use) and closes the
 * window when the app says so.
 */
import { API_URL } from './auth.js';
import { APP_URL } from './jobs.js';

const app = document.getElementById('app');
const wait = document.getElementById('wait');
const waitText = document.getElementById('wait-text');
const isResumeId = (value) => typeof value === 'string' && /^[\w-]{1,80}$/.test(value);

/** Asks the window on the job page to close (panel-host.js checks it is this frame). */
const close = () => window.parent.postMessage({ type: 'adcv-tailor-close' }, '*');
document.getElementById('wait-close').addEventListener('click', close);

function problem(text) {
  waitText.textContent = text;
  waitText.classList.add('bad');
  wait.hidden = false;
}

async function ticket() {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.syncToken) throw new Error('Sign in to CV Autofill first, then open Quick tailoring again.');
  const response = await fetch(`${API_URL}/api/auth/embed-ticket`, { method: 'POST', headers: { Authorization: `Bearer ${auth.syncToken}` } });
  if (response.status === 401) throw new Error('CV Autofill was signed out. Sign in again, then open Quick tailoring.');
  if (!response.ok) throw new Error(`Quick tailoring could not open (${response.status}).`);
  return (await response.json()).ticket;
}

// Only Quick tailoring of a saved job opens here.
const path = new URLSearchParams(location.search).get('path') ?? '';
if (!/^\/popup\/jobs\/[\w-]{1,80}\/quick-tailor(\?[\w=&%.-]*)?$/.test(path)) problem('This is not a Quick tailoring link.');
else {
  const url = new URL(path, APP_URL);
  url.searchParams.set('embed', '1');
  app.src = url.href;
}

let handed = false;
addEventListener('message', async (event) => {
  if (event.source !== app.contentWindow || event.origin !== APP_URL) return;
  const message = event.data;
  if (!message || typeof message.type !== 'string') return;
  if (message.type === 'cv-embed-ready') {
    if (handed) return; // One ticket per opening.
    handed = true;
    try {
      app.contentWindow.postMessage({ type: 'cv-embed-ticket', ticket: await ticket() }, APP_URL);
    } catch (error) {
      app.contentWindow.postMessage({ type: 'cv-embed-error', error: error.message }, APP_URL);
    }
    return;
  }
  if (message.type === 'cv-embed-open') { wait.hidden = true; return; }
  if (message.type === 'cv-embed-close') { close(); return; }
  // The same as src/bridge.js does on the app's own tab.
  if (message.type === 'CV_PLATFORM_USE_RESUME' && isResumeId(message.resumeId)) {
    await chrome.storage.local.set({ chosenResumeId: message.resumeId });
    chrome.runtime.sendMessage({ type: 'app-use-resume', resumeId: message.resumeId }).catch(() => {});
    return;
  }
  if (message.type === 'CV_PLATFORM_RESUMES_CHANGED') {
    chrome.runtime.sendMessage({ type: 'app-resumes-changed', ...(isResumeId(message.resumeId) ? { resumeId: message.resumeId } : {}) }).catch(() => {});
  }
});

// The app does not load (the dev server is off, or the page blocks frames).
setTimeout(() => { if (!wait.hidden && !waitText.classList.contains('bad')) problem('Quick tailoring is taking too long to open. Check that the app is running, then try again.'); }, 25_000);
