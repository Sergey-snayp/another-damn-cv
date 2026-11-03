import { signIn, signOut, currentUser, pullProfile, redirectUri } from './auth.js';
import { captureTab, jobUrl, NotSignedInError, requestSiteAccess, sendCapture, unsendableReason, APP_URL } from './jobs.js';
import { icon, escapeHtml as esc } from './icons.js';
import { cachedResumes, chooseResume, cvTexts, cvUrl, fetchResumes, fileNameFor, hasFreshPdf, pdfFor } from './resumes.js';
import { findKeywords, jobFromCapture, looksLikeJobPosting, matchLabel, scoreCv } from './match.js';
import { draftAnswer, matchAnswers, saveAnswers } from './answers.js';

const FIELD_LABELS = {
  firstName: 'First name', lastName: 'Last name', middleName: 'Middle name', preferredName: 'Preferred name', fullName: 'Full name', email: 'Email', phone: 'Phone', pronouns: 'Pronouns', location: 'Location', city: 'City', state: 'State / province', country: 'Country', postalCode: 'Postal code', addressLine: 'Address', linkedin: 'LinkedIn', github: 'GitHub', portfolio: 'Portfolio', website: 'Website', telegram: 'Telegram', workedHereBefore: 'Worked here before', eeoGender: 'Gender', eeoHispanic: 'Hispanic or Latino', eeoRace: 'Race or ethnicity', eeoVeteran: 'Veteran status', eeoDisability: 'Disability', twitter: 'Twitter / X', resume: 'Resume', coverLetter: 'Cover letter', currentCompany: 'Current company', currentTitle: 'Current title', yearsExperience: 'Years of experience', school: 'School', degree: 'Degree', fieldOfStudy: 'Field of study', graduationYear: 'Graduation year', workAuthorization: 'Work authorization', requiresSponsorship: 'Needs sponsorship', salaryExpectation: 'Salary expectation', noticePeriod: 'Notice period',
};
const PROFILE_GROUPS = [
  { title: 'Personal', keys: ['fullName', 'firstName', 'lastName', 'preferredName', 'email', 'phone'] },
  { title: 'Location', keys: ['location', 'city', 'state', 'country', 'postalCode'] },
  { title: 'Links', keys: ['linkedin', 'github', 'portfolio', 'website', 'telegram'] },
  { title: 'Eligibility', keys: ['workAuthorization', 'requiresSponsorship', 'salaryExpectation', 'noticePeriod'] },
];
const DERIVED_KEYS = ['currentCompany', 'currentTitle', 'yearsExperience'];
// Settings → "Fields to fill": each group can be switched off. All start on.
const FILL_GROUPS = [
  { id: 'contact', label: 'Contact', keys: ['firstName', 'lastName', 'middleName', 'preferredName', 'fullName', 'email', 'phone', 'pronouns'] },
  { id: 'location', label: 'Location', keys: ['location', 'city', 'state', 'country', 'postalCode', 'addressLine'] },
  { id: 'links', label: 'Links', keys: ['linkedin', 'github', 'portfolio', 'website', 'twitter', 'telegram'] },
  { id: 'documents', label: 'CV and cover letter', keys: ['resume', 'coverLetter'] },
  { id: 'experience', label: 'Experience and education', keys: ['currentCompany', 'currentTitle', 'yearsExperience', 'school', 'degree', 'fieldOfStudy', 'graduationYear', 'workedHereBefore'] },
  { id: 'workAuthorization', label: 'Work authorization', keys: ['workAuthorization', 'requiresSponsorship'] },
  { id: 'salary', label: 'Salary and availability', keys: ['salaryExpectation', 'noticePeriod'] },
  // The company's own questions, from answers saved in the app. Not a profile field group.
  { id: 'answers', label: 'Saved answers', keys: [] },
  // Off unless switched on: answers live only in this browser (diversityAnswers).
  { id: 'diversity', label: 'Diversity questions', keys: ['eeoGender', 'eeoHispanic', 'eeoRace', 'eeoVeteran', 'eeoDisability'] },
];
/** Choices per diversity question. Each starts as "Prefer not to answer". */
const DIVERSITY_CHOICES = {
  eeoGender: { label: 'Gender', choices: ['Prefer not to answer', 'Woman', 'Man', 'Non-binary'] },
  eeoHispanic: { label: 'Hispanic or Latino', choices: ['Prefer not to answer', 'Yes', 'No'] },
  eeoRace: { label: 'Race or ethnicity', choices: ['Prefer not to answer', 'American Indian or Alaska Native', 'Asian', 'Black or African American', 'Hispanic or Latino', 'Native Hawaiian or Other Pacific Islander', 'White', 'Two or more races'] },
  eeoVeteran: { label: 'Veteran status', choices: ['Prefer not to answer', 'I am not a protected veteran', 'I am a protected veteran'] },
  eeoDisability: { label: 'Disability', choices: ['Prefer not to answer', 'No', 'Yes'] },
};
let diversityAnswers = {}, continueSteps = false, eligibility = {}, acknowledgeRequired = false;

// ─── Eligibility, asked once per country ─────────────────────────────────
// "Do you require sponsorship to work in Poland?" can have a different answer
// from the same question about the person's own country. Answers are kept in
// this browser, per question type and country (eligibility).
const ELIGIBILITY_KEYS = ['requiresSponsorship', 'workAuthorization'];
const eligibilityKey = (field) => (field.country ? `${field.key}:${field.country}` : field.key);
function hasEligibilityAnswer(field) {
  if (eligibility[eligibilityKey(field)]) return true;
  const home = String(profile.country ?? '').trim().toLowerCase();
  return (!field.country || field.country.toLowerCase() === home) && Boolean(eligibility[field.key] || profile[field.key]);
}
function eligibilityQuestion(field) {
  const where = field.country ? ` in ${field.country}` : '';
  return field.key === 'requiresSponsorship' ? `Will you need visa sponsorship to work${where}?` : `Are you legally allowed to work${where}?`;
}
function eligibilityCard() {
  const open = (scan?.fields ?? []).filter(field => ELIGIBILITY_KEYS.includes(field.key) && groupOn(field.key) && !hasEligibilityAnswer(field));
  if (!open.length) return '';
  return `<div class="card eligibility-card"><h2>${icon('check')}Answer once</h2><p>This form asks about eligibility. Your answer is kept in this browser and used on later forms.</p><ul class="eligibility-list">${open.map(field => `<li><span>${esc(eligibilityQuestion(field))}</span><span class="eligibility-buttons"><button class="ghost small" data-eligibility="${esc(eligibilityKey(field))}" data-answer="Yes">Yes</button><button class="ghost small" data-eligibility="${esc(eligibilityKey(field))}" data-answer="No">No</button></span></li>`).join('')}</ul></div>`;
}
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-eligibility]');
  if (!button) return;
  const next = { ...eligibility, [button.dataset.eligibility]: button.dataset.answer };
  try { await chrome.storage.local.set({ eligibility: next }); eligibility = next; renderAutofill(); } catch { /* storage unavailable */ }
});
function renderEligibilityAnswers() {
  const entries = Object.entries(eligibility);
  $('eligibility-answers').hidden = !entries.length;
  $('eligibility-answers-list').innerHTML = entries.map(([key, answer]) => {
    const [type, country] = key.split(':');
    return `<li><span>${type === 'requiresSponsorship' ? 'Sponsorship' : 'Work authorization'}${country ? ` · ${esc(country)}` : ''}: <strong>${esc(answer)}</strong></span><button data-remove-eligibility="${esc(key)}">Remove</button></li>`;
  }).join('');
}

/**
 * "Have you worked at <company> before?": Yes when the chosen CV lists that
 * company as an employer (a line of its own in the CV text), otherwise No.
 * Always marked "check it": a CV may leave employers out.
 */
async function workedHereBefore() {
  const company = String(scan?.context?.company ?? '').trim();
  if (!company || !resumes.chosen || !scan?.fields?.some(field => field.key === 'workedHereBefore')) return {};
  try {
    const text = (await cvTexts(resumes.items))[resumes.chosen.id];
    if (!text) return {};
    const name = company.toLowerCase();
    const listed = text.split('\n').some(line => { const value = line.trim().toLowerCase(); return value === name || value.startsWith(`${name} (`); });
    return listed
      ? { workedHereBefore: 'Yes', workedHereBeforeReason: `Your CV lists ${company} as an employer, so "Yes". Check it.` }
      : { workedHereBefore: 'No', workedHereBeforeReason: `${company} is not among the employers in your CV, so "No". Check it.` };
  } catch { return {}; }
}
const diversityValue = key => diversityAnswers[key] ?? 'Prefer not to answer';
const GROUP_OF_KEY = new Map(FILL_GROUPS.flatMap(group => group.keys.map(key => [key, group.id])));
let fillGroups = {};
// Every group starts on, except diversity questions, which start off.
const groupOn = key => { const group = GROUP_OF_KEY.get(key); return group === 'diversity' ? fillGroups.diversity === true : fillGroups[group] !== false; };
const $ = id => document.getElementById(id);

// After the extension is reloaded or updated, Chrome leaves this panel in the page
// but cuts it off: every chrome.* call throws "Extension context invalidated".
// Swap the UI for a notice instead of failing on each click or refresh.
const alive = () => Boolean(chrome.runtime?.id);
let staleShown = false;
function showStale() {
  if (staleShown) return; staleShown = true;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  document.querySelector('main').innerHTML = `<div class="notice stale-notice">${icon('refresh')}<div><strong>CV Autofill was updated</strong><p>Reload this page to keep using it. Your profile and CVs are saved.</p></div></div>`;
  document.querySelectorAll('.tabs, .header-actions button:not(#close-panel), #open-app').forEach(node => { node.hidden = true; });
}
const isStaleError = reason => !alive() || /Extension context invalidated/i.test(String(reason?.message ?? reason ?? ''));
addEventListener('error', event => { if (isStaleError(event.error ?? event.message)) { event.preventDefault(); showStale(); } });
addEventListener('unhandledrejection', event => { if (isStaleError(event.reason)) { event.preventDefault(); showStale(); } });
// Clicks are the main way a cut-off panel calls Chrome; catch them before any handler runs.
document.addEventListener('click', event => { if (!alive() && !event.target.closest('#close-panel')) { event.stopImmediatePropagation(); event.preventDefault(); showStale(); } }, true);
let profile = {}, scan = null, currentTab = null, sending = false, filling = false, localDirty = false, refreshId = 0;
let copyValues = [];
let resumes = { items: [], chosen: null }, resumeProblem = '', loadingResumes = false, preparingPdf = false, pickerOpen = { autofill: false, resume: false }, pageDisconnected = false;
let match = null, matchUrl = null, matchKeywords = null, matchRun = 0, improving = false;
// The last Autofill result for this page: summary, notes and required fields still empty.
let fillReport = null;
function status(id, text, kind = '') { const node = $(id); if (node) { node.textContent = text; node.className = `status ${kind}`; } }
function openApp(path = '/') { return chrome.tabs.create({ url: `${APP_URL}${path}` }); }
// The panel lives inside one page, so it always works with that page's tab.
let ownTabId = null;
async function ownTab() {
  if (ownTabId === null) ownTabId = (await chrome.runtime.sendMessage({ type: 'panel-tab' }))?.tabId ?? null;
  return ownTabId === null ? null : chrome.tabs.get(ownTabId);
}
// Posted to the page, not sent through Chrome, so collapsing works even after a reload.
// The message carries nothing private.
function closePanel() { window.parent.postMessage({ type: 'adcv-panel-close' }, '*'); }
async function askPage(message, tab = currentTab) {
  if (!tab?.id) return null;
  try { pageDisconnected = false; return await chrome.tabs.sendMessage(tab.id, message, { frameId: 0 }); }
  catch (error) {
    // After the extension is reloaded, scripts already in the page stop answering
    // until the page itself is reloaded.
    pageDisconnected = /Receiving end does not exist|context invalidated/i.test(error?.message || '');
    return null;
  }
}
// ─── Frames ───────────────────────────────────────────────────────────────
// A form can sit in an iframe from another site (a Greenhouse form inside a
// company's careers page). The page scripts run in every frame; the panel
// asks each frame that holds application fields. Ids from a frame carry its
// number ("3:12") so answers, drafts and "Go to" reach the right frame.
let formFrames = [0];
const frameKey = (frameId, id) => `${frameId}:${id}`;
function splitKey(key) {
  const text = String(key), at = text.indexOf(':');
  return at < 0 ? [0, text] : [Number(text.slice(0, at)), text.slice(at + 1)];
}
async function frameIdsOf(tab) {
  if (!tab?.id) return [];
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
    return frames.filter(frame => /^(https?|file):/.test(frame.url)).map(frame => frame.frameId).sort((a, b) => a - b);
  } catch { return [0]; }
}
async function askFrame(frameId, message, tab = currentTab) {
  if (frameId === 0) return askPage(message, tab);
  if (!tab?.id) return null;
  try { return await chrome.tabs.sendMessage(tab.id, message, { frameId }); } catch { return null; }
}
/** Asks every frame that holds the form, top first; [{ frameId, reply }]. */
async function askForms(message, tab = currentTab) {
  const replies = [];
  for (const frameId of formFrames.length ? formFrames : [0]) {
    const reply = await askFrame(frameId, message, tab);
    if (reply) replies.push({ frameId, reply });
  }
  return replies;
}
/** One scan for the panel: the top page's details, every frame's fields. */
async function scanFrames(tab) {
  const scans = [];
  for (const frameId of await frameIdsOf(tab)) {
    const reply = await askFrame(frameId, { type: 'scan' }, tab);
    if (reply) scans.push({ frameId, reply });
  }
  formFrames = scans.filter(entry => entry.reply.fields?.length).map(entry => entry.frameId);
  const top = scans.find(entry => entry.frameId === 0)?.reply ?? scans[0]?.reply ?? null;
  if (!top) return null;
  const fields = [...new Map(scans.flatMap(entry => entry.reply.fields ?? []).map(field => [field.key, field])).values()];
  const total = (name) => scans.reduce((sum, entry) => sum + (entry.reply[name] ?? 0), 0);
  return { ...top, fields, skippedSensitive: total('skippedSensitive'), consentCount: total('consentCount'), canOpenForm: Boolean(top.canOpenForm) && !fields.length, frames: formFrames.length };
}
/** The form's questions from every frame, with frame-qualified ids. */
async function questionsFromFrames(tab = currentTab) {
  return (await askForms({ type: 'questions' }, tab)).flatMap(({ frameId, reply }) => (reply.questions ?? []).map(question => ({ ...question, id: frameKey(frameId, question.id) })));
}

function valueFor(key) { if (!groupOn(key)) return ''; if (key.startsWith('eeo')) return diversityValue(key); if (key === 'resume') return resumes.chosen ? fileNameFor(resumes.chosen) : ''; if (key === 'coverLetter') return ''; return profile[key] ?? ''; }
function pageCard() {
  if (!scan) return '';
  const title = scan.context?.title || 'Application form';
  const company = scan.context?.company || scan.host;
  const initials = company.split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
  return `<div class="card page-card"><div class="company-avatar" aria-hidden="true">${esc(initials)}</div><div><h2>${esc(title)}</h2><p>${esc(company)}</p><p class="page-site">${esc(scan.host)}</p></div></div>`;
}
function renderAutofill() {
  const host = $('panel-autofill');
  if (!scan && pageDisconnected) {
    host.innerHTML = `<div class="notice">${icon('refresh')}<div><strong>Reload this page to reconnect</strong><p>The extension was updated while this page was open, so it can no longer read the form. Reloading keeps nothing you typed on the page.</p><button class="primary" id="reload-page">${icon('refresh')}Reload page</button></div></div>`;
    $('reload-page').addEventListener('click', () => { if (currentTab?.id) void chrome.tabs.reload(currentTab.id); });
    return;
  }
  if (!scan || !scan.fields?.length) {
    const opener = scan?.canOpenForm ? `<button class="primary" id="open-form">${icon('file')}Open application form</button>` : '';
    host.innerHTML = `${pageCard()}${matchCard()}<div class="notice">${icon('file')}<div><strong>${scan ? 'No application fields found yet' : 'Autofill is not available on this page'}</strong><p>${scan?.canOpenForm ? 'This job page opens its form when you press Apply.' : scan ? 'Open the application form, then rescan the page.' : 'Open a supported application form to use Autofill. You can still use your Profile and Resume here.'}</p>${opener}<button class="ghost" id="rescan-empty">${icon('refresh')}Rescan page</button></div></div>`;
    $('rescan-empty').addEventListener('click', refresh);
    $('open-form')?.addEventListener('click', openForm);
    return;
  }
  const ready = scan.fields.filter(field => valueFor(field.key)).length;
  const groups = new Map();
  for (const field of scan.fields) { if (!groups.has(field.group)) groups.set(field.group, []); groups.get(field.group).push(field); }
  const rows = [...groups].map(([group, fields]) => `<p class="group">${esc(group)}</p><ul class="fields">${fields.map(field => `<li><span class="key">${esc(FIELD_LABELS[field.key] || field.key)}</span>${!groupOn(field.key) ? '<span class="missing">Off in Settings</span>' : valueFor(field.key) ? `<span class="val">${esc(valueFor(field.key))}</span>` : '<span class="missing">Add a value</span>'}</li>`).join('')}</ul>`).join('');
  host.innerHTML = `${pageCard()}${matchCard()}
    <div class="fill-block"><button class="primary fill-action" id="fill" ${ready ? '' : 'disabled'}>${icon('bolt', 23)}Autofill This Page</button><div class="status${fillReport ? ` ${fillReport.kind}` : ''}" id="fill-status" role="status">${esc(fillReport?.text ?? '')}</div>${fillReportDetails()}<p class="hint">${ready} of ${scan.fields.length} detected fields have a value. Review before submitting.</p>${!ready ? '<button class="ghost" id="add-details">Add your profile details</button>' : ''}</div>
    ${eligibilityCard()}
    ${questionsCard()}
    ${answersCard()}
    ${resumeCard()}
    <details class="card"><summary>${icon('check')}Fields to fill<span class="summary-count">${ready}/${scan.fields.length}</span></summary>${rows}${scan.skippedSensitive ? `<p class="hint">${scan.skippedSensitive} demographic question(s) will stay untouched.</p>` : ''}${scan.consentCount ? `<p class="hint">${scan.consentCount} consent checkbox(es) are left for you to tick.</p>` : ''}</details>`;
  $('fill').addEventListener('click', runFill);
  $('add-details')?.addEventListener('click', () => { selectTab('profile'); $('local-details').open = true; });
}
async function runFill() {
  if (filling) return;
  filling = true; const button = $('fill'); button.disabled = true;
  status('fill-status', 'Filling…');
  const target = currentTab;
  try {
    // Autofill uploads the CV chosen at the moment of the click, as a PDF of its
    // latest saved version. A missing PDF does not stop the other fields.
    let file = null, cvProblem = '';
    if (resumes.chosen && groupOn('resume') && scan?.fields.some(field => field.key === 'resume')) {
      try {
        try { resumes = await fetchResumes(); } catch { /* use the cached list */ }
        if (!(await hasFreshPdf(resumes.chosen))) status('fill-status', 'Making a PDF of your CV…');
        file = await pdfFor(resumes.chosen);
      } catch (error) { cvProblem = `CV not attached: ${error.message}`; }
      status('fill-status', 'Filling…');
    }
    // Fields in groups switched off in Settings are sent empty, so they stay as they are.
    const allowed = Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, groupOn(key) ? value : '']));
    for (const key of Object.keys(DIVERSITY_CHOICES)) if (groupOn(key)) allowed[key] = diversityValue(key);
    const { answers, notes: answerNotes } = await savedAnswersFor(target);
    // Groups switched off, by field, so a still-empty field can say which setting left it empty.
    const offKeys = Object.fromEntries(FILL_GROUPS.filter(group => group.keys.length && !groupOn(group.keys[0])).flatMap(group => group.keys.map(key => [key, group.label])));
    const payload = { ...allowed, resumeDataUrl: file?.dataUrl, resumeFileName: file?.fileName, eligibility, acknowledgeRequired, offKeys, ...(groupOn('workedHereBefore') ? await workedHereBefore() : {}) };
    // Each frame holding the form fills in turn; their results add up to one report.
    let result = null;
    for (const frameId of formFrames.length ? formFrames : [0]) {
      const own = answers.filter(item => splitKey(item.id)[0] === frameId).map(item => ({ ...item, id: splitKey(item.id)[1] }));
      const reply = await askFrame(frameId, { type: 'fill', profile: payload, answers: own }, target);
      if (!reply) continue;
      const missing = (reply.missing ?? []).map(item => ({ ...item, id: frameKey(frameId, item.id) }));
      result = result
        ? { ...result, filled: result.filled + reply.filled, fromAnswers: (result.fromAnswers ?? 0) + (reply.fromAnswers ?? 0), failures: [...result.failures, ...reply.failures], notes: [...(result.notes ?? []), ...(reply.notes ?? [])], missing: [...result.missing, ...missing] }
        : { ...reply, missing };
    }
    // Settings → "Keep filling the next steps": later steps of this form, on this site, for 30 minutes.
    if (result && continueSteps && target?.url) {
      void chrome.runtime.sendMessage({ type: 'arm-steps', host: new URL(target.url).host, company: scan?.context?.company ?? '', profile: payload, useAnswers: fillGroups.answers !== false }).catch(() => {});
    }
    if (cvProblem && result) result.failures.push(cvProblem);
    if (!result) throw new Error(pageDisconnected ? 'The extension was updated. Reload this page, then try again.' : 'Lost contact with the page. Reload it and try again.');
    fillReport = {
      url: target?.url,
      text: result.failures.length ? `Filled ${result.filled}. Could not fill: ${result.failures.join('; ')}` : `Filled ${result.filled} field${result.filled === 1 ? '' : 's'}. Review the form before submitting.`,
      kind: result.failures.length ? 'error' : 'success',
      notes: [...(result.notes ?? []), ...(result.fromAnswers ? [`${result.fromAnswers} filled from saved answers`] : []), ...answerNotes],
      missing: result.missing ?? [],
    };
  } catch (error) { fillReport = { url: target?.url, text: error.message, kind: 'error', notes: [], missing: [] }; }
  finally { filling = false; await loadQuestions().catch(() => {}); renderAutofill(); }
  // Settings → "Draft unknown questions with AI": off unless the person switched it on.
  if (aiDraftAuto && fillReport?.kind !== 'error') void draftAll();
}

/**
 * Saved answers for the form's own questions. Similar-wording matches and
 * answers held back (they name another company) become notes to check.
 * Signed out or offline: Autofill still fills the profile fields.
 */
async function savedAnswersFor(tab) {
  if (fillGroups.answers === false) return { answers: [], notes: [] };
  const questions = await questionsFromFrames(tab);
  const open = questions.filter(question => !question.value);
  if (!open.length) return { answers: [], notes: [] };
  try {
    const { matches, skipped } = await matchAnswers(scan?.context?.company ?? '', open);
    const byId = new Map(open.map(question => [question.id, question]));
    const notes = [
      ...matches.filter(match => match.match === 'similar').map(match => `${byId.get(match.id)?.question}: from your answer to "${match.savedQuestion}", check it`),
      ...skipped.filter(item => item.reason === 'names-another-company').map(item => `${byId.get(item.id)?.question}: your saved answer names another company, so it was not used`),
    ];
    return { answers: matches.map(match => ({ id: match.id, value: match.value, match: match.match, savedQuestion: match.savedQuestion, kind: byId.get(match.id)?.kind })), notes };
  } catch (error) {
    return { answers: [], notes: [error instanceof NotSignedInError ? 'Sign in to use saved answers.' : `Saved answers not used: ${error.message}`] };
  }
}

// ─── Save answers from this form ─────────────────────────────────────────
let answerDraft = null; // { url, items: [{ question, answer, keep }] } while choosing what to save

// ─── AI drafts for questions without an answer ─────────────────────────
// Each draft runs Claude on the server, so it starts only from a button
// (or the Autofill setting the person switched on). Nothing is saved unless
// they press "Save as answer".
let formQuestions = [], questionsUrl = null, aiDraftAuto = false;
const drafts = new Map(); // question id → { status, answer, needsInput, message, inserted }
let draftQueue = Promise.resolve(), jobCache = null;
async function loadQuestions() {
  if (!scan?.fields?.length) { formQuestions = []; return; }
  formQuestions = await questionsFromFrames();
}
/** The posting for context: the page's job description when it has one. */
async function jobForDrafts() {
  if (jobCache?.url === currentTab?.url) return jobCache.job;
  let text = '';
  try { const capture = await captureTab(currentTab.id); text = jobFromCapture(capture).text.slice(0, 40000); } catch { /* title only */ }
  const job = { title: scan?.context?.title ?? '', company: scan?.context?.company ?? '', text };
  jobCache = { url: currentTab?.url, job };
  return job;
}
function draftQuestion(id) {
  const question = formQuestions.find(item => item.id === id);
  if (!question || drafts.get(id)?.status === 'drafting') return draftQueue;
  if (!resumes.chosen) { drafts.set(id, { status: 'error', message: 'Choose a CV in the Resume tab first.' }); renderAutofill(); return draftQueue; }
  drafts.set(id, { status: 'queued' }); renderAutofill();
  // One at a time: each draft is a separate Claude run.
  draftQueue = draftQueue.then(async () => {
    drafts.set(id, { status: 'drafting' }); renderAutofill();
    try {
      const { answer, needsInput } = await draftAnswer({
        question: question.question, kind: question.kind,
        ...(question.options && { options: question.options }), ...(question.maxLength && { maxLength: question.maxLength }),
        job: await jobForDrafts(), resumeId: resumes.chosen.id,
      });
      const [frameId, fieldId] = splitKey(id);
      const inserted = answer ? Boolean((await askFrame(frameId, { type: 'fill-draft', id: fieldId, kind: question.kind, value: answer }))?.filled) : false;
      drafts.set(id, { status: 'done', answer, needsInput, inserted });
    } catch (error) {
      if (error instanceof NotSignedInError) { selectTab('profile'); document.querySelector('.account-card').open = true; }
      drafts.set(id, { status: 'error', message: error.message });
    }
    renderAutofill();
  });
  return draftQueue;
}
function draftAll() {
  for (const question of formQuestions.filter(item => !item.value && !drafts.has(item.id))) void draftQuestion(question.id);
  return draftQueue;
}
function questionsCard() {
  const open = formQuestions.filter(item => !item.value || drafts.has(item.id));
  if (!open.length) return '';
  const rows = open.map(item => {
    const draft = drafts.get(item.id);
    const body = !draft ? `<button class="ghost small" data-draft="${esc(item.id)}">${icon('edit', 15)}Draft with AI</button>`
      : draft.status === 'queued' ? '<p class="draft-state">Waiting…</p>'
      : draft.status === 'drafting' ? '<p class="draft-state">Drafting with Claude…</p>'
      : draft.status === 'error' ? `<p class="draft-state error">${esc(draft.message)}</p><button class="ghost small" data-draft="${esc(item.id)}">Try again</button>`
      : `${draft.answer ? `<blockquote class="draft-text">${esc(draft.answer)}</blockquote><p class="draft-state">${draft.inserted ? 'Put in the form, marked AI draft. Review it before submitting.' : 'The field already has text, so the draft was not put in. Copy it if you want it.'}</p>` : '<p class="draft-state">Your CV does not cover this, so no draft was written.</p>'}
        ${draft.needsInput?.length ? `<ul class="draft-needs">${draft.needsInput.map(need => `<li>${esc(need)}</li>`).join('')}</ul>` : ''}
        <div class="draft-actions">${draft.answer ? `<button class="ghost small" data-copy-draft="${esc(item.id)}">Copy</button><button class="ghost small" data-save-draft="${esc(item.id)}">Save as answer</button>` : ''}<button class="ghost small" data-draft="${esc(item.id)}">Redraft</button></div>`;
    return `<li><strong>${esc(item.question)}</strong>${body}</li>`;
  }).join('');
  const waiting = open.filter(item => !drafts.has(item.id)).length;
  return `<div class="card questions-card"><h2>${icon('edit')}Questions to answer</h2><p>No saved answer fits these. Claude can draft from your CV; personal facts are left for you.</p>${waiting > 1 ? `<button class="ghost" id="draft-all">Draft all ${waiting} with AI</button>` : ''}<ul class="question-list">${rows}</ul><div class="status" id="questions-status" role="status"></div></div>`;
}
document.addEventListener('click', async event => {
  const draft = event.target.closest('[data-draft]');
  if (draft) { drafts.delete(draft.dataset.draft); void draftQuestion(draft.dataset.draft); return; }
  if (event.target.closest('#draft-all')) { void draftAll(); return; }
  const copy = event.target.closest('[data-copy-draft]');
  if (copy) {
    try { await navigator.clipboard.writeText(drafts.get(copy.dataset.copyDraft)?.answer ?? ''); status('questions-status', 'Copied.', 'success'); }
    catch { status('questions-status', 'Select the draft and copy it manually.', 'error'); }
    return;
  }
  const save = event.target.closest('[data-save-draft]');
  if (save) {
    const question = formQuestions.find(item => item.id === save.dataset.saveDraft);
    try { await saveAnswers(scan?.context?.company ?? '', [{ question: question.question, answer: drafts.get(question.id).answer }]); status('questions-status', 'Saved. Edit it in the app under Profile → Saved answers.', 'success'); }
    catch (error) { status('questions-status', error.message, 'error'); }
  }
});
async function startSavingAnswers() {
  const questions = await questionsFromFrames();
  const items = questions.filter(question => question.value).map(question => ({ question: question.question, answer: question.value, keep: true }));
  answerDraft = { url: currentTab?.url, items, status: items.length ? '' : 'Fill in the company\'s questions first, then save them.' };
  renderAutofill();
}
function answersCard() {
  if (!scan?.fields?.length) return '';
  if (!answerDraft) return `<div class="card soft-card answers-card"><h2>${icon('check')}Your answers</h2><p>Answered the company's own questions? Save them, and Autofill fills them next time.</p><button class="ghost" id="save-answers-start">Save answers from this form</button></div>`;
  const rows = answerDraft.items.map((item, index) => `<li><label><input type="checkbox" data-keep-answer="${index}" ${item.keep ? 'checked' : ''}><span><strong>${esc(item.question)}</strong><small>${esc(item.answer.length > 160 ? `${item.answer.slice(0, 160)}…` : item.answer)}</small></span></label></li>`).join('');
  return `<div class="card answers-card"><h2>${icon('check')}Save answers</h2>${rows ? `<ul class="answer-picks">${rows}</ul>` : ''}<div class="status${answerDraft.kind ? ` ${answerDraft.kind}` : ''}" role="status">${esc(answerDraft.status)}</div><div class="actions">${rows ? '<button class="primary" id="save-answers">Save selected</button>' : ''}<button class="ghost" id="save-answers-cancel">${answerDraft.kind === 'success' ? 'Done' : 'Cancel'}</button></div></div>`;
}
async function saveSelectedAnswers() {
  const chosen = answerDraft.items.filter(item => item.keep).map(({ question, answer }) => ({ question, answer }));
  if (!chosen.length) { answerDraft.status = 'Choose at least one answer.'; renderAutofill(); return; }
  try {
    const { saved } = await saveAnswers(scan?.context?.company ?? '', chosen);
    answerDraft = { ...answerDraft, items: [], status: `Saved ${saved} answer${saved === 1 ? '' : 's'}. Edit them in the app under Profile → Saved answers.`, kind: 'success' };
  } catch (error) {
    if (error instanceof NotSignedInError) { selectTab('profile'); document.querySelector('.account-card').open = true; }
    answerDraft.status = error.message; answerDraft.kind = 'error';
  }
  renderAutofill();
}
document.addEventListener('click', event => {
  if (event.target.closest('#save-answers-start')) void startSavingAnswers();
  else if (event.target.closest('#save-answers')) void saveSelectedAnswers();
  else if (event.target.closest('#save-answers-cancel')) { answerDraft = null; renderAutofill(); }
});
document.addEventListener('change', event => {
  const box = event.target.closest('[data-keep-answer]');
  if (box && answerDraft) answerDraft.items[Number(box.dataset.keepAnswer)].keep = box.checked;
});

/** Notes from the last fill ("CV: uploaded") and required fields still empty. */
function fillReportDetails() {
  if (!fillReport) return '';
  const notes = fillReport.notes.length ? `<ul class="fill-notes">${fillReport.notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul>` : '';
  const missing = fillReport.missing.length
    ? `<div class="still-empty"><strong>Still empty and required (${fillReport.missing.length})</strong><ul>${fillReport.missing.map(item => `<li><button data-focus-field="${esc(item.id)}"><span class="empty-label">${esc(item.label)}${item.reason ? `<small>${esc(item.reason)}</small>` : ''}</span><span>Go to</span></button></li>`).join('')}</ul><button class="ghost" id="check-required">${icon('refresh', 16)}Check again</button></div>`
    : fillReport.kind === 'success' ? '<p class="hint">No required fields are empty.</p>' : '';
  return notes + missing;
}
async function checkRequired() {
  const replies = await askForms({ type: 'check-required' });
  if (replies.length && fillReport) {
    fillReport.missing = replies.flatMap(({ frameId, reply }) => (reply.missing ?? []).map(item => ({ ...item, id: frameKey(frameId, item.id) })));
    renderAutofill();
  }
}
document.addEventListener('click', event => {
  const go = event.target.closest('[data-focus-field]');
  if (go) { const [frameId, fieldId] = splitKey(go.dataset.focusField); void askFrame(frameId, { type: 'focus-field', id: fieldId }); return; }
  if (event.target.closest('#check-required')) void checkRequired();
});
/** Presses the job page's Apply button, then rescans once the form has loaded. */
async function openForm() {
  const button = $('open-form'); if (button) button.disabled = true;
  await askPage({ type: 'open-form' });
  for (const delay of [800, 1500, 2500]) setTimeout(() => void refresh(), delay);
}

// Saving job postings stays an explicit, permission-controlled action.
function renderSendButton() {
  const reason = unsendableReason(currentTab), button = $('send-job');
  button.disabled = sending || !!reason; button.title = reason || '';
  if (!sending && reason && currentTab?.url) $('send-status').textContent = reason;
}
function showSendResult({ job, created }) {
  const name = [job.title, job.company].filter(Boolean).join(' at ') || job.pageTitle || 'This job';
  const result = $('send-status'); result.replaceChildren();
  const line = document.createElement('div'); line.textContent = `${created ? 'Saved' : 'Already saved, updated'}: ${name}`; result.append(line);
  const note = job.extraction === 'pending' ? 'Reading the posting. The details will appear in your dashboard.' : job.extraction === 'failed' ? job.extractionError || 'Review the job details in the app.' : '';
  if (note) { const p = document.createElement('div'); p.className = 'muted'; p.textContent = note; result.append(p); }
  const link = document.createElement('a'); link.href = jobUrl(job.id); link.textContent = 'Open in app'; link.addEventListener('click', event => { event.preventDefault(); void chrome.tabs.create({ url: jobUrl(job.id) }); }); result.append(link);
}
function sendJob() {
  const tab = currentTab; if (sending || !tab?.id || unsendableReason(tab)) return;
  const access = requestSiteAccess(tab); // Must start in the click's user gesture.
  sending = true; renderSendButton(); $('send-status').textContent = 'Reading the page…';
  void (async () => {
    try {
      if (!await access) { $('send-status').textContent = 'Access was not allowed, so nothing was sent.'; return; }
      const capture = await captureTab(tab.id); $('send-status').textContent = 'Saving this job…'; showSendResult(await sendCapture(capture));
    } catch (error) { if (error instanceof NotSignedInError) { selectTab('profile'); document.querySelector('.account-card').open = true; } $('send-status').textContent = /Cannot access|cannot be scripted|Frame with ID/i.test(error.message) ? 'Chrome does not let extensions read this page.' : error.message; }
    finally { sending = false; renderSendButton(); }
  })();
}

// Profile cards copy values; they never submit anything to the website.
function renderProfileOverview() {
  copyValues = [];
  const copy = (value, label, heading = false) => {
    if (!value) return ''; const index = copyValues.push(String(value)) - 1;
    return `<button class="copy-value${heading ? ' is-heading' : ''}" data-copy="${index}" aria-label="Copy ${esc(label)}" title="Copy ${esc(label)}">${esc(value)}</button>`;
  };
  const name = profile.fullName || [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const initials = (name || '?').split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
  let html = `<div class="card"><div class="profile-card-heading"><h2>${name ? esc(name) : 'Your profile'}</h2><button class="icon-button edit-app-profile" aria-label="Edit contact information in app">${icon('edit')}</button></div><div class="profile-contact"><div class="profile-initials">${esc(initials)}</div><div>${copy(name, 'name')}${copy(profile.location || profile.city, 'location', true)}${copy(profile.email, 'email')}${copy(profile.phone, 'phone')}${!name && !profile.email ? '<p>Sync your profile or add local details below.</p>' : ''}</div></div></div>`;
  if (DERIVED_KEYS.some(key => profile[key])) html += `<div class="card"><div class="profile-card-heading"><h2>${icon('briefcase')} Experience</h2><button class="icon-button edit-app-profile" aria-label="Edit experience in app">${icon('edit')}</button></div>${copy(profile.currentTitle, 'current title', true)}${copy(profile.currentCompany, 'current company')}${copy(profile.yearsExperience ? `${profile.yearsExperience} years of experience` : '', 'years of experience')}<p>Current role from your saved app profile.</p></div>`;
  const links = ['linkedin', 'github', 'portfolio', 'website', 'telegram'].filter(key => profile[key]);
  if (links.length) html += `<div class="card"><h2>${icon('link')} Links</h2>${links.map(key => `<small class="muted">${FIELD_LABELS[key]}</small>${copy(profile[key], FIELD_LABELS[key])}`).join('')}</div>`;
  $('profile-overview').innerHTML = html;
  $('profile-overview').querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(copyValues[Number(button.dataset.copy)]); status('copy-status', 'Copied.', 'success'); }
    catch { status('copy-status', 'Could not copy. Select the value and copy it manually.', 'error'); }
  }));
  $('profile-overview').querySelectorAll('.edit-app-profile').forEach(button => button.addEventListener('click', () => void openApp('/profile')));
}
function renderProfileForm() {
  if (localDirty) return;
  $('profile-form').innerHTML = PROFILE_GROUPS.map(group => `<p class="group">${group.title}</p>${group.keys.map(key => `<label class="field"><span>${FIELD_LABELS[key]}</span><input type="text" name="${key}" value="${esc(profile[key])}"></label>`).join('')}`).join('') + (DERIVED_KEYS.some(key => profile[key]) ? `<p class="group">Current role · from your profile</p>${DERIVED_KEYS.map(key => `<label class="field"><span>${FIELD_LABELS[key]}</span><input type="text" value="${esc(profile[key])}" disabled></label>`).join('')}<p class="hint">Update work experience in your app Profile to change these values.</p>` : '');
}
async function saveProfile() {
  const next = { ...profile };
  for (const input of $('profile-form').elements) if (input.name) next[input.name] = input.value.trim();
  try { await chrome.storage.local.set({ profile: next }); profile = next; localDirty = false; renderProfileOverview(); renderProfileForm(); renderAutofill(); status('profile-status', 'Saved in this browser.', 'success'); }
  catch { status('profile-status', 'Could not save. Your edits are still here.', 'error'); }
}

// CVs come from the app's Documents. The Resume tab lists them; the Autofill
// card switches between them. Autofill uploads the chosen one as a PDF.
function cvDetails(item) {
  return [item.targetRole, item.tailoredForJob ? 'Tailored for a job' : '', `edited ${new Date(item.updatedAt).toLocaleDateString()}`].filter(Boolean).join(' · ');
}
/** namesOnly: the Resume tab shows CV names and nothing else. */
function resumeRows({ namesOnly = false } = {}) {
  return resumes.items.map(item => {
    const chosen = item.id === resumes.chosen?.id;
    if (namesOnly) return `<li class="resume-row${chosen ? ' is-active' : ''}"><button class="resume-pick" data-pick="${esc(item.id)}" aria-pressed="${chosen}"><span class="radio" aria-hidden="true"></span><span class="resume-meta"><strong title="${esc(item.name)}">${esc(item.name)}</strong></span></button></li>`;
    return `<li class="resume-row${chosen ? ' is-active' : ''}"><button class="resume-pick" data-pick="${esc(item.id)}" aria-pressed="${chosen}"><span class="radio" aria-hidden="true"></span><span class="resume-meta"><strong title="${esc(item.name)}">${esc(item.name)}</strong><small>${esc(cvDetails(item))}</small></span>${item.isPrimary ? '<span class="badge">Primary</span>' : ''}</button></li>`;
  }).join('');
}
function resumeEmpty() {
  if (resumeProblem === 'signed-out') return `<div class="resume-empty"><p>Sign in to see the CVs from your app.</p><button class="ghost" data-go-sign-in>Sign in on the Profile tab</button></div>`;
  if (resumeProblem) return `<div class="resume-empty"><p>${esc(resumeProblem)}</p><button class="ghost" data-refresh-cvs>${icon('refresh', 17)}Try again</button></div>`;
  if (loadingResumes) return '<div class="resume-empty"><p>Loading your CVs…</p></div>';
  return `<div class="resume-empty"><p>No CVs in Documents yet.</p><button class="ghost" data-open-documents>Open Documents</button></div>`;
}
/** The chosen CV, with a button that opens the list to switch. Used on both tabs. */
function cvPicker(where) {
  const chosen = resumes.chosen;
  if (!chosen) return resumeEmpty();
  const many = resumes.items.length > 1, open = many && pickerOpen[where];
  const namesOnly = where === 'resume';
  const note = preparingPdf ? 'Making the PDF…' : 'Autofill uploads this CV';
  return `<div class="document-selection resume-current"><button class="resume-switch" data-toggle-picker="${where}" ${many ? `aria-expanded="${open}" aria-controls="picker-${where}"` : 'disabled'} title="${many ? 'Change CV' : 'Add more CVs in the app to switch'}"><span><strong class="cv-name" title="${esc(chosen.name)}">${esc(chosen.name)}</strong>${namesOnly ? '' : `<small>${chosen.isPrimary ? '<span class="badge">Primary</span>' : ''}${esc(note)}</small>`}</span>${many ? `<span class="switch-label">Change${icon('chevron', 15)}</span>` : ''}</button><button class="icon-button" data-open-cv="${esc(chosen.id)}" title="Open in app" aria-label="Open ${esc(chosen.name)} in the app">${icon('link', 18)}</button></div>
    ${open ? `<ul class="resume-list" id="picker-${where}" aria-label="Choose a CV">${resumeRows({ namesOnly })}</ul>` : ''}`;
}
function resumeCard() {
  return `<details class="card" open><summary>${icon('file')}Resume</summary>${cvPicker('autofill')}</details>`;
}
function renderResume() {
  $('resume-picker').innerHTML = cvPicker('resume');
  $('refresh-cvs').disabled = loadingResumes;
}
function rerenderResumes() { renderResume(); if (!filling) renderAutofill(); }
/** Fetches the CV list from the app. The cached list stays on screen meanwhile. */
async function loadResumes() {
  if (loadingResumes) return;
  loadingResumes = true; rerenderResumes();
  try { resumes = await fetchResumes(); resumeProblem = ''; }
  catch (error) { resumeProblem = error instanceof NotSignedInError ? 'signed-out' : error.message; }
  finally { loadingResumes = false; rerenderResumes(); }
}
/** Makes the chosen CV's PDF now, so pressing Autofill later is instant. */
async function preparePdf() {
  const chosen = resumes.chosen; if (!chosen || preparingPdf) return;
  if (await hasFreshPdf(chosen)) { status('resume-status', `${chosen.name} is ready for Autofill.`, 'success'); return; }
  preparingPdf = true; rerenderResumes(); status('resume-status', `Making a PDF of ${chosen.name}…`);
  try { await pdfFor(chosen); status('resume-status', `${chosen.name} is ready for Autofill.`, 'success'); }
  catch (error) { status('resume-status', error.message, 'error'); }
  finally { preparingPdf = false; rerenderResumes(); }
}
document.addEventListener('click', event => {
  const target = event.target.closest('[data-pick],[data-open-cv],[data-refresh-cvs],[data-go-sign-in],[data-open-documents],[data-toggle-picker]');
  if (!target) return;
  if (target.dataset.togglePicker) {
    const where = target.dataset.togglePicker;
    pickerOpen[where] = !pickerOpen[where]; rerenderResumes();
    document.querySelector(`[data-toggle-picker="${where}"]`)?.focus();
    return;
  }
  if (target.dataset.openCv) { void chrome.tabs.create({ url: cvUrl(target.dataset.openCv) }); return; }
  if ('refreshCvs' in target.dataset) { void loadResumes(); return; }
  if ('openDocuments' in target.dataset) { void openApp('/documents'); return; }
  if ('goSignIn' in target.dataset) { selectTab('profile'); document.querySelector('.account-card').open = true; return; }
  void (async () => {
    try {
      pickerOpen = { autofill: false, resume: false };
      await chooseResume(target.dataset.pick);
      resumes = await cachedResumes(); rerenderResumes();
      await preparePdf();
    } catch { status('resume-status', 'Could not switch CVs. Try again.', 'error'); }
  })();
});

// ─── Keyword match card ───────────────────────────────────────────────────
// On a job description page, scores how many of the posting's keywords each CV
// mentions (src/match.js). Keywords only: it does not judge experience depth.
const RING = 2 * Math.PI * 30;
function matchCard() {
  if (!match) return '';
  const { score, matched, missing } = match.chosen;
  const label = matchLabel(score), total = matched.length + missing.length;
  const keywords = [...matched.map(name => `<li class="kw has">${icon('check', 13)}${esc(name)}</li>`), ...missing.map(name => `<li class="kw missing">${esc(name)}</li>`)].join('');
  return `<section class="card match-card match-${label.toLowerCase()}" aria-label="Keyword match">
    <div class="match-top"><div><h2>${label} match</h2><p><strong>${matched.length} of ${total}</strong> keywords in <span class="cv-inline" title="${esc(resumes.chosen.name)}">${esc(resumes.chosen.name)}</span></p></div>
      <div class="ring" role="img" aria-label="Score ${score} of 100"><svg viewBox="0 0 72 72" width="72" height="72"><circle cx="36" cy="36" r="30" class="ring-track"/><circle cx="36" cy="36" r="30" class="ring-value" stroke-dasharray="${(RING * score) / 100} ${RING}" transform="rotate(-90 36 36)"/></svg><span>${score}</span></div></div>
    ${match.better ? `<div class="better-cv"><strong>Better CV available</strong><p><span class="cv-inline" title="${esc(match.better.name)}">${esc(match.better.name)}</span> matches ${match.better.score} (${match.better.matched} of ${total} keywords).</p><button class="ghost" data-pick="${esc(match.better.id)}">Switch to this CV</button></div>` : ''}
    <details class="keywords"><summary>Keywords from the posting</summary><ul>${keywords}</ul></details>
    <button class="primary" id="improve-match">Improve my match${icon('chevron', 17)}</button>
    <div class="status" id="match-status" role="status"></div>
    <p class="hint">Counts the posting's keywords found in your CV. It does not judge how deep your experience is.</p>
  </section>`;
}
/** Reads the page once per address; rescoring after a CV switch reuses the keywords. */
async function updateMatch() {
  const tab = currentTab, run = ++matchRun;
  if (!tab?.id || unsendableReason(tab)) { matchUrl = null; matchKeywords = null; }
  else if (tab.url !== matchUrl) {
    matchUrl = tab.url; matchKeywords = null;
    try {
      const capture = await captureTab(tab.id), job = jobFromCapture(capture), keywords = findKeywords(job.text);
      if (looksLikeJobPosting(capture, job, keywords)) matchKeywords = keywords;
    } catch { /* not readable: no card */ }
  }
  await rescore(run);
}
async function rescore(run = ++matchRun) {
  let next = null;
  if (matchKeywords && resumes.chosen) {
    try {
      const texts = await cvTexts(resumes.items);
      const scored = resumes.items.filter(item => texts[item.id] !== undefined).map(item => ({ ...item, ...scoreCv(matchKeywords, texts[item.id]) }));
      const chosen = scored.find(item => item.id === resumes.chosen.id);
      if (chosen) {
        // Suggest another CV only when it is clearly better, not one keyword ahead.
        const best = scored.filter(item => item.id !== chosen.id).sort((a, b) => b.score - a.score)[0];
        const better = best && best.score >= chosen.score + 10 ? { id: best.id, name: best.name, score: best.score, matched: best.matched.length } : null;
        next = { chosen, better };
      }
    } catch { /* signed out or app unreachable: no card */ }
  }
  if (run !== matchRun) return;
  const changed = JSON.stringify(next) !== JSON.stringify(match);
  match = next;
  if (changed && !filling) renderAutofill();
}
// Save the job, then open it in the app with the chosen CV ready to tailor.
// Tailoring itself runs Claude, so it starts only from the app's button.
function improveMatch() {
  const tab = currentTab, chosen = resumes.chosen;
  if (improving || !tab?.id || !chosen || unsendableReason(tab)) return;
  const access = requestSiteAccess(tab); // Must start in the click's user gesture.
  improving = true; $('improve-match').disabled = true; status('match-status', 'Saving this job…');
  void (async () => {
    try {
      if (!await access) { status('match-status', 'Access was not allowed, so nothing was saved.'); return; }
      const { job } = await sendCapture(await captureTab(tab.id));
      await chrome.tabs.create({ url: `${jobUrl(job.id)}?tailorFrom=${encodeURIComponent(chosen.id)}` });
      status('match-status', `Saved. In the app, press "Tailor resume for this job" to improve ${chosen.name}.`, 'success');
    } catch (error) {
      if (error instanceof NotSignedInError) { selectTab('profile'); document.querySelector('.account-card').open = true; }
      status('match-status', error.message, 'error');
    } finally { improving = false; if ($('improve-match')) $('improve-match').disabled = false; }
  })();
}
document.addEventListener('click', event => { if (event.target.closest('#improve-match')) improveMatch(); });

async function renderAccount() {
  $('redirect-uri').textContent = redirectUri();
  const user = await currentUser(); $('signed-out').hidden = !!user; $('signed-in').hidden = !user;
  if (user) { $('account-name').textContent = user.name; $('account-email').textContent = user.email; const avatar = $('account-avatar'); avatar.hidden = !user.avatarUrl; if (user.avatarUrl) avatar.src = user.avatarUrl; else avatar.removeAttribute('src'); }
}
async function doSignIn() {
  status('auth-status', 'Opening Google…');
  try { await signIn(); await pullProfile(); await refresh(); void loadResumes(); status('auth-status', 'Signed in and profile synced.', 'success'); }
  catch (error) { status('auth-status', /redirect_uri|mismatch|400/i.test(error.message) ? 'Check the redirect URI in Sign-in setup below.' : error.message, 'error'); }
}
async function doPull() { status('auth-status', 'Syncing…'); try { await pullProfile(); await refresh(); void loadResumes(); status('auth-status', 'Profile up to date.', 'success'); } catch (error) { status('auth-status', error.message, 'error'); } }
async function doSignOut() { await signOut(); await renderAccount(); status('auth-status', 'Signed out. Your local details and PDF remain on this device.'); }
async function renderSyncState() { const { sync } = await chrome.storage.local.get('sync'); $('sync-state').textContent = sync?.lastSyncedAt ? `Synced ${new Date(sync.lastSyncedAt).toLocaleString()}` : 'Never synced'; }
function selectTab(name) {
  for (const tab of document.querySelectorAll('.tab')) { const selected = tab.dataset.panel === name; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; }
  for (const panel of document.querySelectorAll('.panel')) panel.hidden = panel.id !== `panel-${name}`;
  document.querySelector('main').scrollTop = 0;
}
async function refresh() {
  if (!alive()) { showStale(); return; }
  const sequence = ++refreshId;
  if (!filling && $('fill')) $('fill').disabled = true;
  try {
    const stored = await chrome.storage.local.get(['profile', 'autofillGroups', 'aiDraftAuto', 'diversityAnswers', 'continueSteps', 'eligibility', 'acknowledgeRequired']); const nextResumes = await cachedResumes(); const tab = await ownTab(); const nextScan = await scanFrames(tab);
    if (sequence !== refreshId) return;
    if (tab?.url !== currentTab?.url && !sending) $('send-status').textContent = '';
    if (fillReport && fillReport.url !== tab?.url) fillReport = null;
    if (answerDraft && answerDraft.url !== tab?.url) answerDraft = null;
    if (questionsUrl !== tab?.url) { drafts.clear(); questionsUrl = tab?.url; jobCache = null; }
    fillGroups = stored.autofillGroups ?? {};
    profile = stored.profile || {}; resumes = nextResumes; currentTab = tab || null; scan = nextScan;
    aiDraftAuto = stored.aiDraftAuto === true;
    diversityAnswers = stored.diversityAnswers ?? {};
    continueSteps = stored.continueSteps === true;
    eligibility = stored.eligibility ?? {};
    acknowledgeRequired = stored.acknowledgeRequired === true;
    await loadQuestions().catch(() => { formQuestions = []; });
    renderSendButton(); if (!filling) renderAutofill(); renderProfileOverview(); renderProfileForm(); renderResume();
    await Promise.all([renderSyncState(), renderAccount()]);
    void updateMatch();
  } catch { if (!alive()) showStale(); else status('auth-status', 'Could not refresh. Reload the extension to reconnect.', 'error'); }
}
function initIcons() { document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon, Number(node.dataset.size) || 20); }); }
initIcons();
for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => selectTab(tab.dataset.panel));
  tab.addEventListener('keydown', event => { const tabs = [...document.querySelectorAll('.tab')]; const i = tabs.indexOf(tab); const next = event.key === 'ArrowRight' ? tabs[(i + 1) % tabs.length] : event.key === 'ArrowLeft' ? tabs[(i + tabs.length - 1) % tabs.length] : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs.at(-1) : null; if (next) { event.preventDefault(); selectTab(next.dataset.panel); next.focus(); } });
}
$('profile-form').addEventListener('input', () => { localDirty = true; status('profile-status', 'Unsaved local changes.'); });
$('profile-form').addEventListener('submit', event => { event.preventDefault(); void saveProfile(); });
$('reload').addEventListener('click', () => { $('settings-dialog').close(); void refresh(); });
$('send-job').addEventListener('click', sendJob);
$('sign-in').addEventListener('click', () => void doSignIn()); $('sign-out').addEventListener('click', () => void doSignOut()); $('pull-now').addEventListener('click', () => void doPull());
$('save-profile').addEventListener('click', () => void saveProfile()); $('refresh-cvs').addEventListener('click', () => void loadResumes());
$('open-app').addEventListener('click', () => void openApp()); $('edit-profile').addEventListener('click', () => void openApp('/profile')); $('open-documents').addEventListener('click', () => void openApp('/documents'));
$('copy-redirect').addEventListener('click', async () => { try { await navigator.clipboard.writeText(redirectUri()); $('copy-redirect').textContent = 'Copied'; } catch { status('auth-status', 'Select the redirect URI to copy it manually.', 'error'); } });
function renderDisabledSites(hosts) {
  $('disabled-sites').hidden = !hosts.length;
  $('disabled-sites-list').innerHTML = hosts.map(host => `<li><span>${esc(host)}</span><button data-enable-host="${esc(host)}">Turn back on</button></li>`).join('');
}
$('disabled-sites-list').addEventListener('click', async event => {
  const host = event.target.closest('[data-enable-host]')?.dataset.enableHost; if (!host) return;
  try { const { launcherDisabledHosts = [] } = await chrome.storage.local.get('launcherDisabledHosts'); const next = launcherDisabledHosts.filter(h => h !== host); await chrome.storage.local.set({ launcherDisabledHosts: next }); renderDisabledSites(next); }
  catch { status('auth-status', 'Could not update extension settings.', 'error'); }
});
function renderFillGroups() {
  $('fill-groups').innerHTML = FILL_GROUPS.map(group => {
    const on = group.id === 'diversity' ? fillGroups.diversity === true : fillGroups[group.id] !== false;
    const row = `<label class="toggle-row compact"><span>${esc(group.label)}${group.id === 'diversity' ? '<small>Off by default. Your answers stay in this browser.</small>' : ''}</span><input type="checkbox" data-fill-group="${group.id}" ${on ? 'checked' : ''}></label>`;
    return group.id === 'diversity' ? `${row}<button type="button" class="ghost small" id="edit-diversity">Edit my diversity answers</button>` : row;
  }).join('');
}
function openDiversity() {
  $('diversity-form').innerHTML = Object.entries(DIVERSITY_CHOICES).map(([key, item]) => `<label class="field"><span>${esc(item.label)}</span><select name="${key}">${item.choices.map(choice => `<option ${diversityValue(key) === choice ? 'selected' : ''}>${esc(choice)}</option>`).join('')}</select></label>`).join('');
  status('diversity-status', '');
  $('diversity-dialog').showModal();
}
$('fill-groups').addEventListener('click', event => { if (event.target.closest('#edit-diversity')) openDiversity(); });
$('save-diversity').addEventListener('click', async () => {
  const next = Object.fromEntries([...$('diversity-form').querySelectorAll('select')].map(select => [select.name, select.value]));
  try { await chrome.storage.local.set({ diversityAnswers: next }); diversityAnswers = next; status('diversity-status', 'Saved in this browser.', 'success'); }
  catch { status('diversity-status', 'Could not save. Try again.', 'error'); }
});
$('acknowledge-required').addEventListener('change', async event => { const box = event.target; try { await chrome.storage.local.set({ acknowledgeRequired: box.checked }); acknowledgeRequired = box.checked; } catch { box.checked = !box.checked; } });
$('eligibility-answers-list').addEventListener('click', async event => {
  const key = event.target.closest('[data-remove-eligibility]')?.dataset.removeEligibility; if (!key) return;
  const next = { ...eligibility }; delete next[key];
  try { await chrome.storage.local.set({ eligibility: next }); eligibility = next; renderEligibilityAnswers(); } catch { /* storage unavailable */ }
});
$('animate-fill').addEventListener('change', async event => { const box = event.target; try { await chrome.storage.local.set({ animateFill: box.checked }); } catch { box.checked = !box.checked; } });
$('fill-marks').addEventListener('change', async event => { const box = event.target; try { await chrome.storage.local.set({ fillMarks: box.checked }); } catch { box.checked = !box.checked; } });
$('continue-steps').addEventListener('change', async event => { const box = event.target; try { await chrome.storage.local.set({ continueSteps: box.checked }); continueSteps = box.checked; } catch { box.checked = !box.checked; } });
// A later step of an armed form was filled by the page script.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'step-filled' || sender.tab?.id !== ownTabId) return false;
  if (fillReport) fillReport.notes = [...fillReport.notes, `Next step: filled ${message.filled} field${message.filled === 1 ? '' : 's'}`, ...(message.notes ?? [])];
  void refresh();
  return false;
});
$('fill-groups').addEventListener('change', async event => {
  const box = event.target.closest('[data-fill-group]'); if (!box) return;
  const next = { ...fillGroups, [box.dataset.fillGroup]: box.checked };
  try { await chrome.storage.local.set({ autofillGroups: next }); fillGroups = next; } catch { box.checked = !box.checked; }
});
$('ai-draft-auto').addEventListener('change', async event => { const box = event.target; try { await chrome.storage.local.set({ aiDraftAuto: box.checked }); aiDraftAuto = box.checked; } catch { box.checked = !box.checked; } });
$('settings').addEventListener('click', async () => { try { const settings = await chrome.storage.local.get(['launcherEnabled', 'launcherDisabledHosts', 'autofillGroups', 'aiDraftAuto', 'continueSteps', 'diversityAnswers', 'fillMarks', 'animateFill', 'acknowledgeRequired', 'eligibility']); $('ai-draft-auto').checked = settings.aiDraftAuto === true; $('acknowledge-required').checked = settings.acknowledgeRequired === true; eligibility = settings.eligibility ?? {}; renderEligibilityAnswers(); $('fill-marks').checked = settings.fillMarks !== false; $('animate-fill').checked = settings.animateFill !== false; $('continue-steps').checked = settings.continueSteps === true; diversityAnswers = settings.diversityAnswers ?? {}; $('launcher-enabled').checked = settings.launcherEnabled !== false; fillGroups = settings.autofillGroups ?? {}; renderFillGroups(); renderDisabledSites(Array.isArray(settings.launcherDisabledHosts) ? settings.launcherDisabledHosts : []); $('settings-dialog').showModal(); } catch { status('auth-status', 'Could not read extension settings.', 'error'); } });
$('launcher-enabled').addEventListener('change', async event => { const checkbox = event.target; checkbox.disabled = true; try { await chrome.storage.local.set({ launcherEnabled: checkbox.checked }); } catch { checkbox.checked = !checkbox.checked; } finally { checkbox.disabled = false; } });
for (const button of document.querySelectorAll('[data-close-dialog]')) button.addEventListener('click', () => button.closest('dialog').close());
$('report').addEventListener('click', () => { $('report-text').value = ['CV Autofill ' + chrome.runtime.getManifest().version, 'Site: ' + (scan?.host || 'Not detected'), 'Board: ' + (scan?.site || 'Not detected'), 'Detected fields: ' + (scan?.fields.map(f => f.key + ' (' + f.kind + ')').join(', ') || 'None'), 'Skipped demographic fields: ' + (scan?.skippedSensitive || 0)].join('\n'); status('report-status', ''); $('report-dialog').showModal(); });
$('copy-report').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('report-text').value); status('report-status', 'Copied. You can paste this into your feedback.', 'success'); } catch { $('report-text').select(); status('report-status', 'Select and copy the report manually.', 'error'); } });
$('close-panel').addEventListener('click', closePanel);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !document.querySelector('dialog[open]')) closePanel(); });
chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'local') void refresh(); });
chrome.tabs.onUpdated.addListener((id, info) => { if (id === currentTab?.id && (info.status === 'complete' || info.url)) void refresh(); });
void refresh();
void loadResumes();
