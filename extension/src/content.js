/**
 * No UI here — the side panel owns that.
 *
 * A side panel is a separate page with no access to the tab's DOM, so it asks
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
  if (lastScan.found.length === 0) scan();

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
