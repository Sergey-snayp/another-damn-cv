import { signIn, signOut, currentUser, pullProfile, redirectUri } from './auth.js';
import { captureTab, jobUrl, lookupJob, NotSignedInError, recordApplication, requestSiteAccess, sendCapture, unsendableReason, APP_URL } from './jobs.js';
import { icon, escapeHtml as esc } from './icons.js';
import { observeTextPreviews, previewCvName } from './text-display.js';
import { cachedResumes, chooseResume, cvTexts, fetchResumes, fileNameFor, pdfFor, pdfUrl } from './resumes.js';
import { findKeywords, jobFromCapture, looksLikeJobPosting, matchLabel, scoreCv } from './match.js';
import { matchAnswers } from './answers.js';
import { CAREER_KEYS, cachedCareer, fetchProfileCareer, fetchResumeCareer } from './career.js';
import { eligibilityMap, moveLocalEligibility, relocationMap, removeDefaultById, saveDefault, syncDefaults, workedBeforeFor } from './defaults.js';

const FIELD_LABELS = {
  firstName: 'First name', lastName: 'Last name', middleName: 'Middle name', preferredName: 'Preferred name', fullName: 'Full name', email: 'Email', phone: 'Phone', pronouns: 'Pronouns', location: 'Location', city: 'City', state: 'State / province', country: 'Country', postalCode: 'Postal code', addressLine: 'Address', linkedin: 'LinkedIn', github: 'GitHub', portfolio: 'Portfolio', website: 'Website', telegram: 'Telegram', workedHereBefore: 'Worked here before', eeoGender: 'Gender', eeoHispanic: 'Hispanic or Latino', eeoRace: 'Race or ethnicity', eeoVeteran: 'Veteran status', eeoDisability: 'Disability', twitter: 'Twitter / X', resume: 'Resume', coverLetter: 'Cover letter', currentCompany: 'Current company', currentTitle: 'Current title', yearsExperience: 'Years of experience', school: 'School', degree: 'Degree', fieldOfStudy: 'Field of study', graduationYear: 'Graduation year', workAuthorization: 'Work authorization', requiresSponsorship: 'Needs sponsorship', salaryExpectation: 'Salary expectation', noticePeriod: 'Notice period', heardAbout: 'How did you hear', workArrangement: 'Office, hybrid or remote', willingToRelocate: 'Relocation',
};
// Settings → "Fields to fill": each group can be switched off. All start on.
const FILL_GROUPS = [
  { id: 'contact', label: 'Contact', keys: ['firstName', 'lastName', 'middleName', 'preferredName', 'fullName', 'email', 'phone', 'pronouns'] },
  { id: 'location', label: 'Location', keys: ['location', 'city', 'state', 'country', 'postalCode', 'addressLine'] },
  { id: 'links', label: 'Links', keys: ['linkedin', 'github', 'portfolio', 'website', 'twitter', 'telegram'] },
  { id: 'documents', label: 'CV and cover letter', keys: ['resume', 'coverLetter'] },
  { id: 'experience', label: 'Experience and education', keys: ['currentCompany', 'currentTitle', 'yearsExperience', 'school', 'degree', 'fieldOfStudy', 'graduationYear', 'workedHereBefore'] },
  { id: 'workAuthorization', label: 'Work authorization', keys: ['workAuthorization', 'requiresSponsorship'] },
  { id: 'salary', label: 'Salary and availability', keys: ['salaryExpectation', 'noticePeriod'] },
  // Types of work accepted (Profile) and relocation per country (default answers).
  { id: 'workPrefs', label: 'Work type and relocation', keys: ['workArrangement', 'willingToRelocate', 'workArrangements'] },
  // "How did you hear about this job?" → the link below. Off: saved answers fill it like any company question.
  { id: 'heardAbout', label: '"How did you hear" → another-damn.cv', keys: ['heardAbout'] },
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
/** What "How did you hear about this job?" is answered with. */
const HEARD_ABOUT_ANSWER = 'https://another-damn.cv';
let diversityAnswers = {}, continueSteps = false, eligibility = {}, autofillDefaults = [], acknowledgeRequired = false;

// ─── Eligibility, asked once per country ─────────────────────────────────
// "Do you require sponsorship to work in Poland?" can have a different answer
// from the same question about the person's own country. Answers are kept on
// the account, per question type and country (src/defaults.js); `eligibility`
// is the same answers as Autofill reads them ("requiresSponsorship:Poland").
const ELIGIBILITY_KEYS = ['requiresSponsorship', 'workAuthorization'];
const eligibilityKey = (field) => (field.country ? `${field.key}:${field.country}` : field.key);
function hasEligibilityAnswer(field) {
  if (Object.keys(eligibility).some(key => key.toLowerCase() === eligibilityKey(field).toLowerCase())) return true;
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
  return `<div class="card eligibility-card"><h2>${icon('check')}Answer once</h2><p>This form asks about eligibility. Your answer is saved on your account for that country only, and used on later forms. You can also click the field's icon on the page.</p><ul class="eligibility-list">${open.map(field => `<li><span>${esc(eligibilityQuestion(field))}</span><span class="eligibility-buttons"><button class="ghost small" data-eligibility="${esc(eligibilityKey(field))}" data-answer="Yes">Yes</button><button class="ghost small" data-eligibility="${esc(eligibilityKey(field))}" data-answer="No">No</button></span></li>`).join('')}</ul></div>`;
}
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-eligibility]');
  if (!button) return;
  const [kind, ...scope] = button.dataset.eligibility.split(':');
  button.disabled = true;
  try { useDefaults(await saveDefault(kind, scope.join(':'), button.dataset.answer)); renderAutofill(); }
  catch (error) { button.disabled = false; status('fill-status', error instanceof NotSignedInError ? 'Sign in to save eligibility answers.' : `Not saved: ${error.message}`, 'error'); }
});
const DEFAULT_LABELS = { requiresSponsorship: 'Sponsorship', workAuthorization: 'Work authorization', workedHereBefore: 'Worked here before', willingToRelocate: 'Relocate' };
// Answers still only in this browser (signed out since before 0.27.0) keep working until they move.
let legacyEligibility = {};
function useDefaults(rows) { autofillDefaults = Array.isArray(rows) ? rows : []; eligibility = { ...legacyEligibility, ...eligibilityMap(autofillDefaults) }; }
/** Settings → Default answers: what was chosen from field icons or "Answer once", per country or company. */
function renderEligibilityAnswers() {
  $('eligibility-answers').hidden = !autofillDefaults.length;
  $('eligibility-answers-list').innerHTML = autofillDefaults.map(row => `<li><span>${esc(DEFAULT_LABELS[row.kind] ?? row.kind)}${row.scope ? ` · ${esc(row.scope)}` : ''}: <strong>${esc(row.value)}</strong></span><button data-remove-default="${esc(row.id)}">Remove</button></li>`).join('');
}
/**
 * The account's defaults into the local copy the page scripts read. Answers
 * kept in this browser before 0.27.0 move to the account first, once.
 */
async function loadDefaults() {
  try { await moveLocalEligibility(); } catch { /* signed out or offline: try again next time */ }
  try { useDefaults(await syncDefaults()); } catch { /* signed out or offline: the local copy stays */ }
}

/**
 * "Have you worked at <company> before?": Yes when the chosen CV lists that
 * company as an employer (a line of its own in the CV text), otherwise No.
 * Always marked "check it": a CV may leave employers out.
 */
async function workedHereBefore() {
  const asked = scan?.fields?.find(field => field.key === 'workedHereBefore');
  if (!asked) return {};
  // The company the question names ("employed at Box"), else the page's.
  const company = String(asked.company || scan?.context?.company || '').trim();
  let text = '';
  if (company && resumes.chosen) { try { text = (await cvTexts(resumes.items))[resumes.chosen.id] ?? ''; } catch { /* no CV text */ } }
  const name = company.toLowerCase();
  const listed = Boolean(text) && text.split('\n').some(line => { const value = line.trim().toLowerCase(); return value === name || value.startsWith(`${name} (`); });
  // A CV that lists this company as an employer is a fact about this one company.
  if (listed) return { workedHereBefore: 'Yes', workedHereBeforeReason: `Your CV lists ${company} as an employer, so "Yes". Check it.` };
  // Otherwise your one answer for every company, chosen from the field's icon.
  const saved = workedBeforeFor(autofillDefaults);
  if (saved) return { workedHereBefore: saved, workedHereBeforeSaved: true, workedHereBeforeReason: 'Your answer for every company. Click to change it.' };
  if (!text) return {};
  return { workedHereBefore: 'No', workedHereBeforeReason: `${company} is not among the employers in your CV, so "No". Check it, or click to save one answer for every company.` };
}
const diversityValue = key => diversityAnswers[key] ?? 'Prefer not to answer';
const GROUP_OF_KEY = new Map(FILL_GROUPS.flatMap(group => group.keys.map(key => [key, group.id])));
let fillGroups = {};
// Every group starts on, except diversity questions, which start off.
const groupOn = key => { const group = GROUP_OF_KEY.get(key); return group === 'diversity' ? fillGroups.diversity === true : fillGroups[group] !== false; };
const $ = id => document.getElementById(id);
observeTextPreviews();

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
let profile = {}, scan = null, currentTab = null, filling = false, refreshId = 0;
let copyValues = [];
let resumes = { items: [], chosen: null }, resumeProblem = '', loadingResumes = false, pageDisconnected = false;
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
// number ("3:12") so answers and "Go to" reach the right frame.
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

function valueFor(key) { if (!groupOn(key)) return ''; if (key.startsWith('eeo')) return diversityValue(key); if (key === 'resume') return resumes.chosen ? fileNameFor(resumes.chosen) : ''; if (key === 'coverLetter') return ''; if (key === 'heardAbout') return HEARD_ABOUT_ANSWER; if (CAREER_KEYS.includes(key) && careerAutofill()[key]) return careerAutofill()[key]; if (key === 'workArrangement') return workTypesText(); if (key === 'willingToRelocate') return relocationText(); return profile[key] ?? ''; }
const WORK_TYPE_NAMES = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };
function workTypesText() { return String(profile.workArrangements ?? '').split(',').map(kind => WORK_TYPE_NAMES[kind]).filter(Boolean).join(', '); }
function relocationText() { return Object.entries(relocationMap(autofillDefaults)).map(([country, answer]) => `${country || 'Anywhere'}: ${answer}`).join(', '); }
// Sections the person opened stay open when the panel redraws (after a save, a rescan…).
const keptOpen = new Set(['resume']);
document.addEventListener('toggle', event => {
  const section = event.target.closest?.('[data-keep-open]');
  if (!section) return;
  if (section.open) keptOpen.add(section.dataset.keepOpen); else keptOpen.delete(section.dataset.keepOpen);
  if (!section.open && section.querySelector('[data-cv-select][aria-expanded="true"]')) closeCvMenu();
}, true);

// ─── The job card ────────────────────────────────────────────────────────
// The posting with its company's logo (src/logo.js finds it on the page; the
// company site's icon from Google's favicon service when the page has none).
// Below it, as in Simplify: "Add this job to the app", which shows "Adding…"
// while it saves, then a banner: added, already saved, already applied (each
// with View in app), or could not add (Try again). Nothing is saved unless
// the person presses the button.
let savedJob = { url: null, job: null, checkedAt: 0 }, jobBusy = false, jobAdded = false, jobProblem = '';
// What the last Autofill used on a page: { url, resumeId, answers }. Recorded on the job when it is saved.
let lastApplication = null;
// "Save job" form, as in Simplify: filled from the page, checked by the person, then saved.
// { title, company, location, salaryMin, salaryMax, salaryCurrency, salaryPeriod,
//   employmentType, description, notes, status, url, open: { description, notes }, error }
let jobForm = null, jobPayload = {}, jobFormLoading = false;
const JOB_TYPES = ['Full-time', 'Part-time', 'Contract', 'Internship', 'Temporary'];
const PAY_PERIODS = [['year', 'Yearly'], ['month', 'Monthly'], ['week', 'Weekly'], ['day', 'Daily'], ['hour', 'Hourly']];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'PLN', 'UAH', 'CHF', 'SEK', 'NOK', 'DKK', 'CZK', 'AUD', 'NZD', 'INR', 'JPY', 'SGD', 'ILS'];
const EURO = new Set(['Germany', 'France', 'Netherlands', 'Belgium', 'Spain', 'Portugal', 'Italy', 'Austria', 'Ireland', 'Finland', 'Estonia', 'Latvia', 'Lithuania', 'Greece', 'European Union']);
const COUNTRY_CURRENCY = { Poland: 'PLN', 'United States': 'USD', Canada: 'CAD', 'United Kingdom': 'GBP', Ukraine: 'UAH', Switzerland: 'CHF', Sweden: 'SEK', Norway: 'NOK', Denmark: 'DKK', 'Czech Republic': 'CZK', Australia: 'AUD', 'New Zealand': 'NZD', India: 'INR', Japan: 'JPY', Singapore: 'SGD', Israel: 'ILS' };
const currencyFor = country => COUNTRY_CURRENCY[country] ?? (EURO.has(country) ? 'EUR' : null);
const jobTitleOnPage = () => (scan?.context?.title && scan.context.title !== 'Application form' ? scan.context.title : '');
/** The company's questions on the page that have an answer: [{ question, answer }]. */
async function answersOnPage(tab) {
  try { return (await questionsFromFrames(tab)).filter(item => item.value).map(item => ({ question: item.question, answer: item.value })); }
  catch { return []; }
}
/**
 * Adds the CV and answers to the page's job when it is saved. The answers are
 * read again from the page, so ones typed after Autofill count too. Returns
 * whether anything was recorded.
 */
async function recordOnSavedJob(url, answers = null) {
  const job = savedJob.url === url ? savedJob.job : null;
  if (!job) return false;
  const used = lastApplication?.url === url ? lastApplication : null;
  const record = { resumeId: used?.resumeId, answers: answers?.length ? answers : used?.answers ?? [] };
  if (!record.resumeId && !record.answers.length) return false;
  try { await recordApplication(job.id, record); return true; } catch { return false; }
}
const APPLIED = new Set(['applied', 'screening', 'interview', 'offer', 'accepted', 'rejected', 'declined']);
/** The logo to show and save: the page's, the saved job's, or the company site's icon. */
function jobLogo() {
  const context = scan?.context ?? {};
  if (context.logo) return context.logo;
  if (savedJob.url === currentTab?.url && savedJob.job?.companyLogo) return savedJob.job.companyLogo;
  return context.logoDomain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(context.logoDomain)}&sz=128` : null;
}
/** Whether this page's job is saved: on a new page, and again at most once a minute. */
async function checkSaved(url) {
  if (!url || (savedJob.url === url && Date.now() - savedJob.checkedAt < 60_000)) return;
  if (savedJob.url !== url) { savedJob = { url, job: null, checkedAt: 0 }; jobAdded = false; jobProblem = ''; jobForm = null; }
  savedJob.checkedAt = Date.now();
  try { const job = await lookupJob(url); if (savedJob.url === url) savedJob.job = job; }
  catch { /* signed out or offline: the button offers saving, which explains */ }
  if (!filling) renderAutofill();
}
function jobBanner() {
  const saved = savedJob.url === currentTab?.url ? savedJob.job : null;
  const view = '<button class="link-button" id="job-view">View in app</button>';
  if (jobBusy) return '';
  if (jobAdded && saved) return `<div class="job-banner is-added" role="status"><span>${icon('check', 16)}Added to your jobs!</span>${view}</div>`;
  if (saved && (APPLIED.has(saved.status) || saved.appliedAt)) {
    const date = saved.appliedAt ? new Date(saved.appliedAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    return `<div class="job-banner is-applied" role="status"><span><strong>You've already applied to this job</strong>${date ? `<small>Applied on ${esc(date)}</small>` : ''}</span>${view}</div>`;
  }
  if (saved) return `<div class="job-banner is-saved" role="status"><span>This job is already in your jobs</span>${view}</div>`;
  if (jobProblem) return `<div class="job-banner is-error" role="alert"><span><strong>Couldn't add this job</strong><small>${esc(jobProblem)}</small></span><button class="link-button" id="job-retry">Try again</button></div>`;
  return '';
}
function jobFormHtml() {
  const form = jobForm;
  const field = (name, label, value, attrs = '') => `<label class="field"><span>${label}</span><input name="${name}" value="${esc(value ?? '')}" ${attrs}></label>`;
  const select = (name, label, options, value, empty = '') => `<label class="field"><span>${label}</span><select name="${name}">${empty ? `<option value="">${esc(empty)}</option>` : ''}${options.map(([optionValue, optionLabel]) => `<option value="${esc(optionValue)}" ${String(value ?? '') === optionValue ? 'selected' : ''}>${esc(optionLabel)}</option>`).join('')}</select></label>`;
  const currency = form.salaryCurrency || 'USD';
  const currencies = [...new Set([currency, ...CURRENCIES])].map(code => [code, code]);
  const toggle = (part, label, has) => `<button type="button" class="job-form-toggle" data-job-toggle="${part}" aria-expanded="${form.open[part]}">${label} <span>— ${form.open[part] ? 'Click to collapse' : has ? 'Click to edit' : 'Click to add'}</span></button>`;
  return `<form class="card job-form" id="job-form" novalidate>
    <div class="job-form-head"><strong>Save job</strong><p>Save this job in your app. The details come from the page: check them and change anything that is wrong.</p></div>
    ${field('company', 'Company', form.company, 'placeholder="Company" autocomplete="off"')}
    ${field('title', 'Position Title', form.title, 'placeholder="Title" autocomplete="off"')}
    ${field('location', 'Location', form.location, 'placeholder="Location" autocomplete="off"')}
    <div class="job-form-row">${field('salaryMin', `Min. Salary (${esc(currency)})`, form.salaryMin, 'type="number" min="0" inputmode="numeric" placeholder="Min. Salary"')}${field('salaryMax', `Max. Salary (${esc(currency)})`, form.salaryMax, 'type="number" min="0" inputmode="numeric" placeholder="Max. Salary"')}</div>
    <div class="job-form-row">${select('salaryCurrency', 'Currency', currencies, currency)}${select('salaryPeriod', 'Period', PAY_PERIODS, form.salaryPeriod || 'year')}</div>
    ${select('employmentType', 'Job Type', JOB_TYPES.map(type => [type, type]), form.employmentType, 'Choose a type')}
    <div class="job-form-part">${toggle('description', 'Job Description', form.description)}${!form.open.description && form.description ? '<small>Auto-detected description available.</small>' : ''}${form.open.description ? `<textarea name="description" rows="8" placeholder="ex. This role requires a strong understanding of React and Node.js.">${esc(form.description)}</textarea>` : ''}</div>
    <div class="job-form-part">${toggle('notes', 'Notes', form.notes)}${!form.open.notes && form.notes ? '<small>Notes added.</small>' : ''}${form.open.notes ? `<textarea name="notes" rows="4" placeholder="Notes">${esc(form.notes)}</textarea>` : ''}</div>
    ${select('status', 'Application Status', [['saved', 'Saved'], ['applied', 'Applied']], form.status)}
    ${field('url', 'Job Posting URL', form.url, 'type="url" placeholder="URL"')}
    ${form.error ? `<p class="status error" role="alert">${esc(form.error)}</p>` : ''}
    <div class="job-form-actions"><button type="button" class="ghost small" id="job-form-cancel">Cancel</button><button type="submit" class="primary small" id="job-form-save">Save Job</button></div>
  </form>`;
}
function pageCard() {
  if (!scan) return '';
  const title = scan.context?.title || 'Application form';
  const company = scan.context?.company || scan.host;
  const initials = company.split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
  const logo = jobLogo();
  const saved = savedJob.url === currentTab?.url && savedJob.job;
  const posted = postingDate(scan.context?.postedAt ?? (saved ? saved.postedAt : null));
  const form = jobForm && !saved && !jobBusy ? jobFormHtml() : '';
  const button = jobBusy ? '<div class="job-adding" aria-live="polite">Adding to your jobs…</div>'
    : jobFormLoading ? '<div class="job-adding" aria-live="polite">Reading the job…</div>'
      : saved || jobProblem || jobForm ? '' : `<button class="job-add" id="job-save">${icon('briefcase', 17)}Add this job to the app</button>`;
  return `<section class="job-context" aria-label="Current job"><div class="page-card" id="job-card">
    <span class="company-avatar" data-initials="${esc(initials)}">${logo ? `<img src="${esc(logo)}" alt="" referrerpolicy="no-referrer">` : esc(initials)}</span>
    <span class="page-card-body"><span class="page-card-title">${esc(title)}</span><span class="page-card-meta"><span class="page-card-company" title="${esc(company)}">${esc(company)}</span>${posted ? `<span class="posted-date"><span aria-hidden="true">·</span> <time datetime="${posted.day}">Posted ${posted.label}</time></span>` : ''}</span></span>
  </div><div class="job-context-actions">${jobBanner()}${button}</div></section>${form}`;
}
function postingDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;
  const day = value.slice(0, 10), date = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return null;
  return { day, label: date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) };
}
/** "Add this job to the app": opens the "Save job" form, filled from the page. Nothing is saved yet. */
async function onAddJob() {
  if (jobFormLoading || jobBusy) return;
  const tab = currentTab;
  jobFormLoading = true; jobProblem = ''; renderAutofill();
  const found = (await askPage({ type: 'job-details' }, tab).catch(() => null)) ?? {};
  jobFormLoading = false;
  if (tab !== currentTab) { renderAutofill(); return; }
  jobForm = {
    title: found.title && found.title !== 'Application form' ? found.title : jobTitleOnPage(),
    company: found.company || scan?.context?.company || '',
    location: found.location || '',
    salaryMin: found.salaryMin ?? '', salaryMax: found.salaryMax ?? '',
    salaryCurrency: found.salaryCurrency || currencyFor(found.country) || currencyFor(profile.country) || 'USD',
    salaryPeriod: found.salaryPeriod || 'year',
    employmentType: found.employmentType || '',
    description: found.description || '',
    notes: '',
    status: 'saved',
    url: found.url || tab?.url || '',
    open: { description: false, notes: false },
    error: '',
  };
  renderAutofill();
  const first = ['company', 'title', 'location'].find(name => !jobForm[name]) ?? 'company';
  document.querySelector(`#job-form [name="${first}"]`)?.focus();
}
/** The form's values for the app, or a message about what is missing (Simplify's wording). */
function jobFormDetails(form) {
  const text = value => String(value ?? '').trim();
  const number = value => (text(value) === '' || !Number.isFinite(Number(value)) ? null : Math.round(Number(value)));
  if (!text(form.company)) return { error: 'Please enter a company.' };
  if (!text(form.title)) return { error: 'Please enter a position title.' };
  if (!text(form.location)) return { error: 'Please enter a location.' };
  if (text(form.url) && !/^https?:\/\//i.test(text(form.url))) return { error: 'Please enter the job link as a web address (https://…).' };
  const salaryMin = number(form.salaryMin), salaryMax = number(form.salaryMax);
  return {
    details: {
      title: text(form.title), company: text(form.company), location: text(form.location),
      salaryMin, salaryMax,
      salaryCurrency: salaryMin !== null || salaryMax !== null ? text(form.salaryCurrency) || null : null,
      salaryPeriod: salaryMin !== null || salaryMax !== null ? form.salaryPeriod || 'year' : null,
      employmentType: text(form.employmentType) || null,
      description: text(form.description) || null,
      notes: text(form.notes) || null,
      status: form.status === 'applied' ? 'applied' : 'saved',
      ...(text(form.url) && { url: text(form.url) }),
    },
  };
}
/**
 * Saves the posting with its logo. Only from the form ("Save Job") or Try
 * again. `payload` is { details } from the form; the app keeps those values.
 */
function saveJob(payload = {}) {
  jobPayload = payload;
  const tab = currentTab;
  if (jobBusy || !tab?.id) return;
  const reason = unsendableReason(tab);
  if (reason) { jobProblem = reason; renderAutofill(); return; }
  const access = requestSiteAccess(tab); // Must start in the click's user gesture.
  jobBusy = true; jobProblem = ''; renderAutofill();
  void (async () => {
    try {
      if (!await access) { jobProblem = 'Access to this site was not allowed.'; return; }
      const logo = jobLogo();
      const { job } = await sendCapture({ ...await captureTab(tab.id), ...(logo && { companyLogo: logo }), ...payload });
      savedJob = { url: tab.url, job, checkedAt: Date.now() }; jobAdded = true; jobForm = null;
      await recordOnSavedJob(tab.url, await answersOnPage(tab));
    } catch (error) {
      if (error instanceof NotSignedInError) { selectTab('profile'); document.querySelector('.account-card').open = true; }
      jobProblem = /Cannot access|cannot be scripted|Frame with ID/i.test(error.message) ? 'Chrome does not let extensions read this page.' : error.message;
    } finally { jobBusy = false; renderAutofill(); }
  })();
}
// Saved from the right-click menu while the panel is open: show it as saved.
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'job-saved' || sender.tab || message.url !== currentTab?.url) return false;
  savedJob.checkedAt = 0;
  void checkSaved(message.url);
  return false;
});
// The form keeps what the person types, so a panel refresh does not lose it.
for (const type of ['input', 'change']) document.addEventListener(type, event => {
  const input = event.target.closest('#job-form [name]');
  if (!input || !jobForm) return;
  jobForm[input.name] = input.value;
  if (input.name === 'salaryCurrency' && type === 'change') renderAutofill(); // The salary labels show the currency.
});
document.addEventListener('submit', event => {
  if (!event.target.closest('#job-form') || !jobForm) return;
  event.preventDefault();
  const { details, error } = jobFormDetails(jobForm);
  jobForm.error = error ?? '';
  if (error) { renderAutofill(); document.querySelector(`#job-form [name="${/company/.test(error) ? 'company' : /title/.test(error) ? 'title' : /location/.test(error) ? 'location' : 'url'}"]`)?.focus(); return; }
  saveJob({ details });
});
document.addEventListener('click', event => {
  const toggle = event.target.closest('[data-job-toggle]');
  if (toggle && jobForm) { jobForm.open[toggle.dataset.jobToggle] = !jobForm.open[toggle.dataset.jobToggle]; renderAutofill(); document.querySelector(`#job-form [name="${toggle.dataset.jobToggle}"]`)?.focus(); return; }
  if (event.target.closest('#job-form-cancel')) { jobForm = null; renderAutofill(); return; }
  if (event.target.closest('#job-retry')) { saveJob(jobPayload); return; }
  if (event.target.closest('#job-save')) void onAddJob();
  else if (event.target.closest('#job-view') && savedJob.job) void chrome.tabs.create({ url: jobUrl(savedJob.job.id) });
});
// A logo that fails to load gives way to the company's initials.
document.addEventListener('error', event => {
  const image = event.target;
  if (image?.tagName === 'IMG' && image.closest('.company-avatar')) image.replaceWith(document.createTextNode(image.parentElement.dataset.initials ?? ''));
}, true);
function renderAutofill() {
  const host = $('panel-autofill');
  if (!scan && pageDisconnected) {
    host.innerHTML = `<div class="notice">${icon('refresh')}<div><strong>Reload this page to reconnect</strong><p>The extension was updated while this page was open, so it can no longer read the form. Reloading keeps nothing you typed on the page.</p><button class="primary" id="reload-page">${icon('refresh')}Reload page</button></div></div>`;
    $('reload-page').addEventListener('click', () => { if (currentTab?.id) void chrome.tabs.reload(currentTab.id); });
    return;
  }
  if (!scan || !scan.fields?.length) {
    const opener = scan?.canOpenForm ? `<button class="primary" id="open-form">${icon('file')}Open application form</button>` : '';
    host.innerHTML = `${pageCard()}<div class="notice">${icon('file')}<div><strong>${scan ? 'No application fields found yet' : 'Autofill is not available on this page'}</strong><p>${scan?.canOpenForm ? 'Open the form to start Autofill.' : scan ? 'Open the application form, then rescan.' : 'Open a supported application form. Your CV and Profile are still available here.'}</p>${opener}<button class="ghost" id="rescan-empty">${icon('refresh')}Rescan page</button></div></div>${autofillCvCard()}`;
    $('rescan-empty').addEventListener('click', refresh);
    $('open-form')?.addEventListener('click', openForm);
    return;
  }
  const ready = scan.fields.filter(field => valueFor(field.key)).length;
  const groups = new Map();
  for (const field of scan.fields) { if (!groups.has(field.group)) groups.set(field.group, []); groups.get(field.group).push(field); }
  const rows = [...groups].map(([group, fields]) => `<p class="group">${esc(group)}</p><ul class="fields">${fields.map(field => `<li><span class="key">${esc(FIELD_LABELS[field.key] || field.key)}</span>${!groupOn(field.key) ? '<span class="missing">Off in Settings</span>' : valueFor(field.key) ? `<span class="val">${esc(valueFor(field.key))}</span>` : '<span class="missing">Add a value</span>'}</li>`).join('')}</ul>`).join('');
  host.innerHTML = `${pageCard()}
    <div class="fill-block"><button class="primary fill-action" id="fill" ${ready && !switchingCv ? '' : 'disabled'}>${icon('bolt', 20)}Autofill This Page</button><p class="hint">${ready} of ${scan.fields.length} fields ready · Review before submitting</p><div class="status${fillReport ? ` ${fillReport.kind}` : ''}" id="fill-status" role="status">${esc(fillReport?.text ?? '')}</div>${fillReportDetails()}${!ready ? '<button class="ghost" id="add-details">Add your details in the app</button>' : ''}</div>
    ${eligibilityCard()}
    ${autofillCvCard()}
    <details class="card autofill-detail" data-keep-open="fields" ${keptOpen.has('fields') ? 'open' : ''}><summary>${icon('check', 18)}Fields to fill<span class="summary-count">${ready}/${scan.fields.length}</span></summary>${rows}${scan.skippedSensitive ? `<p class="hint">${scan.skippedSensitive} demographic question(s) will stay untouched.</p>` : ''}${scan.consentCount ? `<p class="hint">${scan.consentCount} consent checkbox(es) are left for you to tick.</p>` : ''}</details>`;
  $('fill').addEventListener('click', runFill);
  $('add-details')?.addEventListener('click', () => void openApp('/profile'));
}
async function runFill() {
  if (filling || switchingCv) return;
  closeCvMenu();
  cvStatus('');
  filling = true;
  document.querySelectorAll('[data-cv-select]').forEach(button => { button.disabled = true; });
  const button = $('fill'); button.disabled = true;
  status('fill-status', 'Filling…');
  const target = currentTab;
  try {
    // Autofill uploads the CV chosen at the moment of the click, as a PDF of its
    // latest saved version. A missing PDF does not stop the other fields.
    let file = null, cvProblem = '';
    if (resumes.chosen && groupOn('resume') && scan?.fields.some(field => field.key === 'resume')) {
      try {
        try { resumes = await fetchResumes(); } catch { /* use the cached list */ }
        status('fill-status', 'Getting your CV…');
        file = await pdfFor(resumes.chosen);
      } catch (error) { cvProblem = `CV not attached: ${error.message}`; }
      status('fill-status', 'Filling…');
    }
    // Fields in groups switched off in Settings are sent empty, so they stay as they are.
    const allowed = Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, groupOn(key) ? value : '']));
    for (const key of Object.keys(DIVERSITY_CHOICES)) if (groupOn(key)) allowed[key] = diversityValue(key);
    allowed.heardAbout = groupOn('heardAbout') ? HEARD_ABOUT_ANSWER : '';
    // Current role, years and education from the Profile or the selected CV ("Autofill uses" in the Profile tab).
    for (const key of CAREER_KEYS) { const value = careerAutofill()[key]; if (value) allowed[key] = groupOn(key) ? value : ''; }
    allowed.relocation = groupOn('willingToRelocate') ? relocationMap(autofillDefaults) : {};
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
    // The CV this Autofill uploaded and the answers now on the form, for the saved job.
    lastApplication = { url: target?.url, resumeId: file ? resumes.chosen?.id : undefined, answers: await answersOnPage(target) };
    if (await recordOnSavedJob(target?.url)) fillReport.notes.push('Your CV and answers were added to this job in the app');
  } catch (error) { fillReport = { url: target?.url, text: error.message, kind: 'error', notes: [], missing: [] }; }
  finally { filling = false; rerenderResumes(); }
  // Settings → "Draft unknown questions with AI": off unless the person switched it on.
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

/** Notes from the last fill ("CV: uploaded") and required fields still empty. */
function fillReportDetails() {
  if (!fillReport) return '';
  const notes = fillReport.notes.length ? `<details class="fill-notes-disclosure" data-keep-open="fill-report" ${keptOpen.has('fill-report') ? 'open' : ''}><summary>Fill details<span class="summary-count">${fillReport.notes.length}</span></summary><ul class="fill-notes">${fillReport.notes.map(note => `<li>${esc(note)}</li>`).join('')}</ul></details>` : '';
  const missing = fillReport.missing.length
    ? `<div class="still-empty"><strong>Still empty and required (${fillReport.missing.length})</strong><ul>${fillReport.missing.map(item => `<li><button data-focus-field="${esc(item.id)}"><span class="empty-label">${esc(item.label)}${item.reason ? `<small>${esc(item.reason)}</small>` : ''}</span><span>Go to</span></button></li>`).join('')}</ul><button class="ghost" id="check-required">${icon('refresh', 16)}Check again</button></div>`
    : fillReport.kind === 'success' ? '<p class="hint">No required fields are empty.</p>' : '';
  return missing + notes;
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

// ─── Profile tab ─────────────────────────────────────────────────────────
// What the app's Profile holds, from the server: contact, experience,
// education, skills, summary and preferences. Every value copies on click;
// nothing is sent to the website. Edits happen in the app (Edit Profile).
//
// "Autofill uses: Selected resume | Profile" decides where Autofill takes the
// current company and title, years of experience and education from.
const careerAsked = new Set();
let career = { profile: null, resumes: {} }, careerProblem = '', careerLoading = false, careerSource = null;
const WORK_TYPE_LABELS = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site' };
const hasCareer = view => Boolean(view && (view.experiences?.length || view.educations?.length || view.skills?.length || view.summary));
/** Where Autofill takes experience and education from: the switch, else the Profile when it has experience. */
function activeSource() {
  if (careerSource === 'profile' || careerSource === 'resume') return careerSource;
  return career.profile?.experiences?.length || !resumes.chosen ? 'profile' : 'resume';
}
function activeCareer() {
  return activeSource() === 'resume' ? career.resumes[resumes.chosen?.id] ?? null : career.profile;
}
/** Current company, title, years and education for Autofill, from the active source. */
function careerAutofill() { return activeCareer()?.fields ?? {}; }

async function loadCareer() {
  careerLoading = true; careerProblem = ''; renderProfileOverview();
  try {
    const [profileView, resumeView] = await Promise.all([fetchProfileCareer(), resumes.chosen ? fetchResumeCareer(resumes.chosen.id) : Promise.resolve(null)]);
    career = { profile: profileView, resumes: { ...career.resumes, ...(resumeView && { [resumes.chosen.id]: resumeView }) } };
  } catch (error) { careerProblem = error instanceof NotSignedInError ? 'Sign in to see your Profile from the app.' : error.message; }
  finally { careerLoading = false; renderProfileOverview(); renderAutofill(); }
}

const formatMonth = value => {
  const match = String(value ?? '').match(/^(\d{4})(?:-(\d{2}))?/);
  if (!match) return String(value ?? '');
  return match[2] ? new Date(Number(match[1]), Number(match[2]) - 1).toLocaleString('en', { month: 'short', year: 'numeric' }) : match[1];
};
const period = item => [formatMonth(item.from), item.current ? 'Present' : formatMonth(item.to)].filter(Boolean).join(' – ');

function renderProfileOverview() {
  copyValues = [];
  const copy = (value, label, kind = '') => {
    if (!value) return ''; const index = copyValues.push(String(value)) - 1;
    return `<button class="copy-value${kind ? ` ${kind}` : ''}" data-copy="${index}" aria-label="Copy ${esc(label)}" title="Copy ${esc(label)}">${esc(value)}</button>`;
  };
  const editButton = what => `<button class="icon-button edit-app-profile" aria-label="Edit ${esc(what)} in the app" title="Edit in the app">${icon('edit', 18)}</button>`;
  const heading = (title, extra = '') => `<div class="profile-card-heading"><h2>${esc(title)}</h2><span class="profile-card-actions">${extra}${editButton(title.toLowerCase())}</span></div>`;
  const view = activeCareer();
  const source = activeSource();
  const empty = what => source === 'profile'
    ? `<p class="muted">No ${what} in your Profile yet. <button class="link-button edit-app-profile">Import it from a CV in the app</button>.</p>`
    : `<p class="muted">The selected CV has no ${what}.</p>`;

  // Contact
  const name = profile.fullName || [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const initials = (name || '?').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const place = profile.location || [profile.city, profile.state, profile.country].filter(Boolean).join(', ');
  const links = ['linkedin', 'github', 'portfolio', 'website', 'telegram'].filter(key => profile[key]);
  let html = `<div class="card">${heading(name || 'Your profile', `<button class="icon-button" id="refresh-profile" aria-label="Refresh from the app" title="Refresh from the app"${careerLoading ? ' disabled' : ''}>${icon('refresh', 18)}</button>`)}
    <div class="profile-contact"><div class="profile-initials">${esc(initials)}</div><div>${copy(place, 'location', 'is-heading')}${copy(profile.email, 'email')}${copy(profile.phone, 'phone')}${!name && !profile.email ? '<p>Sign in under Account &amp; sync to see your profile.</p>' : ''}</div></div>
    ${links.length ? `<div class="profile-links">${links.map(key => `<div><small class="muted">${FIELD_LABELS[key]}</small>${copy(profile[key], FIELD_LABELS[key])}</div>`).join('')}</div>` : ''}</div>`;
  if (careerProblem && !view) html += `<div class="notice">${icon('flag')}<div><p data-text-preview>${esc(careerProblem)}</p></div></div>`;

  // Experience, with the switch for where Autofill takes it from
  const toggle = `<div class="source-switch" role="group" aria-label="Autofill uses"><span class="muted">Autofill uses</span><span class="segmented">${[['resume', 'Selected resume'], ['profile', 'Profile']].map(([value, label]) => `<button class="${source === value ? 'is-active' : ''}" data-career-source="${value}" aria-pressed="${source === value}"${value === 'resume' && !resumes.chosen ? ' disabled title="Choose a CV in the Resume tab"' : ''}>${label}</button>`).join('')}</span></div>`;
  const experiences = view?.experiences ?? [];
  html += `<div class="card">${heading('Experience')}${toggle}${source === 'resume' && resumes.chosen ? `<p class="muted small">From <span class="cv-inline" title="${esc(resumes.chosen.name)}">${esc(resumes.chosen.name)}</span></p>` : ''}${experiences.length ? experiences.map((role, roleIndex) => {
    const bullets = role.bullets ?? [];
    const open = profileOpen.has(roleIndex);
    return `<div class="profile-entry"><div class="profile-entry-icon">${icon('briefcase', 18)}</div><div class="profile-entry-body">${copy(role.title, 'title', 'is-heading')}${copy([role.company, role.client && `for ${role.client}`, role.location].filter(Boolean).join(' · '), 'company')}${copy(period(role), 'dates')}${role.description ? copy(role.description, 'description') : ''}${bullets.length ? `<ul class="profile-bullets">${(open ? bullets : bullets.slice(0, 3)).map(bullet => `<li>${copy(bullet, 'bullet')}</li>`).join('')}</ul>${bullets.length > 3 ? `<button class="link-button" data-toggle-role="${roleIndex}">${open ? 'Show less' : `Show all ${bullets.length}`}</button>` : ''}` : ''}</div></div>`;
  }).join('') : careerLoading && !view ? '<p class="muted">Loading…</p>' : empty('experience')}</div>`;

  // Education
  const educations = view?.educations ?? [];
  html += `<div class="card">${heading('Education')}${educations.length ? educations.map(entry => `<div class="profile-entry"><div class="profile-entry-icon">${icon('file', 18)}</div><div class="profile-entry-body">${copy(entry.institution, 'school', 'is-heading')}${copy([entry.degree, entry.field].filter(Boolean).join(', '), 'degree')}${copy(period(entry), 'years')}</div></div>`).join('') : empty('education')}</div>`;

  // Skills
  const skills = view?.skills ?? [];
  html += `<div class="card">${heading('Skills')}${skills.length ? `<div class="skill-chips">${skills.map(skill => copy(skill, skill, 'chip')).join('')}</div>` : empty('skills')}</div>`;

  // Summary
  if (view?.summary) html += `<div class="card">${heading('Summary')}${copy(view.summary, 'summary')}</div>`;

  // Preferences: types of work and default answers
  const types = String(profile.workArrangements ?? '').split(',').map(kind => WORK_TYPE_LABELS[kind]).filter(Boolean);
  const defaults = autofillDefaults.map(row => `${DEFAULT_LABELS[row.kind] ?? row.kind}${row.kind === 'workedHereBefore' ? '' : row.scope ? ` · ${row.scope}` : ''}: ${row.value}`);
  html += `<div class="card">${heading('Preferences')}<small class="muted">Types of work</small>${types.length ? copy(types.join(', '), 'types of work') : '<p class="muted">Not set. Choose them in the app, or from a field\'s icon on a form.</p>'}${defaults.length ? `<small class="muted">Default answers</small>${defaults.map(text => copy(text, text)).join('')}` : ''}</div>`;

  $('profile-overview').innerHTML = html;
  $('profile-overview').querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(copyValues[Number(button.dataset.copy)]); status('copy-status', 'Copied.', 'success'); }
    catch { status('copy-status', 'Could not copy. Select the value and copy it manually.', 'error'); }
  }));
  $('profile-overview').querySelectorAll('.edit-app-profile').forEach(button => button.addEventListener('click', () => void openApp('/profile')));
}
const profileOpen = new Set();
$('profile-overview').addEventListener('click', async event => {
  const roleToggle = event.target.closest('[data-toggle-role]');
  if (roleToggle) { const index = Number(roleToggle.dataset.toggleRole); if (profileOpen.has(index)) profileOpen.delete(index); else profileOpen.add(index); renderProfileOverview(); return; }
  if (event.target.closest('#refresh-profile')) { try { await pullProfile(); } catch { /* signed out: the career load says so */ } await loadDefaults(); await loadCareer(); return; }
  const choice = event.target.closest('[data-career-source]');
  if (choice && !choice.disabled) {
    careerSource = choice.dataset.careerSource;
    try { await chrome.storage.local.set({ careerSource }); } catch { /* kept for this panel only */ }
    renderProfileOverview(); renderAutofill();
    if (careerSource === 'resume' && resumes.chosen && !career.resumes[resumes.chosen.id]) void loadCareer();
  }
});

// Autofill and Resume share one choice and one searchable overlay. Names wrap
// within the shared character limit; full names remain searchable/readable.
let cvMenu = { open: false, query: '', active: 0, anchorId: null };
let cvReport = { text: '', kind: '' };
let switchingCv = false;
function cvStatus(text, kind = '') {
  cvReport = { text, kind };
  status('resume-status', text, kind);
  status('autofill-cv-status', text, kind);
}
const cvMenuNode = document.createElement('div');
cvMenuNode.className = 'cv-menu';
cvMenuNode.id = 'cv-menu';
cvMenuNode.hidden = true;
cvMenuNode.innerHTML = `<input class="cv-search" id="cv-search" type="search" placeholder="Search your CVs" aria-label="Search your CVs" autocomplete="off" role="combobox" aria-controls="cv-options" aria-expanded="true"><ul class="cv-options" id="cv-options" role="listbox" aria-label="Your CVs"></ul><div class="cv-menu-detail" hidden><span>Full CV name</span><p id="cv-active-name"></p></div>`;
document.body.append(cvMenuNode);
cvMenuNode.addEventListener('pointerover', event => {
  const option = event.target.closest('.cv-option');
  const index = option ? [...$('cv-options').children].indexOf(option) : -1;
  if (index >= 0 && index !== cvMenu.active) { cvMenu.active = index; renderCvOptions(); }
});

/** The CVs to list: the default first, then the rest as the app orders them; filtered by the search. */
function cvOptions() {
  const query = cvMenu.query.trim().toLowerCase();
  const items = [...resumes.items].sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)));
  return query ? items.filter(item => item.name.toLowerCase().includes(query)) : items;
}
function renderCvOptions() {
  const options = cvOptions();
  cvMenu.active = Math.min(cvMenu.active, Math.max(0, options.length - 1));
  $('cv-options').innerHTML = options.length ? options.map((item, index) => {
    const chosen = item.id === resumes.chosen?.id;
    const score = match?.scores?.[item.id];
    return `<li role="option" id="cv-option-${index}" aria-selected="${chosen}" class="cv-option${index === cvMenu.active ? ' is-active' : ''}"><button type="button" data-pick="${esc(item.id)}" tabindex="-1"><span class="cv-check" aria-hidden="true">${chosen ? icon('check', 14) : ''}</span><span class="cv-option-name" title="${esc(item.name)}">${esc(item.name)}${item.isPrimary ? ' <small>(default)</small>' : ''}</span>${score >= 70 ? `<span class="cv-option-score" title="Matches ${score}% of this job's keywords">${score}%</span>` : ''}</button></li>`;
  }).join('') : '<li class="cv-empty">No CVs found</li>';
  const activeName = options[cvMenu.active]?.name ?? '';
  $('cv-active-name').textContent = activeName;
  $('cv-active-name').parentElement.hidden = previewCvName(activeName) === activeName;
  $('cv-search').setAttribute('aria-activedescendant', options.length ? `cv-option-${cvMenu.active}` : '');
  $('cv-options').querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
}
/** Under the CV button, as wide as the panel allows. */
function placeCvMenu() {
  const button = $(cvMenu.anchorId);
  if (cvMenuNode.hidden) return;
  if (!button || button.closest('[hidden]')) { closeCvMenu(); return; }
  const box = button.getBoundingClientRect();
  const width = Math.min(Math.max(box.width, 280), innerWidth - 24);
  cvMenuNode.style.width = `${width}px`;
  cvMenuNode.style.left = `${Math.max(12, Math.min(box.left, innerWidth - width - 12))}px`;
  const below = innerHeight - box.bottom - 18, above = box.top - 18;
  const upwards = below < 220 && above > below;
  cvMenuNode.style.top = upwards ? 'auto' : `${box.bottom + 6}px`;
  cvMenuNode.style.bottom = upwards ? `${innerHeight - box.top + 6}px` : 'auto';
  cvMenuNode.style.maxHeight = `${Math.max(0, upwards ? above : below)}px`;
}
function openCvMenu(button) {
  if (!resumes.items.length || filling || switchingCv) return;
  closeCvMenu();
  cvMenu.query = '';
  cvMenu = { open: true, query: '', active: Math.max(0, cvOptions().findIndex(item => item.id === resumes.chosen?.id)), anchorId: button.id };
  $('cv-search').value = '';
  cvMenuNode.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  renderCvOptions();
  placeCvMenu();
  $('cv-search').focus();
}
function closeCvMenu(focusButton = false) {
  if (!cvMenu.open) return;
  cvMenu.open = false;
  cvMenuNode.hidden = true;
  $(cvMenu.anchorId)?.setAttribute('aria-expanded', 'false');
  if (focusButton) $(cvMenu.anchorId)?.focus();
}
$('cv-search').addEventListener('input', event => { cvMenu.query = event.target.value; cvMenu.active = 0; renderCvOptions(); });
$('cv-search').addEventListener('keydown', event => {
  const options = cvOptions();
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    cvMenu.active = (cvMenu.active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % Math.max(1, options.length);
    renderCvOptions();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (options[cvMenu.active]) void switchCv(options[cvMenu.active].id);
  } else if (event.key === 'Escape') {
    // Only the list closes, not the panel.
    event.preventDefault(); event.stopPropagation();
    closeCvMenu(true);
  } else if (event.key === 'Tab') closeCvMenu();
});
document.addEventListener('pointerdown', event => {
  if (cvMenu.open && !cvMenuNode.contains(event.target) && !event.target.closest('[data-cv-select]')) closeCvMenu();
}, true);
document.querySelector('main').addEventListener('scroll', placeCvMenu, { passive: true });
addEventListener('resize', placeCvMenu);
document.addEventListener('click', event => {
  const button = event.target.closest('[data-cv-select]');
  if (button) { if (cvMenu.open && cvMenu.anchorId === button.id) closeCvMenu(); else openCvMenu(button); }
});

function resumeEmpty() {
  if (resumeProblem === 'signed-out') return `<div class="resume-empty"><p>Sign in to see the CVs from your app.</p><button class="ghost" data-go-sign-in>Sign in on the Profile tab</button></div>`;
  if (resumeProblem) return `<div class="resume-empty"><p data-text-preview>${esc(resumeProblem)}</p><button class="ghost" data-refresh-cvs>${icon('refresh', 17)}Try again</button></div>`;
  if (loadingResumes) return '<div class="resume-empty"><p>Loading your CVs…</p></div>';
  return `<div class="resume-empty"><p>No CVs in Documents yet.</p><button class="ghost" data-open-documents>Open Documents</button></div>`;
}
/** Both tabs give the CV name a full row, with secondary actions underneath. */
function cvPicker(id = 'cv-select') {
  const chosen = resumes.chosen;
  if (!chosen) return resumeEmpty();
  const expanded = cvMenu.open && cvMenu.anchorId === id;
  const long = previewCvName(chosen.name) !== chosen.name;
  return `<div class="cv-select-row">
      <button class="cv-select" id="${id}" data-cv-select type="button" aria-haspopup="listbox" aria-expanded="${expanded}" aria-controls="cv-menu" aria-label="Change CV: ${esc(chosen.name)}" ${filling || switchingCv ? 'disabled' : ''}>
        <span class="cv-select-copy"><span class="cv-select-name" title="${esc(chosen.name)}">${esc(chosen.name)}</span></span>
        <span class="cv-select-chevron" aria-hidden="true">${icon('chevron', 14)}</span>
      </button><button class="cv-preview" type="button" data-open-cv="${esc(chosen.id)}" aria-label="Preview resume" title="Preview resume">${icon('eye', 18)}</button>
    </div>
    ${long ? `<details class="cv-full-name"><summary>Full CV name</summary><p>${esc(chosen.name)}</p></details>` : ''}`;
}
function autofillCvCard() {
  return `<details class="card resume-card" data-keep-open="resume" ${keptOpen.has('resume') ? 'open' : ''}><summary>${icon('file', 20)}Resume</summary><div id="autofill-cv-picker">${cvPicker('autofill-cv-select')}</div>${!groupOn('resume') ? '<p class="cv-note">CV uploads are off in Settings.</p>' : ''}<div id="autofill-cv-status" class="status ${cvReport.kind}" role="status">${esc(cvReport.text)}</div>${resumes.chosen ? matchCard() : ''}</details>`;
}
function renderResume() {
  $('resume-picker').innerHTML = cvPicker();
  if (cvMenu.open) { renderCvOptions(); placeCvMenu(); }
  $('refresh-cvs').disabled = loadingResumes;
}
function rerenderResumes() { renderResume(); if (!filling) renderAutofill(); if (cvMenu.open) placeCvMenu(); }
/** Fetches the CV list from the app. The cached list stays on screen meanwhile. */
async function loadResumes() {
  if (loadingResumes) return;
  loadingResumes = true; rerenderResumes();
  try {
    const previousId = resumes.chosen?.id;
    resumes = await fetchResumes(); resumeProblem = '';
    if (previousId !== resumes.chosen?.id) cvStatus('');
  }
  catch (error) { resumeProblem = error instanceof NotSignedInError ? 'signed-out' : error.message; }
  finally { loadingResumes = false; rerenderResumes(); }
}
document.addEventListener('click', event => {
  const target = event.target.closest('[data-pick],[data-open-cv],[data-refresh-cvs],[data-go-sign-in],[data-open-documents]');
  if (!target) return;
  if (target.dataset.openCv) { void chrome.tabs.create({ url: pdfUrl(target.dataset.openCv) }); return; }
  if ('refreshCvs' in target.dataset) { void loadResumes(); return; }
  if ('openDocuments' in target.dataset) { void openApp('/documents'); return; }
  if ('goSignIn' in target.dataset) { selectTab('profile'); document.querySelector('.account-card').open = true; return; }
  void switchCv(target.dataset.pick);
});
/**
 * Makes another CV the one Autofill uploads. When Autofill already uploaded a
 * CV to the form on this page, the new one replaces it there too (as in
 * Simplify), and the saved job records it.
 */
async function switchCv(id) {
  if (filling || switchingCv) return;
  const anchorId = cvMenu.anchorId;
  closeCvMenu(true);
  const before = resumes.chosen?.id;
  if (!id || id === before) return;
  switchingCv = true;
  cvStatus('Switching CV…');
  rerenderResumes();
  try {
    await chooseResume(id);
    resumes = await cachedResumes(); rerenderResumes(); void rescore();
    cvStatus('CV changed. Autofill will upload the selected CV.', 'success');
    await replaceUploadedCv();
  } catch { cvStatus('Could not switch CVs. Try again.', 'error'); }
  finally { switchingCv = false; rerenderResumes(); $(anchorId)?.focus(); }
}
async function replaceUploadedCv() {
  const tab = currentTab, chosen = resumes.chosen;
  if (!chosen || !lastApplication || lastApplication.url !== tab?.url || !lastApplication.resumeId || lastApplication.resumeId === chosen.id) return;
  let replaced = 0, kept = 0;
  try {
    const file = await pdfFor(chosen);
    for (const frameId of formFrames.length ? formFrames : [0]) {
      const reply = await askFrame(frameId, { type: 'replace-cv', dataUrl: file.dataUrl, fileName: file.fileName }, tab);
      replaced += reply?.replaced ?? 0; kept += reply?.kept ?? 0;
    }
  } catch (error) { cvStatus(`The form still has the old CV: ${error.message}`, 'error'); return; }
  if (replaced) {
    lastApplication.resumeId = chosen.id;
    await recordOnSavedJob(tab.url);
    cvStatus('CV updated on this form. It replaced the previous upload.', 'success');
  }
  if (kept) cvStatus(`This form keeps the old CV. Remove it in the form, then upload ${chosen.name} yourself.`, 'error');
}

// ─── Keyword match card ───────────────────────────────────────────────────
// On a job description page, scores how many of the posting's keywords each CV
// mentions (src/match.js). Keywords only: it does not judge experience depth.
function matchCard() {
  if (!match) return '<p class="resume-match-empty">Open a job description to see your CV’s keyword match.</p>';
  const { score, matched, missing } = match.chosen;
  const label = matchLabel(score), total = matched.length + missing.length;
  const circumference = 2 * Math.PI * 30;
  const coverage = circumference * .75 * score / 100;
  const expanded = keptOpen.has('keywords');
  const keywords = [...matched.map(name => `<li class="kw has">${icon('check', 13)}${esc(name)}</li>`), ...missing.map(name => `<li class="kw missing">${esc(name)}</li>`)].join('');
  return `<div class="resume-match" aria-label="Keyword match"><div class="resume-match-summary">
    <div class="resume-gauge" role="img" aria-label="Keyword match ${score}%"><svg viewBox="0 0 76 76" aria-hidden="true"><defs><linearGradient id="resume-gauge-colors" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="var(--color-accent-hover)"/><stop offset="50%" stop-color="var(--color-accent)"/><stop offset="100%" stop-color="var(--color-success)"/></linearGradient></defs><circle class="resume-gauge-track" cx="38" cy="38" r="30" stroke-dasharray="${circumference * .75} ${circumference * .25}" transform="rotate(135 38 38)"/><circle class="resume-gauge-value" cx="38" cy="38" r="30" stroke-dasharray="${coverage} ${circumference - coverage}" transform="rotate(135 38 38)" ${score ? '' : 'visibility="hidden"'}/></svg><span>${score}</span></div>
    <div class="resume-match-copy"><strong>${label} Resume Match</strong><button class="match-keyword-link" type="button" data-show-keywords aria-expanded="${expanded}" aria-controls="resume-keywords">Matches <b>${matched.length} out of ${total} keywords</b><span aria-hidden="true">→</span></button></div>
    </div><div id="resume-keywords" ${expanded ? '' : 'hidden'}><p class="hint">Keyword coverage only. Check the job requirements too.</p>
    ${match.better ? `<div class="better-cv"><strong>Better CV available</strong><p><span class="cv-inline" title="${esc(match.better.name)}">${esc(match.better.name)}</span> matches ${match.better.score} (${match.better.matched} of ${total} keywords).</p><button class="ghost" data-pick="${esc(match.better.id)}">Switch to this CV</button></div>` : ''}
    <div class="keywords"><p class="group">Keywords from the posting</p><ul>${keywords}</ul></div>
    </div><button class="tailor-button" id="improve-match" ${improving ? 'disabled' : ''}>${icon('edit', 18)}Tailor Resume</button>
    <div class="status" id="match-status" role="status"></div>
  </div>`;
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-show-keywords]');
  if (!button) return;
  const body = $('resume-keywords');
  const open = body.hidden;
  body.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
  if (open) keptOpen.add('keywords'); else keptOpen.delete('keywords');
});
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
        // Every CV's score, for the Resume tab's CV list.
        next = { chosen, better, scores: Object.fromEntries(scored.map(item => [item.id, item.score])) };
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
      const logo = jobLogo();
      const { job } = await sendCapture({ ...await captureTab(tab.id), ...(logo && { companyLogo: logo }) });
      savedJob = { url: tab.url, job, checkedAt: Date.now() };
      await chrome.tabs.create({ url: `${jobUrl(job.id)}?tailorFrom=${encodeURIComponent(chosen.id)}` });
      status('match-status', 'Saved. In the app, press "Tailor resume for this job" to improve your CV.', 'success');
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
  try { await signIn(); await pullProfile(); await loadDefaults(); await refresh(); void loadResumes(); void loadCareer(); status('auth-status', 'Signed in and profile synced.', 'success'); }
  catch (error) { status('auth-status', /redirect_uri|mismatch|400/i.test(error.message) ? 'Check the redirect URI in Sign-in setup below.' : error.message, 'error'); }
}
async function doPull() { status('auth-status', 'Syncing…'); try { await pullProfile(); await loadDefaults(); await refresh(); void loadResumes(); void loadCareer(); status('auth-status', 'Profile up to date.', 'success'); } catch (error) { status('auth-status', error.message, 'error'); } }
async function doSignOut() { await signOut(); await renderAccount(); status('auth-status', 'Signed out. Your local details and PDF remain on this device.'); }
async function renderSyncState() { const { sync } = await chrome.storage.local.get('sync'); $('sync-state').textContent = sync?.lastSyncedAt ? `Synced ${new Date(sync.lastSyncedAt).toLocaleString()}` : 'Never synced'; }
function selectTab(name) {
  closeCvMenu();
  for (const tab of document.querySelectorAll('.tab')) { const selected = tab.dataset.panel === name; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; }
  for (const panel of document.querySelectorAll('.panel')) panel.hidden = panel.id !== `panel-${name}`;
  document.querySelector('main').scrollTop = 0;
}
async function refresh() {
  if (!alive()) { showStale(); return; }
  const sequence = ++refreshId;
  if (!filling && $('fill')) $('fill').disabled = true;
  try {
    const stored = await chrome.storage.local.get(['profile', 'autofillGroups', 'diversityAnswers', 'continueSteps', 'autofillDefaults', 'eligibility', 'acknowledgeRequired', 'careerSource']); const nextResumes = await cachedResumes(); const tab = await ownTab(); const nextScan = await scanFrames(tab);
    if (sequence !== refreshId) return;
    if (fillReport && fillReport.url !== tab?.url) fillReport = null;
    if (currentTab?.url !== tab?.url || resumes.chosen?.id !== nextResumes.chosen?.id) cvStatus('');
    void checkSaved(tab?.url);
    fillGroups = stored.autofillGroups ?? {};
    profile = stored.profile || {}; resumes = nextResumes; currentTab = tab || null; scan = nextScan;
    diversityAnswers = stored.diversityAnswers ?? {};
    continueSteps = stored.continueSteps === true;
    legacyEligibility = stored.eligibility ?? {};
    careerSource = stored.careerSource ?? null;
    const cache = await cachedCareer();
    career = { profile: cache.profile ?? career.profile, resumes: { ...career.resumes, ...cache.resumes } };
    // A newly chosen CV: fetch its sections once, for the switch and Autofill.
    if (resumes.chosen && !career.resumes[resumes.chosen.id] && !careerLoading && !careerAsked.has(resumes.chosen.id)) { careerAsked.add(resumes.chosen.id); void loadCareer(); }
    useDefaults(stored.autofillDefaults);
    acknowledgeRequired = stored.acknowledgeRequired === true;
    if (!filling) renderAutofill(); renderProfileOverview(); renderResume();
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
$('reload').addEventListener('click', () => { $('settings-dialog').close(); void refresh(); });

$('sign-in').addEventListener('click', () => void doSignIn()); $('sign-out').addEventListener('click', () => void doSignOut()); $('pull-now').addEventListener('click', () => void doPull());
$('refresh-cvs').addEventListener('click', () => void loadResumes());
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
  const button = event.target.closest('[data-remove-default]'); if (!button) return;
  button.disabled = true;
  try { useDefaults(await removeDefaultById(button.dataset.removeDefault)); renderEligibilityAnswers(); }
  catch (error) { button.disabled = false; button.textContent = error instanceof NotSignedInError ? 'Sign in first' : 'Try again'; }
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
$('settings').addEventListener('click', async () => { try { const settings = await chrome.storage.local.get(['launcherEnabled', 'launcherDisabledHosts', 'autofillGroups', 'continueSteps', 'diversityAnswers', 'fillMarks', 'animateFill', 'acknowledgeRequired', 'autofillDefaults']); $('acknowledge-required').checked = settings.acknowledgeRequired === true; useDefaults(settings.autofillDefaults); renderEligibilityAnswers(); $('fill-marks').checked = settings.fillMarks !== false; $('animate-fill').checked = settings.animateFill !== false; $('continue-steps').checked = settings.continueSteps === true; diversityAnswers = settings.diversityAnswers ?? {}; $('launcher-enabled').checked = settings.launcherEnabled !== false; fillGroups = settings.autofillGroups ?? {}; renderFillGroups(); renderDisabledSites(Array.isArray(settings.launcherDisabledHosts) ? settings.launcherDisabledHosts : []); $('settings-dialog').showModal(); } catch { status('auth-status', 'Could not read extension settings.', 'error'); } });
$('launcher-enabled').addEventListener('change', async event => { const checkbox = event.target; checkbox.disabled = true; try { await chrome.storage.local.set({ launcherEnabled: checkbox.checked }); } catch { checkbox.checked = !checkbox.checked; } finally { checkbox.disabled = false; } });
for (const button of document.querySelectorAll('[data-close-dialog]')) button.addEventListener('click', () => button.closest('dialog').close());
$('report').addEventListener('click', () => { $('report-text').value = ['CV Autofill ' + chrome.runtime.getManifest().version, 'Site: ' + (scan?.host || 'Not detected'), 'Board: ' + (scan?.site || 'Not detected'), 'Detected fields: ' + (scan?.fields.map(f => f.key + ' (' + f.kind + ')').join(', ') || 'None'), 'Skipped demographic fields: ' + (scan?.skippedSensitive || 0)].join('\n'); status('report-status', ''); $('report-dialog').showModal(); });
$('copy-report').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('report-text').value); status('report-status', 'Copied. You can paste this into your feedback.', 'success'); } catch { $('report-text').select(); status('report-status', 'Select and copy the report manually.', 'error'); } });
$('close-panel').addEventListener('click', closePanel);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !document.querySelector('dialog[open]') && !cvMenu.open) closePanel(); });
chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'local') void refresh(); });
chrome.tabs.onUpdated.addListener((id, info) => { if (id === currentTab?.id && (info.status === 'complete' || info.url)) void refresh(); });
void refresh();
void loadResumes();
void loadDefaults();
void loadCareer();
