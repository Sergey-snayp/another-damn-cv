import { signIn, signOut, currentUser, pullProfile, redirectUri } from './auth.js';

/**
 * The side panel.
 *
 * It cannot touch the page, so every question about the form goes to the
 * content script by message. If that script is not there — an unsupported site —
 * the send fails, and that failure is what tells us to show "not supported".
 */

const FIELD_LABELS = {
  firstName: 'First name', lastName: 'Last name', middleName: 'Middle name',
  preferredName: 'Preferred name', fullName: 'Full name', email: 'Email',
  phone: 'Phone', pronouns: 'Pronouns',
  location: 'Location', city: 'City', state: 'State / province',
  country: 'Country', postalCode: 'Postal code', addressLine: 'Address',
  linkedin: 'LinkedIn', github: 'GitHub', portfolio: 'Portfolio',
  website: 'Website', twitter: 'Twitter / X',
  resume: 'Resume', coverLetter: 'Cover letter',
  currentCompany: 'Current company', currentTitle: 'Current title',
  yearsExperience: 'Years of experience',
  workAuthorization: 'Work authorization', requiresSponsorship: 'Needs sponsorship',
  salaryExpectation: 'Salary expectation', noticePeriod: 'Notice period',
};

/**
 * Mirrors the server's contact fields exactly.
 *
 * Anything not in this list is either not synced or not fillable, and showing
 * it here would imply otherwise.
 */
const PROFILE_GROUPS = [
  { title: 'Personal', keys: ['fullName', 'firstName', 'lastName', 'preferredName', 'email', 'phone'] },
  { title: 'Location', keys: ['location', 'city', 'state', 'country', 'postalCode'] },
  { title: 'Links', keys: ['linkedin', 'github', 'portfolio', 'website'] },
  { title: 'Eligibility', keys: ['workAuthorization', 'requiresSponsorship', 'salaryExpectation', 'noticePeriod'] },
];

/** Computed by the server from your experience list — shown, never edited. */
const DERIVED_KEYS = ['currentCompany', 'currentTitle', 'yearsExperience'];

const PROFILE_FIELDS = PROFILE_GROUPS.flatMap((group) => group.keys);

let profile = {};
let scan = null;

const $ = (id) => document.getElementById(id);

// --- talking to the page ------------------------------------------------------

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function askPage(message) {
  const tab = await activeTab();
  if (!tab?.id) return null;

  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    // No content script on this tab: the site is not one we support.
    return null;
  }
}

// --- autofill panel -----------------------------------------------------------

function valueFor(key) {
  if (key === 'resume') return profile.resumeFileName ?? '';
  if (key === 'coverLetter') return '';
  return profile[key] ?? '';
}

function renderAutofill() {
  const host = $('panel-autofill');

  if (!scan) {
    host.innerHTML = `
      <div class="notice">
        <span class="icon">!</span>
        <div>
          <strong>Autofill isn't supported on this site</strong>
          <span>Open an application on Greenhouse, Lever or Ashby.</span>
        </div>
      </div>`;
    return;
  }

  if (scan.fields.length === 0) {
    host.innerHTML = `
      <div class="notice">
        <span class="icon">!</span>
        <div>
          <strong>No form found yet</strong>
          <span>Open the application form, then press rescan.</span>
        </div>
      </div>`;
    return;
  }

  const ready = scan.fields.filter((f) => valueFor(f.key)).length;

  // Grouped the way the form itself groups them, so the panel reads like the
  // page it is describing.
  const byGroup = new Map();
  for (const field of scan.fields) {
    if (!byGroup.has(field.group)) byGroup.set(field.group, []);
    byGroup.get(field.group).push(field);
  }

  const rows = [...byGroup].map(([group, fields]) => {
    const items = fields.map((field) => {
      const value = valueFor(field.key);
      const right = value
        ? `<span class="val">${value}</span>`
        : '<span class="missing">no value</span>';
      // A dot marks a field matched by an exact site rule rather than guessed.
      const mark = field.source === 'site' ? '<span class="exact" title="matched by site rule">•</span>' : '';
      return `<li><span class="key">${mark}${FIELD_LABELS[field.key] ?? field.key}</span>${right}</li>`;
    }).join('');

    return `<p class="group">${group}</p><ul class="fields">${items}</ul>`;
  }).join('');

  // Says plainly when a site is running on the heuristic alone, so it is
  // obvious where adding rules would pay off.
  const siteNote = scan.site && scan.ruleCount === 0
    ? `<p class="hint" style="text-align:left">No site rules for <b>${scan.site}</b> yet — these were matched by labels alone. See sites.js to add exact ones.</p>`
    : '';

  const sensitive = scan.skippedSensitive > 0
    ? `<p class="hint" style="text-align:left">${scan.skippedSensitive} demographic question(s) left alone on purpose — those are voluntary, and a wrong guess is worse than a blank.</p>`
    : '';

  host.innerHTML = `
    <div class="card">
      <h2>Detected fields <span class="muted">${ready} of ${scan.fields.length} ready</span></h2>
      ${rows}
      ${siteNote}
      ${sensitive}
    </div>
    <button class="primary" id="fill">Autofill this form</button>
    <div class="status" id="fill-status"></div>
    <p class="hint">Nothing is submitted. Check every field before you apply.</p>`;

  $('fill').addEventListener('click', runFill);
}

async function runFill() {
  const status = $('fill-status');
  status.textContent = 'Filling…';

  const result = await askPage({ type: 'fill', profile });

  if (!result) {
    status.textContent = 'Lost contact with the page — reload it and try again.';
    return;
  }

  status.textContent = result.failures.length
    ? `Filled ${result.filled}. Failed: ${result.failures.join('; ')}`
    : `Filled ${result.filled} field${result.filled === 1 ? '' : 's'}.`;
}

// --- profile panel ------------------------------------------------------------

function renderProfile() {
  const editable = PROFILE_GROUPS.map((group) => `
    <p class="group">${group.title}</p>
    ${group.keys.map((key) => `
      <label class="field">
        <span>${FIELD_LABELS[key]}</span>
        <input type="text" name="${key}" value="${escapeAttr(profile[key])}">
      </label>`).join('')}`).join('');

  const derived = DERIVED_KEYS.some((key) => profile[key])
    ? `<p class="group">Current role <span class="muted">from your experience</span></p>
       ${DERIVED_KEYS.map((key) => `
         <label class="field">
           <span>${FIELD_LABELS[key]}</span>
           <input type="text" value="${escapeAttr(profile[key])}" disabled>
         </label>`).join('')}
       <p class="hint" style="text-align:left">Edit these in the web app by ticking
       <b>I work here now</b> on a role.</p>`
    : '';

  $('profile-form').innerHTML = editable + derived;
}

/** Values land inside an HTML attribute; a stray quote would break the form. */
function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

async function saveProfile() {
  for (const input of $('profile-form').elements) {
    // Derived inputs carry no name, so they cannot be written back here.
    if (input.name) profile[input.name] = input.value.trim();
  }

  await chrome.storage.local.set({ profile });
  $('profile-status').textContent = 'Saved.';
  renderAutofill();
}

// --- resume panel -------------------------------------------------------------

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function renderResume() {
  $('resume-state').textContent = profile.resumeFileName ?? 'none saved';
}

// --- account -----------------------------------------------------------------

async function renderAccount() {
  // Shown so it can be copied verbatim. Building it by hand from the extension
  // id is where the trailing slash usually goes missing.
  const uri = redirectUri();
  $('redirect-uri').textContent = uri;

  const user = await currentUser();

  $('signed-out').hidden = Boolean(user);
  $('signed-in').hidden = !user;

  if (user) {
    $('account-name').textContent = user.name;
    $('account-email').textContent = user.email;
    $('account-avatar').src = user.avatarUrl ?? '';
  }
}

async function doSignIn() {
  const status = $('auth-status');
  status.textContent = 'Opening Google…';

  try {
    const user = await signIn();
    status.textContent = `Signed in as ${user.email}.`;
    await pullProfile();
    await refresh();
  } catch (err) {
    // The redirect URI must be registered in Google Console, and the message
    // says so rather than leaving a bare OAuth error.
    // redirect_uri_mismatch is by far the most common failure here, and the
    // fix is always the same: register the URI shown below the button.
    status.textContent = /redirect_uri|mismatch|400/i.test(err.message)
      ? 'Google rejected the redirect URI. Open "Redirect URI for Google Console" below and register it.'
      : err.message;
  }
}

async function doPull() {
  const status = $('auth-status');
  status.textContent = 'Pulling…';

  try {
    await pullProfile();
    await refresh();
    status.textContent = 'Up to date.';
  } catch (err) {
    status.textContent = err.message;
  }
}

async function doSignOut() {
  await signOut();
  await renderAccount();
  $('auth-status').textContent = 'Signed out. Your details stay on this device.';
}

async function renderSyncState() {
  const { sync } = await chrome.storage.local.get('sync');
  const el = $('sync-state');
  if (!el) return;

  el.textContent = sync?.lastSyncedAt
    ? new Date(sync.lastSyncedAt).toLocaleString('en-CA')
    : 'never';
}

/**
 * The web app writes straight into storage via the bridge content script, so
 * the panel has to notice changes it did not make itself.
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.profile) profile = changes.profile.newValue ?? {};
  void refresh();
});

async function saveResume() {
  const file = $('resume-file').files?.[0];

  if (!file) {
    $('resume-status').textContent = 'Choose a PDF first.';
    return;
  }

  profile.resumeDataUrl = await readAsDataUrl(file);
  profile.resumeFileName = file.name;

  await chrome.storage.local.set({ profile });

  $('resume-status').textContent = 'Saved.';
  renderResume();
  renderAutofill();
}

// --- tabs ---------------------------------------------------------------------

function selectTab(name) {
  for (const tab of document.querySelectorAll('.tab')) {
    tab.setAttribute('aria-selected', String(tab.dataset.panel === name));
  }
  for (const panel of document.querySelectorAll('.panel')) {
    panel.hidden = panel.id !== `panel-${name}`;
  }
}

// --- boot ---------------------------------------------------------------------

async function refresh() {
  const stored = await chrome.storage.local.get('profile');
  profile = stored.profile ?? {};

  scan = await askPage({ type: 'scan' });

  renderAutofill();
  renderProfile();
  renderResume();
  void renderSyncState();
  void renderAccount();
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => selectTab(tab.dataset.panel));
});

$('reload').addEventListener('click', refresh);
$('sign-in').addEventListener('click', () => void doSignIn());
$('sign-out').addEventListener('click', () => void doSignOut());
$('pull-now').addEventListener('click', () => void doPull());
$('copy-redirect').addEventListener('click', async () => {
  await navigator.clipboard.writeText(redirectUri());
  $('copy-redirect').textContent = 'Copied';
  setTimeout(() => { $('copy-redirect').textContent = 'Copy'; }, 1500);
});
$('save-profile').addEventListener('click', saveProfile);
$('save-resume').addEventListener('click', saveResume);

// Following the user between job pages, so the panel is never stale.
chrome.tabs.onActivated.addListener(refresh);
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.status === 'complete') refresh();
});

void refresh();
