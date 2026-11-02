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

function scan() {
  lastScan = Fields.detectFields();

  // One entry per category: a form may repeat a field across steps.
  const unique = [...new Map(lastScan.found.map((f) => [f.key, f])).values()];

  const site = Sites.siteFor(location.hostname);
  const ruleCount = Object.keys(site?.byId ?? {}).length + Object.keys(site?.byName ?? {}).length;

  return {
    url: location.href,
    host: location.hostname,
    site: site?.name ?? null,
    ruleCount,
    context: {
      title: (document.querySelector('h1')?.innerText || document.title || 'Application form').trim().slice(0, 180),
      company: (document.querySelector('.company-name, [data-testid="company-name"]')?.textContent || '').trim().slice(0, 100),
    },
    fields: unique.map((field) => ({
      key: field.key,
      kind: field.kind,
      group: Fields.groupOf(field.key),
      source: field.source,
    })),
    skippedSensitive: lastScan.skipped.length,
  };
}

async function fill(profile) {
  scan(); // Forms can replace controls between the preview and a click.

  let filled = 0;
  const failures = [];

  for (const field of lastScan.found) {
    const value = field.key === 'resume' ? profile.resumeDataUrl : profile[field.key];
    if (!value) continue;

    try {
      if (await Filler.fillField(field, value, profile.resumeFileName)) filled++;
    } catch (err) {
      failures.push(`${field.key}: ${err.message}`);
    }
  }

  return { filled, failures, skippedSensitive: lastScan.skipped.length };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'scan') {
    sendResponse(scan());
    return false;
  }

  if (message.type === 'fill') {
    // Async reply: returning true keeps the message channel open.
    fill(message.profile).then(sendResponse);
    return true;
  }

  return false;
});

function updateLauncher() {
  const result = scan();
  const site = Boolean(result.site) || location.protocol === 'file:';
  const fields = lastScan.found.filter(field => field.key !== 'coverLetter' && !field.element.closest('form')?.querySelector('input[type="password"]'));
  const application = fields.some(field => field.key === 'resume') || fields.length >= 2;
  window.CVAutofillLauncher?.update(site && application);
}
let scanTimer;
const scheduleScan = () => { clearTimeout(scanTimer); scanTimer = setTimeout(updateLauncher, 140); };
const OWN_NODES = new Set(['adcv-autofill-launcher', 'adcv-autofill-panel']);
new MutationObserver(records => {
  const changed = records.some(record => {
    if (OWN_NODES.has(record.target.id)) return false;
    if (record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(node => OWN_NODES.has(node.id))) return false;
    return true;
  });
  if (changed) scheduleScan();
}).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'readonly', 'type', 'class', 'style'] });
addEventListener('resize', scheduleScan);
addEventListener('popstate', scheduleScan);
addEventListener('hashchange', scheduleScan);
updateLauncher();
