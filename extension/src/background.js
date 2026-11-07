import { matchAnswers, saveAnswers } from './answers.js';
import { forgetAnswer, removeDefault, saveDefault, saveProfileValues } from './defaults.js';
import { captureTab, draftAnswer, jobForDraft, lookupJob, markApplied, NotSignedInError, sendCapture, unsendableReason } from './jobs.js';

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

const PAGE_SCRIPTS = ['src/top-layer.js', 'src/site-fields.js', 'src/sites.js', 'src/fields.js', 'src/filler.js', 'src/marks.js', 'src/linkedin.js', 'src/logo.js', 'src/job-details.js', 'src/launcher.js', 'src/panel-host.js', 'src/job-form.js', 'src/content.js'];
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

  // ✦ Generate answer in a field's popover: Claude writes it from the chosen CV and the job.
  if (message?.type === 'answer-draft' && fromContent) {
    void (async () => {
      const { chosenResumeId } = await chrome.storage.local.get('chosenResumeId');
      if (!chosenResumeId) return sendResponse({ ok: false, message: 'Choose a CV in the panel first: the answer is written from it.' });
      const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
      const page = message.job ?? {};
      const fromPage = Object.fromEntries(Object.entries({ title: text(page.title, 300), company: text(page.company, 200), text: text(page.text, 40000) }).filter(([, value]) => value));
      const url = typeof message.jobUrl === 'string' && message.jobUrl ? message.jobUrl : sender.tab.url ?? '';
      const draft = await draftAnswer({
        question: text(message.question, 500),
        kind: message.kind,
        ...(Array.isArray(message.options) && message.options.length && { options: message.options.map((option) => text(option, 300)).slice(0, 200) }),
        ...(Number.isInteger(message.maxLength) && message.maxLength > 0 && { maxLength: message.maxLength }),
        job: await jobForDraft(url, fromPage),
        resumeId: chosenResumeId,
      });
      sendResponse({ ok: true, ...draft });
    })().catch((error) => sendResponse({ ok: false, message: error instanceof NotSignedInError ? 'Sign in from the panel first.' : error.message }));
    return true;
  }
  // The person submitted the application form: the saved job moves to Applied.
  if (message?.type === 'application-submitted' && fromContent) {
    const url = typeof message.jobUrl === 'string' && message.jobUrl ? message.jobUrl : sender.tab.url ?? '';
    const answers = (Array.isArray(message.answers) ? message.answers : [])
      .filter((item) => typeof item?.question === 'string' && typeof item?.answer === 'string')
      .map((item) => ({ question: item.question.slice(0, 500), answer: item.answer.slice(0, 5000) }))
      .slice(0, 200);
    void markApplied(url, answers).then((moved) => {
      // An open panel shows the new status on its job card.
      if (moved) chrome.runtime.sendMessage({ type: 'job-saved', url }).catch(() => {});
    }, () => {});
    sendResponse({ ok: true });
    return false;
  }
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
  // PDFs the extension made itself before 0.35.0: CV PDFs now come from the server.
  const keys = Object.keys(all).filter((key) => key === 'resumes' || key === 'activeResumeId' || key === 'cvPdf' || key === 'cvPdfs' || key.startsWith('resume:'));
  if (all.profile && ('resumeDataUrl' in all.profile || 'resumeFileName' in all.profile)) {
    const { resumeDataUrl: _pdf, resumeFileName: _name, ...profile } = all.profile;
    await chrome.storage.local.set({ profile });
  }
  if (keys.length) await chrome.storage.local.remove(keys);
}
chrome.runtime.onInstalled.addListener(() => {
  void removeLocalPdfs().catch((err) => console.error('[cv-autofill] cleanup failed', err));
  // Right-click on a page → "Save job to Another Damn CV".
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create({ id: SAVE_JOB_MENU, title: 'Save job to Another Damn CV', contexts: ['page'] }));
});

// ─── Save a job from the right-click menu ─────────────────────────────────
// Saves the page's job without opening the panel, like Simplify's "Save job
// to Simplify". The toolbar icon shows ✓ for two seconds when it worked (or
// the job was saved before: never saved twice) and ! when it did not.
// Signed out: ! and the panel opens, so the person can sign in.
const SAVE_JOB_MENU = 'save-job';

function flashBadge(tabId, ok) {
  void chrome.action.setBadgeBackgroundColor({ tabId, color: ok ? '#15803d' : '#d93025' }).catch(() => {});
  void chrome.action.setBadgeTextColor?.({ tabId, color: '#ffffff' })?.catch(() => {});
  void chrome.action.setBadgeText({ tabId, text: ok ? '✓' : '!' }).catch(() => {});
  setTimeout(() => void chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {}), 2500);
}

/** The page's title, company and logo, from the page scripts (src/logo.js, content.js). */
async function pageDetails(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const context = typeof scan === 'function' ? scan().context : null;
        const found = context && window.CVAutofillLogo ? window.CVAutofillLogo.find(context.company) : {};
        return { title: context?.title ?? '', company: context?.company ?? '', jobUrl: context?.jobUrl ?? null, logo: found.logo ?? null, domain: found.domain ?? null };
      },
    });
    return result?.result ?? {};
  } catch { return {}; }
}

async function saveJobFromMenu(tab) {
  const tabId = tab.id;
  if (unsendableReason(tab)) { flashBadge(tabId, false); return; }
  try {
    const details = await pageDetails(tabId);
    if (await lookupJob(details.jobUrl || tab.url)) { flashBadge(tabId, true); return; }
    const logo = details.logo || (details.domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(details.domain)}&sz=128` : null);
    const hints = Object.fromEntries(Object.entries({ title: details.title, company: details.company }).filter(([, value]) => value));
    const capture = await captureTab(tabId);
    const currentHints = { ...hints, ...capture.hints };
    await sendCapture({ ...capture, ...(logo && { companyLogo: logo }), ...(Object.keys(currentHints).length && { hints: currentHints }) });
    flashBadge(tabId, true);
    // An open panel on this page shows the job as saved.
    void chrome.runtime.sendMessage({ type: 'job-saved', url: capture.url }).catch(() => {});
  } catch (error) {
    flashBadge(tabId, false);
    if (error instanceof NotSignedInError) {
      await setTabOpen(tabId, true);
      try { await chrome.tabs.sendMessage(tabId, { type: 'panel-open' }, { frameId: 0 }); } catch { await injectPanel(tabId); }
    }
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === SAVE_JOB_MENU && Number.isInteger(tab?.id)) void saveJobFromMenu(tab);
});
