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

  // One entry per category: a form may repeat a field across steps.
  const unique = [...new Map(lastScan.found.map((f) => [f.key, f])).values()];

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

async function fill(profile, answers = []) {
  scan(); // Forms can replace controls between the preview and a click.
  const result = await Filler.fillAll(lastScan.found, profile);
  // Saved answers, matched by the panel to the ids from a "questions" request.
  let fromAnswers = 0;
  for (const item of answers) {
    const element = document.querySelector(`[data-adcv-field="${CSS.escape(String(item.id))}"]`);
    if (!element) continue;
    try { if ((await Filler.fillAnswer(element, item.kind, item.value)).filled) fromAnswers++; }
    catch (err) { result.failures.push(`${Fields.labelOf(element)}: ${err.message}`); }
  }
  result.filled += fromAnswers;
  result.fromAnswers = fromAnswers;
  return {
    ...result,
    skippedSensitive: lastScan.skipped.filter((item) => item.reason === 'sensitive').length,
    missing: Fields.findMissingRequired(Fields.detectFields().found),
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

/** A dashed outline and tooltip on an AI-drafted field, removed when the person edits it. */
function markDraft(element) {
  const before = { outline: element.style.outline, title: element.title };
  element.style.outline = '2px dashed #b8cc00';
  element.title = 'AI draft: review before submitting';
  element.addEventListener('input', () => { element.style.outline = before.outline; element.title = before.title; }, { once: true });
}

const fromPanel = (sender) => Boolean(sender.url?.startsWith(chrome.runtime.getURL('src/sidepanel.html')));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
    Filler.fillAnswer(element, message.kind, message.value).then((result) => {
      if (result.filled) markDraft(element);
      sendResponse(result);
    }, () => sendResponse({ filled: false }));
    return true;
  }
  if (message.type === 'check-required') {
    sendResponse({ missing: Fields.findMissingRequired(Fields.detectFields().found) });
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
let lastVerdict = null;
function updateLauncher() {
  if (!document.querySelector('input, textarea, select')) { window.CVAutofillLauncher?.update(false); return; }
  scan();
  // Teamtailor and other boards on company domains are known by page structure.
  const verdict = window.CVAutofillJobForm.assess(lastScan.found, { knownSite: KNOWN_BOARD || Boolean(Sites.siteForPage()) });
  if (verdict.show !== lastVerdict) { lastVerdict = verdict.show; window.CVAutofillLauncher?.update(verdict.show); }
}
let scanTimer;
const scheduleScan = () => { clearTimeout(scanTimer); scanTimer = setTimeout(updateLauncher, KNOWN_BOARD ? 140 : 600); };
const OWN_NODES = new Set(['adcv-autofill-launcher', 'adcv-autofill-panel']);
new MutationObserver(records => {
  const changed = records.some(record => {
    if (OWN_NODES.has(record.target.id)) return false;
    if (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(node => OWN_NODES.has(node.id))) return false;
    return true;
  });
  if (changed) scheduleScan();
}).observe(document.documentElement, {
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
