import { matchAnswers, saveAnswers } from './answers.js';
import { forgetAnswer, removeDefault, saveDefault, saveProfileValues } from './defaults.js';
import { NotSignedInError } from './jobs.js';

/**
 * The toolbar icon toggles the in-page panel (src/panel-host.js).
 *
 * Supported job boards already have the content scripts. On any other site the
 * click grants temporary access to that tab (activeTab), and the same bundle is
 * injected then.
 *
 * Tabs with the panel open are remembered in session storage, so the panel
 * reopens after the page in that tab changes.
 */

// ─── Next steps of a multi-step form ──────────────────────────────────────
// Settings → "Keep filling the next steps". The panel arms a tab after the
// person presses Autofill; the page script asks for the same data when a new
// step appears. Stored in session storage, for this site only, for 30 minutes.
const STEP_MINUTES = 30;
const stepKey = (tabId) => `steps:${tabId}`;
async function armedSteps(tabId, url) {
  const { [stepKey(tabId)]: armed } = await chrome.storage.session.get(stepKey(tabId));
  if (!armed) return null;
  let host = '';
  try { host = new URL(url).host; } catch { /* no address */ }
  const { continueSteps } = await chrome.storage.local.get('continueSteps');
  if (armed.expires < Date.now() || armed.host !== host || continueSteps !== true) {
    await chrome.storage.session.remove(stepKey(tabId));
    return null;
  }
  return armed;
}

const PAGE_SCRIPTS = ['src/sites.js', 'src/fields.js', 'src/filler.js', 'src/marks.js', 'src/launcher.js', 'src/panel-host.js', 'src/job-form.js', 'src/content.js'];
const PANEL_URL = chrome.runtime.getURL('src/sidepanel.html');

/** Pages where Chrome loads PAGE_SCRIPTS itself, from the manifest's match patterns. */
const MANIFEST_PAGES = chrome.runtime.getManifest().content_scripts
  .filter((entry) => entry.js.includes('src/panel-host.js'))
  .flatMap((entry) => entry.matches)
  .map((pattern) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`));
const hasManifestScripts = (url = '') => MANIFEST_PAGES.some((pattern) => pattern.test(url));

async function openTabs() {
  const { panelTabs = [] } = await chrome.storage.session.get('panelTabs');
  return new Set(panelTabs);
}
// Writes run one at a time so quick open/close messages cannot overwrite each other.
let writes = Promise.resolve();
function setTabOpen(tabId, open) {
  writes = writes.then(async () => {
    const tabs = await openTabs();
    if (open === tabs.has(tabId)) return;
    open ? tabs.add(tabId) : tabs.delete(tabId);
    await chrome.storage.session.set({ panelTabs: [...tabs] });
  }).catch(() => {});
  return writes;
}

/** True when the page already runs the panel host. */
async function hasPanelHost(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({ target: { tabId }, func: () => Boolean(window.CVAutofillPanel) });
    return Boolean(result?.result);
  } catch {
    return false;
  }
}

async function injectPanel(tabId) {
  if (await hasPanelHost(tabId)) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: PAGE_SCRIPTS });
    // React dropdown helper, in the page's own world (see page-world.js).
    await chrome.scripting.executeScript({ target: { tabId }, files: ['src/page-world.js'], world: 'MAIN' }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!Number.isInteger(tab.id)) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'panel-toggle' }, { frameId: 0 });
    return;
  } catch {
    // No panel host in this page yet.
  }
  // Mark the tab first: the injected host asks for its state as it starts.
  await setTabOpen(tab.id, true);
  if (!(await injectPanel(tab.id))) {
    await setTabOpen(tab.id, false);
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    await chrome.action.setTitle({ tabId: tab.id, title: 'CV Autofill cannot open on this page.' });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !Number.isInteger(sender.tab?.id)) return false;
  const tabId = sender.tab.id;
  const fromPage = sender.frameId === 0 && !sender.url?.startsWith('chrome-extension:');
  // The page scripts in any frame of the tab (forms can be embedded in iframes).
  const fromContent = !sender.url?.startsWith('chrome-extension:');
  const fromPanel = sender.url?.startsWith(PANEL_URL);

  if (message?.type === 'panel-tab' && fromPanel) {
    sendResponse({ tabId });
    return false;
  }
  if (message?.type === 'arm-steps' && fromPanel) {
    const armed = { host: message.host, company: message.company ?? '', profile: message.profile, useAnswers: message.useAnswers === true, expires: Date.now() + STEP_MINUTES * 60_000 };
    chrome.storage.session.set({ [stepKey(tabId)]: armed })
      // Every frame: an embedded form's next steps fill too.
      .then(() => chrome.tabs.sendMessage(tabId, { type: 'steps-armed' }).catch(() => {}))
      .then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  if (message?.type === 'make-cv-pdf' && fromPanel) {
    makeCvPdf(String(message.url ?? '')).then((dataUrl) => sendResponse({ dataUrl }), (error) => sendResponse({ error: error.message }));
    return true;
  }
  // The tab's address, not the frame's: an embedded form lives on another site.
  if (message?.type === 'steps-state' && fromContent) {
    armedSteps(tabId, sender.tab.url).then((armed) => sendResponse({ armed: Boolean(armed) }), () => sendResponse({ armed: false }));
    return true;
  }
  if (message?.type === 'step-request' && fromContent) {
    void (async () => {
      const armed = await armedSteps(tabId, sender.tab.url);
      if (!armed) return sendResponse({ armed: false });
      const questions = Array.isArray(message.questions) ? message.questions : [];
      let answers = [];
      if (armed.useAnswers && questions.length) {
        try {
          const { matches } = await matchAnswers(armed.company, questions);
          answers = matches.map((match) => ({ id: match.id, value: match.value, match: match.match, savedQuestion: match.savedQuestion, kind: questions.find((question) => question.id === match.id)?.kind }));
        } catch { /* signed out or offline: profile fields still fill */ }
      }
      sendResponse({ armed: true, profile: armed.profile, answers });
    })().catch(() => sendResponse({ armed: false }));
    return true;
  }
  // A default chosen from a field's icon on the page (marks.js), in any frame.
  if ((message?.type === 'default-save' || message?.type === 'default-reset') && fromContent) {
    changeDefault(message).then(sendResponse, (error) => sendResponse({
      ok: false,
      message: error instanceof NotSignedInError ? 'Not saved: sign in from the panel first.' : `Not saved: ${error.message}`,
    }));
    return true;
  }
  if (!fromPage) { sendResponse({ ok: false }); return false; }
  if (message?.type === 'panel-state') {
    openTabs().then((tabs) => sendResponse({ open: tabs.has(tabId) }), () => sendResponse({ open: false }));
    return true;
  }
  if (message?.type === 'panel-opened' || message?.type === 'panel-closed') {
    void setTabOpen(tabId, message.type === 'panel-opened');
    sendResponse({ ok: true }); // Always answer, so the page never waits on a closed channel.
  }
  return false;
});

// Pages without the manifest content scripts lose the panel on reload; put it back
// where this tab still allows it. A refused injection just forgets the tab.
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.url) void chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
  if (info.status !== 'complete') return;
  if (!(await openTabs()).has(tabId)) return;
  if (hasManifestScripts(tab.url)) return; // The page's own host reopens the panel.
  if (!(await injectPanel(tabId))) await setTabOpen(tabId, false);
});
const DEFAULT_KINDS = new Set(['workAuthorization', 'requiresSponsorship', 'workedHereBefore', 'willingToRelocate']);
// Same list as the server's (EXTENSION_PROFILE_KEYS): name and email stay in the app.
const PROFILE_KEYS = new Set(['preferredName', 'phone', 'location', 'city', 'state', 'country', 'postalCode', 'linkedin', 'github', 'portfolio', 'website', 'telegram', 'workAuthorization', 'requiresSponsorship', 'salaryExpectation', 'noticePeriod', 'workArrangements']);

/**
 * Saves or forgets one default on the account. `target` says where it lives:
 * { type: 'default', kind, scope } for eligibility (per country) and worked
 * here before (per company), { type: 'profile', key } for a profile value,
 * { type: 'answer', question, company } for a company's own question.
 */
async function changeDefault({ type, target = {}, value }) {
  const text = String(value ?? '').trim().slice(0, 5000);
  const reset = type === 'default-reset';
  if (!reset && !text) return { ok: false, message: 'Choose or type a value first.' };
  if (target.type === 'default' && DEFAULT_KINDS.has(target.kind)) {
    const scope = String(target.scope ?? '').slice(0, 200);
    if (reset) await removeDefault(target.kind, scope); else await saveDefault(target.kind, scope, text.slice(0, 500));
    return { ok: true };
  }
  if (target.type === 'answer' && target.question) {
    if (reset) await forgetAnswer(String(target.question).slice(0, 500));
    else await saveAnswers(String(target.company ?? '').slice(0, 200), [{ question: String(target.question).slice(0, 500), answer: text }]);
    return { ok: true };
  }
  if (target.type === 'profile' && PROFILE_KEYS.has(target.key) && !reset) {
    await saveProfileValues({ [target.key]: text.slice(0, 500) });
    return { ok: true };
  }
  return { ok: false, message: 'This field has no default to change.' };
}

chrome.tabs.onRemoved.addListener((tabId) => {
  void setTabOpen(tabId, false);
  void chrome.storage.session.remove(stepKey(tabId)).catch(() => {});
});

/**
 * PDFs added by hand before 0.13.0 are removed: the Resume tab now uses the
 * CVs from the app's Documents. Runs once per install or update.
 */
async function removeLocalPdfs() {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((key) => key === 'resumes' || key === 'activeResumeId' || key.startsWith('resume:'));
  if (all.profile && ('resumeDataUrl' in all.profile || 'resumeFileName' in all.profile)) {
    const { resumeDataUrl: _pdf, resumeFileName: _name, ...profile } = all.profile;
    await chrome.storage.local.set({ profile });
  }
  if (keys.length) await chrome.storage.local.remove(keys);
}
chrome.runtime.onInstalled.addListener(() => void removeLocalPdfs().catch((err) => console.error('[cv-autofill] cleanup failed', err)));

// ─── CV PDFs ────────────────────────────────────────────────────────────────
// The app makes PDFs only through the browser's print. To upload a CV, open its
// app page in a background tab, where you are already signed in and your CV
// style is stored, and save it as a PDF the same way Print / PDF does. Chrome
// shows its "started debugging this browser" bar while this runs.

const APP_URL = 'http://localhost:5173'; // Same as APP_URL in src/jobs.js.

/** Resolves 'ready' once the CV has drawn, 'login' when the app wants a sign-in. */
const CV_READY = `new Promise((resolve) => {
  const started = Date.now();
  let loginSince = 0;
  (function check() {
    if (document.querySelector('.docwrap .page')) {
      document.fonts.ready.then(() => setTimeout(() => resolve('ready'), 400));
      return;
    }
    // The sign-in screen can flash while the session loads; only a lasting one counts.
    if (document.querySelector('.login')) { loginSince ||= Date.now(); if (Date.now() - loginSince > 2000) return resolve('login'); }
    else loginSince = 0;
    if (Date.now() - started > 20000) return resolve('timeout');
    setTimeout(check, 200);
  })();
})`;

function waitForLoad(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error('The app did not open in time. Is it running?')); }, 20000);
    function listener(id, info) {
      if (id !== tabId || info.status !== 'complete') return;
      clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve();
    }
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => { if (tab.status === 'complete') listener(tabId, { status: 'complete' }); }, () => {});
  });
}

async function printCv(url) {
  if (!url.startsWith(`${APP_URL}/documents/`)) throw new Error('This is not a CV page.');
  const tab = await chrome.tabs.create({ url, active: false });
  const target = { tabId: tab.id };
  let attached = false;
  try {
    await waitForLoad(tab.id);
    await chrome.debugger.attach(target, '1.3');
    attached = true;
    const { result } = await chrome.debugger.sendCommand(target, 'Runtime.evaluate', { expression: CV_READY, awaitPromise: true, returnByValue: true });
    if (result?.value === 'login') throw new Error('Sign in to the app in this browser, then try again.');
    if (result?.value !== 'ready') throw new Error('The CV did not load in time. Is the app running?');
    const { data } = await chrome.debugger.sendCommand(target, 'Page.printToPDF', { printBackground: true, preferCSSPageSize: true });
    return `data:application/pdf;base64,${data}`;
  } catch (error) {
    if (/debugger|detached|canceled/i.test(error?.message || '')) throw new Error('Chrome stopped making the PDF. Try again, and leave the debugging bar open until it finishes.');
    throw error;
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => {});
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

// One PDF at a time: two panels asking at once would fight over the debugger.
let pdfQueue = Promise.resolve();
function makeCvPdf(url) {
  const run = pdfQueue.then(() => printCv(url));
  pdfQueue = run.catch(() => {});
  return run;
}
