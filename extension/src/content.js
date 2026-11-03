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



// ─── Why a required field is still empty ───────────────────────────────
// Each red icon (and the panel's "Still empty" list) says why Autofill did not
// fill the field and what fixes it. The context is the last fill: its profile
// values, the groups switched off, and the reasons fields failed.
let lastFill = { profile: {}, failed: new Map() };

function explain(element) {
  const { profile, failed } = lastFill;
  if (failed.has(element)) return failed.get(element);
  const field = lastScan.found.find((item) => item.element === element || (element.type === 'radio' && item.element.name === element.name && item.element.type === 'radio'));
  const label = Fields.labelOf(element).replace(/\?$/, '');
  if (field) {
    const off = profile.offKeys?.[field.key];
    if (off) return `Off in Settings → Fields to fill (${off}).`;
    if (field.diversity) return 'Diversity questions are off in Settings → Fields to fill.';
    if ((field.key === 'requiresSponsorship' || field.key === 'workAuthorization') && field.country) {
      return `Answer once in the panel: ${field.key === 'requiresSponsorship' ? 'sponsorship' : 'work authorization'} for ${field.country}.`;
    }
    if (field.key === 'resume') return profile.resumeDataUrl ? 'Your CV upload did not finish. Try Autofill again or upload it yourself.' : 'No CV chosen. Choose one in the Resume tab.';
    if (field.key === 'workedHereBefore') return 'Could not tell from your CV. Answer it yourself.';
    if (field.kind === 'select' || field.kind === 'radio' || field.kind === 'combobox') return `None of the options matched your profile answer for "${label}". Choose one yourself.`;
    return `Your profile has no value for "${label}". Add it in the app's Profile.`;
  }
  const kind = Fields.leftAlone(element);
  if (kind === 'never') return 'A personal question Autofill never answers.';
  if (kind === 'consent') {
    return profile.acknowledgeRequired
      ? 'Not a routine acknowledgement, so it is left for you. Read it and choose.'
      : 'Consent is yours to give. Choose it, or switch on Settings → Acknowledge required privacy notices.';
  }
  if (Fields.detectQuestions().some((question) => question.id === element.dataset.adcvField)) {
    return 'The company\'s own question. Answer it, then use "Save answers from this form", or "Draft with AI" in the panel.';
  }
  return 'Autofill did not recognise this field. Fill it yourself.';
}

/** Required fields still empty, each with why. */
function missingWithReasons() {
  return Fields.findMissingRequired(Fields.detectFields().found).map((item) => {
    const element = document.querySelector(`[data-adcv-field="${CSS.escape(String(item.id))}"]`);
    return { ...item, reason: element ? explain(element) : 'Required, still empty.' };
  });
}


const byTag = (id) => document.querySelector(`[data-adcv-field="${CSS.escape(String(id))}"]`);
const stopOrder = (a, b) => (a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);

/**
 * One pass down the form, in page order. Each stop gets its icon the moment
 * it is done: profile fields, saved answers and (when switched on) required
 * acknowledgements are filled; other required fields still empty get a red
 * icon saying why. `explainIf` limits which empty fields are explained (a
 * later step explains only its new fields).
 */
async function runPass({ found, profile, answers = [], hooks, explainIf = () => true }) {
  const result = { filled: 0, fromAnswers: 0, acknowledged: 0, failures: [], notes: [] };
  const stops = [], covered = new Set(), groups = new Set(), state = {};
  const cover = (element) => { covered.add(element); if (element.type === 'radio' && element.name) groups.add(element.name); };
  const isCovered = (element) => covered.has(element) || (element.type === 'radio' && groups.has(element.name));
  for (const field of found) if (Filler.valueFor(field, profile)) stops.push({ kind: 'field', element: field.element, field });
  stops.forEach((stop) => cover(stop.element));
  for (const item of answers) {
    const element = byTag(item.id);
    if (element && !isCovered(element)) { stops.push({ kind: 'answer', element, item }); cover(element); }
  }
  if (profile.acknowledgeRequired) {
    for (const ack of Fields.detectAcknowledgements(found)) if (!isCovered(ack.element)) { stops.push({ kind: 'ack', element: ack.element, ack }); cover(ack.element); }
  }
  for (const item of Fields.findMissingRequired(found)) {
    const element = byTag(item.id);
    if (element && !isCovered(element) && explainIf(element)) { stops.push({ kind: 'explain', element }); cover(element); }
  }
  stops.sort(stopOrder);

  for (const stop of stops) {
    if (stop.kind === 'explain' && !Fields.isEmpty(stop.element)) continue;
    const field = stop.field ?? { element: stop.element, kind: stop.item?.kind ?? stop.ack?.kind };
    const token = await hooks?.before?.(field);
    let mark = null;
    try {
      if (stop.kind === 'field') {
        const done = await Filler.fillOne(stop.field, profile, state);
        if (done.filled) result.filled++;
        if (done.note) result.notes.push(done.note);
        if (done.failure) result.failures.push(done.failure);
        mark = done.mark;
        if (mark?.status === 'missing') lastFill.failed.set(mark.element, mark.reason);
      } else if (stop.kind === 'answer') {
        const done = await Filler.fillAnswer(stop.element, stop.item.kind, stop.item.value);
        if (done.filled) {
          result.filled++; result.fromAnswers++;
          mark = stop.item.match === 'similar'
            ? { element: done.element ?? stop.element, status: 'check', reason: `From your answer to "${stop.item.savedQuestion ?? 'a similar question'}". Check it fits.` }
            : { element: done.element ?? stop.element, status: 'ok', reason: 'From your saved answers' };
        }
      } else if (stop.kind === 'ack') {
        const done = await Filler.fillAcknowledgement(stop.ack);
        if (done.filled) {
          result.filled++; result.acknowledged++;
          mark = { element: done.element ?? stop.element, status: 'check', reason: 'Acknowledged for you (Settings). Read it before submitting.' };
        }
      } else {
        mark = { element: stop.element, status: 'missing', reason: explain(stop.element) };
      }
    } catch (err) {
      result.failures.push(`${Fields.labelOf(stop.element)}: ${err.message}`);
    }
    await hooks?.after?.(field, mark, token);
  }
  if (result.acknowledged) result.notes.push(`${result.acknowledged} required acknowledgement${result.acknowledged === 1 ? '' : 's'} ticked for you: read ${result.acknowledged === 1 ? 'it' : 'them'} before submitting`);
  return result;
}

async function fill(profile, answers = []) {
  scan(); // Forms can replace controls between the preview and a click.
  lastFill = { profile, failed: new Map() };
  // Settings → "Animate filling": the page follows each field as it fills. Icons appear as each field is done either way.
  const hooks = Marks?.fillHooks(await Marks.animationMode());
  const result = await runPass({ found: lastScan.found, profile, answers, hooks });
  await hooks?.finish?.(lastScan.found);
  hooks?.end();
  rememberStep();
  // A last check for anything the pass could not reach (fields that appeared meanwhile).
  const missing = missingWithReasons();
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
  // Once the scroll settles, show why it is empty beside it.
  setTimeout(() => Marks?.point(element), 450);
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
  // Only this step's new fields are explained, so the page never jumps back up to earlier ones.
  const isNew = new Set([...found.map((field) => field.element), ...questions.map((question) => byTag(question.id))]);
  stepBusy = true;
  try {
    const reply = await chrome.runtime.sendMessage({ type: 'step-request', questions });
    if (!reply?.armed) { stepsArmed = false; return; }
    const hooks = Marks?.fillHooks(await Marks.animationMode());
    lastFill = { profile: reply.profile, failed: lastFill.failed };
    const result = await runPass({ found: fresh, profile: reply.profile, answers: reply.answers ?? [], hooks, explainIf: (element) => isNew.has(element) });
    await hooks?.finish?.(fresh);
    hooks?.end();
    await Marks?.showMissing(missingWithReasons());
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
    const missing = missingWithReasons();
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
