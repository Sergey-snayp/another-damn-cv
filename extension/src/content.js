/**
 * Detect application fields and expose the page-edge launcher.
 *
 * The panel is an extension frame with no access to the page's DOM, so it asks
 * this script to look at the form and to fill it. Everything below answers one
 * of those two questions.
 */

/**
 * Every file in a content-script bundle shares ONE top-level scope, so
 * destructuring `detectFields` here would redeclare the function fields.js
 * already defines and break the whole bundle. Keep the namespaces intact.
 */
const Fields = window.CVAutofillFields;
const Sites = window.CVAutofillSites;
const Filler = window.CVAutofillFiller;

/** Kept between messages so "fill" acts on exactly what "scan" reported. */
let lastScan = { found: [], skipped: [] };

/** The employer's name: a company element, the site name, or the domain ("careers.zexter.com" → "Zexter"). */
function companyName() {
  const named = document.querySelector('.company-name, [data-testid="company-name"]')?.textContent?.trim()
    || document.querySelector('meta[property="og:site_name"]')?.content?.trim();
  if (named) return named.slice(0, 100);
  const core = location.hostname.replace(/^(www|careers|jobs|apply|join)\./, '').split('.')[0] ?? '';
  return core ? core[0].toUpperCase() + core.slice(1) : '';
}

function scan() {
  lastScan = Fields.detectFields();

  // One entry per category (and country, for eligibility): a form may repeat a field across steps.
  const unique = [...new Map(lastScan.found.map((f) => [`${f.key}|${f.country ?? ''}`, f])).values()];

  const site = Sites.siteForPage();
  const ruleCount = Object.keys(site?.byId ?? {}).length + Object.keys(site?.byName ?? {}).length;

  return {
    url: location.href,
    host: location.hostname,
    site: site?.name ?? null,
    ruleCount,
    context: {
      title: (document.querySelector('h1')?.innerText || document.title || 'Application form').trim().slice(0, 180),
      company: companyName(),
    },
    fields: unique.map((field) => ({
      key: field.key,
      ...(field.country && { country: field.country }),
      kind: field.kind,
      group: Fields.groupOf(field.key),
      source: field.source,
    })),
    skippedSensitive: lastScan.skipped.filter((item) => item.reason === 'sensitive').length,
    consentCount: lastScan.skipped.filter((item) => item.reason === 'consent').length,
    // The job page has an Apply button that opens a form not loaded yet.
    canOpenForm: Boolean(Sites.formOpener()) && !lastScan.found.length,
  };
}

const Marks = window.CVAutofillMarks;

/** Fills saved answers by question id; returns how many, plus icons for them. */
async function fillAnswers(answers, failures, hooks = null) {
  let filled = 0;
  const marks = [];
  const ordered = answers
    .map((item) => ({ item, element: document.querySelector(`[data-adcv-field="${CSS.escape(String(item.id))}"]`) }))
    .filter((entry) => entry.element)
    .sort((a, b) => (a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  for (const { item, element } of ordered) {
    const field = { element, kind: item.kind };
    const token = await hooks?.before?.(field);
    let mark = null;
    try {
      const result = await Filler.fillAnswer(element, item.kind, item.value);
      if (result.filled) {
        filled++;
        mark = item.match === 'similar'
          ? { element: result.element ?? element, status: 'check', reason: `From your answer to "${item.savedQuestion ?? 'a similar question'}". Check it fits.` }
          : { element: result.element ?? element, status: 'ok', reason: 'From your saved answers' };
        marks.push(mark);
      }
    } catch (err) { failures.push(`${Fields.labelOf(element)}: ${err.message}`); }
    await hooks?.after?.(field, mark, token);
  }
  return { filled, marks };
}

/**
 * Required acknowledgements, when the person switched it on (Settings →
 * "Acknowledge required privacy notices"). Each gets a yellow icon: read it.
 */
async function fillAcknowledgements(found, hooks) {
  const marks = [];
  let filled = 0;
  for (const item of Fields.detectAcknowledgements(found)) {
    const field = { element: item.element, kind: item.kind };
    const token = await hooks?.before?.(field);
    let mark = null;
    try {
      const result = await Filler.fillAcknowledgement(item);
      if (result.filled) {
        filled++;
        mark = { element: result.element ?? item.element, status: 'check', reason: 'Acknowledged for you (Settings). Read it before submitting.' };
        marks.push(mark);
      }
    } catch { /* left for the person: it stays in the still-empty list */ }
    await hooks?.after?.(field, mark, token);
  }
  return { filled, marks };
}

async function fill(profile, answers = []) {
  scan(); // Forms can replace controls between the preview and a click.
  // Settings → "Animate filling": the page follows each field as it fills.
  const hooks = Marks?.fillHooks(await Marks.animationMode());
  const { marks, ...result } = await Filler.fillAll(lastScan.found, profile, hooks);
  // Saved answers, matched by the panel to the ids from a "questions" request.
  const fromAnswers = await fillAnswers(answers, result.failures, hooks);
  const acknowledged = profile.acknowledgeRequired ? await fillAcknowledgements(lastScan.found, hooks) : { filled: 0, marks: [] };
  result.filled += acknowledged.filled;
  if (acknowledged.filled) result.notes.push(`${acknowledged.filled} required acknowledgement${acknowledged.filled === 1 ? '' : 's'} ticked for you: read ${acknowledged.filled === 1 ? 'it' : 'them'} before submitting`);
  await hooks?.finish?.(lastScan.found);
  hooks?.end();
  result.filled += fromAnswers.filled;
  result.fromAnswers = fromAnswers.filled;
  rememberStep();
  const missing = Fields.findMissingRequired(Fields.detectFields().found);
  await Marks?.show([...marks, ...fromAnswers.marks, ...acknowledged.marks]);
  await Marks?.showMissing(missing);
  return {
    ...result,
    skippedSensitive: lastScan.skipped.filter((item) => item.reason === 'sensitive').length,
    missing,
  };
}

/** Scrolls to a field from the panel's "still empty" list and outlines it briefly. */
function focusField(id) {
  const element = document.querySelector(`[data-adcv-field="${CSS.escape(String(id))}"]`);
  if (!element) return false;
  element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const target = element.matches('input, select, textarea') && element.getClientRects().length ? element : element.closest('label') ?? element;
  target.focus?.({ preventScroll: true });
  const before = target.style.outline;
  target.style.outline = '3px solid #e6ff00';
  setTimeout(() => { target.style.outline = before; }, 1800);
  return true;
}

// ─── Next steps of a multi-step form ────────────────────────────────────
// Settings → "Keep filling the next steps" (off by default). After the person
// presses Autofill, the panel arms this tab in the background script for 30
// minutes on this site. Fields that appear later (the next step, or the next
// page) are filled from that same data. Fields already seen are never touched
// again, so anything the person cleared or changed stays as they left it.
const seenFields = new WeakSet(), seenQuestions = new Set();
let stepsArmed = false, stepBusy = false, stepTimer;

function rememberStep() {
  for (const field of Fields.detectFields().found) seenFields.add(field.element);
  for (const question of Fields.detectQuestions()) seenQuestions.add(question.id);
}

function isBlank(field) {
  const element = field.element;
  if (field.kind === 'drop') return !Fields.zoneDone(element);
  if (field.kind === 'file') return !element.files?.length;
  if (field.kind === 'radio') return !document.querySelector(`input[type="radio"][name="${CSS.escape(element.name)}"]:checked`);
  if (field.kind === 'checkbox') return !element.checked;
  return Fields.isEmpty(element);
}

function scheduleStep() {
  if (!stepsArmed) return;
  clearTimeout(stepTimer);
  stepTimer = setTimeout(() => void fillNextStep(), 900);
}

async function fillNextStep() {
  if (stepBusy || !chrome.runtime?.id) return;
  const found = Fields.detectFields().found.filter((field) => !seenFields.has(field.element));
  const questions = Fields.detectQuestions().filter((question) => !seenQuestions.has(question.id) && !question.value);
  found.forEach((field) => seenFields.add(field.element));
  questions.forEach((question) => seenQuestions.add(question.id));
  const fresh = found.filter(isBlank);
  if (!fresh.length && !questions.length) return;
  stepBusy = true;
  try {
    const reply = await chrome.runtime.sendMessage({ type: 'step-request', questions });
    if (!reply?.armed) { stepsArmed = false; return; }
    const hooks = Marks?.fillHooks(await Marks.animationMode());
    const { marks, ...result } = await Filler.fillAll(fresh, reply.profile, hooks);
    const fromAnswers = await fillAnswers(reply.answers ?? [], result.failures, hooks);
    if (reply.profile?.acknowledgeRequired) result.filled += (await fillAcknowledgements(fresh, hooks)).filled;
    await hooks?.finish?.(fresh);
    hooks?.end();
    result.filled += fromAnswers.filled;
    await Marks?.show([...marks, ...fromAnswers.marks]);
    await Marks?.showMissing(Fields.findMissingRequired(Fields.detectFields().found));
    if (result.filled) void chrome.runtime.sendMessage({ type: 'step-filled', filled: result.filled, notes: result.notes }).catch(() => {});
  } catch { /* extension reloaded or background unavailable: leave the step for the person */ }
  finally { stepBusy = false; }
}

const fromPanel = (sender) => Boolean(sender.url?.startsWith(chrome.runtime.getURL('src/sidepanel.html')));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // The background script, after the panel armed this tab for next steps.
  if (message.type === 'steps-armed' && sender.id === chrome.runtime.id && !sender.tab) {
    stepsArmed = true;
    return false;
  }
  if (message.type === 'scan') {
    sendResponse(scan());
    return false;
  }

  // Filling happens only when the person presses "Autofill This Page" in the
  // panel. Nothing else may ask for it: not page loads, scans or the launcher.
  if (message.type === 'fill') {
    if (!fromPanel(sender)) return false;
    // Async reply: returning true keeps the message channel open.
    fill(message.profile, message.answers).then(sendResponse);
    return true;
  }

  if (!fromPanel(sender)) return false;
  if (message.type === 'questions') {
    sendResponse({ questions: Fields.detectQuestions(Fields.detectFields().found) });
    return false;
  }
  if (message.type === 'fill-draft') {
    // An AI draft the person asked for with "Draft with AI". Marked until they edit it.
    const element = document.querySelector(`[data-adcv-field="${CSS.escape(String(message.id))}"]`);
    if (!element) { sendResponse({ filled: false }); return false; }
    void (async () => {
      const hooks = Marks?.fillHooks(await Marks.animationMode());
      const field = { element, kind: message.kind };
      const token = await hooks?.before?.(field);
      const result = await Filler.fillAnswer(element, message.kind, message.value).catch(() => ({ filled: false }));
      const mark = result.filled ? { element: result.element ?? element, status: 'check', reason: 'AI draft: review it before submitting' } : null;
      await hooks?.after?.(field, mark, token);
      hooks?.end();
      if (mark) await Marks?.show([mark]);
      sendResponse({ filled: result.filled });
    })();
    return true;
  }
  if (message.type === 'check-required') {
    const missing = Fields.findMissingRequired(Fields.detectFields().found);
    void Marks?.showMissing(missing);
    sendResponse({ missing });
    return false;
  }
  if (message.type === 'focus-field') {
    sendResponse({ ok: focusField(message.id) });
    return false;
  }
  if (message.type === 'open-form') {
    // Only when the person presses "Open application form" in the panel.
    const opener = Sites.formOpener();
    opener?.click();
    sendResponse({ ok: Boolean(opener) });
    return false;
  }
  return false;
});

// The D! button appears only on pages that look like a job application form
// (src/job-form.js). This script runs on every site, so it stays cheap: pages
// without inputs are skipped, and ordinary sites rescan less often.
const KNOWN_BOARD = Boolean(Sites.siteFor(location.hostname)) || location.protocol === 'file:';

// This script also runs in iframes, where an embedded application form may
// live (a Greenhouse form on a company's careers page). Tiny frames (ads,
// trackers) are left alone. A frame with a form tells the top page, which
// shows the one D! button for the tab.
const IS_TOP = window === window.top;
const TINY_FRAME = !IS_TOP && (innerWidth < 250 || innerHeight < 150);
const framesWithForms = new Set();
let frameVerdict = null;
function showLauncher(ownForm) {
  if (IS_TOP) { window.CVAutofillLauncher?.update(ownForm || framesWithForms.size > 0); return; }
  if (ownForm === frameVerdict) return;
  frameVerdict = ownForm;
  window.top.postMessage({ adcvFrameForm: ownForm }, '*');
}
if (IS_TOP) {
  // Only shows or hides the button; a page faking this message gains nothing else.
  addEventListener('message', (event) => {
    if (typeof event.data?.adcvFrameForm !== 'boolean' || event.source === window) return;
    if (event.data.adcvFrameForm) framesWithForms.add(event.source); else framesWithForms.delete(event.source);
    showLauncher(lastOwnForm);
  });
}
let lastOwnForm = false;
function updateLauncher() {
  if (TINY_FRAME) return;
  scheduleStep();
  if (!document.querySelector('input, textarea, select')) { lastOwnForm = false; showLauncher(false); return; }
  scan();
  // Teamtailor and other boards on company domains are known by page structure.
  const verdict = window.CVAutofillJobForm.assess(lastScan.found, { knownSite: KNOWN_BOARD || Boolean(Sites.siteForPage()) });
  // Always passed on: update() also puts the button back if the page removed it.
  lastOwnForm = verdict.show;
  showLauncher(verdict.show);
}

/**
 * React and Remix pages (Greenhouse's job boards) can throw away the whole
 * <html> element while starting up, taking the D! button, panel and icons with
 * it. After any change, each puts itself back if it should be on the page.
 */
function reattachOwnElements() {
  window.CVAutofillLauncher?.reattach?.();
  window.CVAutofillPanel?.reattach?.();
  window.CVAutofillMarks?.reattach?.();
}
let scanTimer;
const scheduleScan = () => { clearTimeout(scanTimer); scanTimer = setTimeout(updateLauncher, KNOWN_BOARD ? 140 : 600); };
const OWN_NODES = new Set(['adcv-autofill-launcher', 'adcv-autofill-panel', 'adcv-fill-marks']);
const pageWatcher = new MutationObserver(records => {
  reattachOwnElements();
  const changed = records.some(record => {
    if (OWN_NODES.has(record.target.id)) return false;
    if (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(node => OWN_NODES.has(node.id))) return false;
    return true;
  });
  if (changed) scheduleScan();
});
// The document, not <html>: a page that replaces its <html> element would
// otherwise leave this watching a detached copy. Tiny frames are not watched.
if (!TINY_FRAME) pageWatcher.observe(document, {
  childList: true,
  subtree: true,
  attributes: true,
  // class/style change constantly on busy sites; job boards need them to spot step changes.
  attributeFilter: KNOWN_BOARD ? ['hidden', 'disabled', 'readonly', 'type', 'class', 'style'] : ['hidden', 'disabled', 'type'],
});
addEventListener('resize', scheduleScan);
addEventListener('popstate', scheduleScan);
addEventListener('hashchange', scheduleScan);
updateLauncher();

// A new page of an armed multi-step form fills once its fields are on screen.
try {
  chrome.runtime.sendMessage({ type: 'steps-state' }).then((state) => { if (state?.armed) { stepsArmed = true; scheduleStep(); } }).catch(() => {});
} catch { /* extension reloaded */ }
