import { signIn, signOut, currentUser, pullProfile, redirectUri } from './auth.js';
import { captureTab, jobUrl, NotSignedInError, requestSiteAccess, sendCapture, unsendableReason, APP_URL } from './jobs.js';
import { icon, escapeHtml as esc } from './icons.js';
import { cachedResumes, chooseResume, cvUrl, fetchResumes, fileNameFor, hasFreshPdf, pdfFor } from './resumes.js';

const FIELD_LABELS = {
  firstName: 'First name', lastName: 'Last name', middleName: 'Middle name', preferredName: 'Preferred name', fullName: 'Full name', email: 'Email', phone: 'Phone', pronouns: 'Pronouns', location: 'Location', city: 'City', state: 'State / province', country: 'Country', postalCode: 'Postal code', addressLine: 'Address', linkedin: 'LinkedIn', github: 'GitHub', portfolio: 'Portfolio', website: 'Website', twitter: 'Twitter / X', resume: 'Resume', coverLetter: 'Cover letter', currentCompany: 'Current company', currentTitle: 'Current title', yearsExperience: 'Years of experience', school: 'School', degree: 'Degree', fieldOfStudy: 'Field of study', graduationYear: 'Graduation year', workAuthorization: 'Work authorization', requiresSponsorship: 'Needs sponsorship', salaryExpectation: 'Salary expectation', noticePeriod: 'Notice period',
};
const PROFILE_GROUPS = [
  { title: 'Personal', keys: ['fullName', 'firstName', 'lastName', 'preferredName', 'email', 'phone'] },
  { title: 'Location', keys: ['location', 'city', 'state', 'country', 'postalCode'] },
  { title: 'Links', keys: ['linkedin', 'github', 'portfolio', 'website'] },
  { title: 'Eligibility', keys: ['workAuthorization', 'requiresSponsorship', 'salaryExpectation', 'noticePeriod'] },
];
const DERIVED_KEYS = ['currentCompany', 'currentTitle', 'yearsExperience'];
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
let resumes = { items: [], chosen: null }, resumeProblem = '', loadingResumes = false, preparingPdf = false, switcherOpen = false, pageDisconnected = false;
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
function valueFor(key) { if (key === 'resume') return resumes.chosen ? fileNameFor(resumes.chosen) : ''; if (key === 'coverLetter') return ''; return profile[key] ?? ''; }
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
    host.innerHTML = `${pageCard()}<div class="notice">${icon('file')}<div><strong>${scan ? 'No application fields found yet' : 'Autofill is not available on this page'}</strong><p>${scan ? 'Open the application form, then rescan the page.' : 'Open a supported application form to use Autofill. You can still use your Profile and Resume here.'}</p><button class="ghost" id="rescan-empty">${icon('refresh')}Rescan page</button></div></div>`;
    $('rescan-empty').addEventListener('click', refresh);
    return;
  }
  const ready = scan.fields.filter(field => valueFor(field.key)).length;
  const groups = new Map();
  for (const field of scan.fields) { if (!groups.has(field.group)) groups.set(field.group, []); groups.get(field.group).push(field); }
  const rows = [...groups].map(([group, fields]) => `<p class="group">${esc(group)}</p><ul class="fields">${fields.map(field => `<li><span class="key">${esc(FIELD_LABELS[field.key] || field.key)}</span>${valueFor(field.key) ? `<span class="val">${esc(valueFor(field.key))}</span>` : '<span class="missing">Add a value</span>'}</li>`).join('')}</ul>`).join('');
  host.innerHTML = `${pageCard()}
    <div class="fill-block"><button class="primary fill-action" id="fill" ${ready ? '' : 'disabled'}>${icon('bolt', 23)}Autofill This Page</button><div class="status" id="fill-status" role="status"></div><p class="hint">${ready} of ${scan.fields.length} detected fields have a value. Review before submitting.</p>${!ready ? '<button class="ghost" id="add-details">Add your profile details</button>' : ''}</div>
    ${resumeCard()}
    <details class="card"><summary>${icon('check')}Fields to fill<span class="summary-count">${ready}/${scan.fields.length}</span></summary>${rows}${scan.skippedSensitive ? `<p class="hint">${scan.skippedSensitive} demographic question(s) will stay untouched.</p>` : ''}</details>`;
  $('fill').addEventListener('click', runFill);
  $('choose-resume').addEventListener('click', () => selectTab('resume'));
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
    if (resumes.chosen && scan?.fields.some(field => field.key === 'resume')) {
      try {
        try { resumes = await fetchResumes(); } catch { /* use the cached list */ }
        if (!(await hasFreshPdf(resumes.chosen))) status('fill-status', 'Making a PDF of your CV…');
        file = await pdfFor(resumes.chosen);
      } catch (error) { cvProblem = `CV not attached: ${error.message}`; }
      status('fill-status', 'Filling…');
    }
    const result = await askPage({ type: 'fill', profile: { ...profile, resumeDataUrl: file?.dataUrl, resumeFileName: file?.fileName } }, target);
    if (cvProblem && result) result.failures.push(cvProblem);
    if (!result) throw new Error(pageDisconnected ? 'The extension was updated. Reload this page, then try again.' : 'Lost contact with the page. Reload it and try again.');
    status('fill-status', result.failures.length ? `Filled ${result.filled}. Could not fill: ${result.failures.join('; ')}` : `Filled ${result.filled} field${result.filled === 1 ? '' : 's'}. Review the form before submitting.`, result.failures.length ? 'error' : 'success');
  } catch (error) { status('fill-status', error.message, 'error'); }
  finally { filling = false; if (button.isConnected) button.disabled = false; }
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
  const links = ['linkedin', 'github', 'portfolio', 'website'].filter(key => profile[key]);
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
function resumeRows({ compact = false } = {}) {
  return resumes.items.map(item => {
    const chosen = item.id === resumes.chosen?.id;
    return `<li class="resume-row${chosen ? ' is-active' : ''}"><button class="resume-pick" data-pick="${esc(item.id)}" aria-pressed="${chosen}"><span class="radio" aria-hidden="true"></span><span class="resume-meta"><strong>${esc(item.name)}</strong><small>${esc(cvDetails(item))}</small></span>${item.isPrimary ? '<span class="badge">Primary</span>' : ''}</button>${compact ? '' : `<button class="icon-button" data-open-cv="${esc(item.id)}" title="Open in app" aria-label="Open ${esc(item.name)} in the app">${icon('link', 18)}</button>`}</li>`;
  }).join('');
}
function resumeEmpty() {
  if (resumeProblem === 'signed-out') return `<div class="resume-empty"><p>Sign in to see the CVs from your app.</p><button class="ghost" data-go-sign-in>Sign in on the Profile tab</button></div>`;
  if (resumeProblem) return `<div class="resume-empty"><p>${esc(resumeProblem)}</p><button class="ghost" data-refresh-cvs>${icon('refresh', 17)}Try again</button></div>`;
  if (loadingResumes) return '<div class="resume-empty"><p>Loading your CVs…</p></div>';
  return `<div class="resume-empty"><p>No CVs in Documents yet.</p><button class="ghost" data-open-documents>Open Documents</button></div>`;
}
function resumeCard() {
  const chosen = resumes.chosen;
  if (!chosen) return `<details class="card" open><summary>${icon('file')}Resume</summary>${resumeEmpty()}</details>`;
  const many = resumes.items.length > 1;
  const note = preparingPdf ? 'Making the PDF…' : 'Autofill uploads this CV';
  return `<details class="card" open><summary>${icon('file')}Resume</summary>
    <div class="document-selection resume-current"><button class="resume-switch" id="resume-switch" ${many ? `aria-expanded="${switcherOpen}" aria-controls="resume-switch-list"` : 'disabled'} title="${many ? 'Switch CV' : 'Add more CVs in the app to switch'}"><span><strong>${esc(chosen.name)}</strong><small>${note}</small></span>${many ? icon('chevron', 17) : ''}</button><button class="icon-button" data-open-cv="${esc(chosen.id)}" title="Open in app" aria-label="Open ${esc(chosen.name)} in the app">${icon('link', 18)}</button></div>
    ${many && switcherOpen ? `<ul class="resume-list" id="resume-switch-list" aria-label="Switch CV">${resumeRows({ compact: true })}</ul>` : ''}
    <button class="ghost" id="choose-resume">All CVs${icon('chevron', 17)}</button></details>`;
}
function renderResume() {
  $('resume-list').innerHTML = resumes.items.length ? resumeRows() : `<li>${resumeEmpty()}</li>`;
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
  const target = event.target.closest('[data-pick],[data-open-cv],[data-refresh-cvs],[data-go-sign-in],[data-open-documents],#resume-switch');
  if (!target) return;
  if (target.id === 'resume-switch') { switcherOpen = !switcherOpen; renderAutofill(); $('resume-switch')?.focus(); return; }
  if (target.dataset.openCv) { void chrome.tabs.create({ url: cvUrl(target.dataset.openCv) }); return; }
  if ('refreshCvs' in target.dataset) { void loadResumes(); return; }
  if ('openDocuments' in target.dataset) { void openApp('/documents'); return; }
  if ('goSignIn' in target.dataset) { selectTab('profile'); document.querySelector('.account-card').open = true; return; }
  void (async () => {
    try {
      switcherOpen = false;
      await chooseResume(target.dataset.pick);
      resumes = await cachedResumes(); rerenderResumes();
      await preparePdf();
    } catch { status('resume-status', 'Could not switch CVs. Try again.', 'error'); }
  })();
});

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
    const stored = await chrome.storage.local.get('profile'); const nextResumes = await cachedResumes(); const tab = await ownTab(); const nextScan = await askPage({ type: 'scan' }, tab);
    if (sequence !== refreshId) return;
    if (tab?.url !== currentTab?.url && !sending) $('send-status').textContent = '';
    profile = stored.profile || {}; resumes = nextResumes; currentTab = tab || null; scan = nextScan;
    renderSendButton(); if (!filling) renderAutofill(); renderProfileOverview(); renderProfileForm(); renderResume();
    await Promise.all([renderSyncState(), renderAccount()]);
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
$('settings').addEventListener('click', async () => { try { const settings = await chrome.storage.local.get(['launcherEnabled', 'launcherDisabledHosts']); $('launcher-enabled').checked = settings.launcherEnabled !== false; renderDisabledSites(Array.isArray(settings.launcherDisabledHosts) ? settings.launcherDisabledHosts : []); $('settings-dialog').showModal(); } catch { status('auth-status', 'Could not read extension settings.', 'error'); } });
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
