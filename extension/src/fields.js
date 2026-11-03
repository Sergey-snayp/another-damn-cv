/**
 * Field detection.
 *
 * Every ATS names its inputs differently, so rather than per-site selectors we
 * gather every label-ish signal an input carries and match it against synonyms.
 * One heuristic covers most forms; per-site rules would only be needed for the
 * awkward ones.
 *
 * Categories follow the groups a real application form uses: Personal, Location,
 * Social, Documents, Experience, Education, Work Authorization, Compensation.
 */

/**
 * Order matters only for readability; `specificity` decides matching.
 *
 * A bare "name" must never beat "first name", and "city" must not swallow
 * "city of birth". Longer, more specific phrases win.
 */
const CATEGORIES = [
  // --- personal -------------------------------------------------------------
  { key: 'firstName', group: 'Personal', match: ['first name', 'firstname', 'given name', 'forename', 'fname'] },
  { key: 'lastName', group: 'Personal', match: ['last name', 'lastname', 'family name', 'surname', 'lname'] },
  { key: 'middleName', group: 'Personal', match: ['middle name', 'middlename', 'middle initial'] },
  { key: 'preferredName', group: 'Personal', match: ['preferred name', 'nickname', 'goes by'] },
  { key: 'fullName', group: 'Personal', match: ['full name', 'your name', 'candidate name', 'legal name', 'name'] },
  { key: 'email', group: 'Personal', match: ['email', 'e-mail', 'email address'] },
  { key: 'phone', group: 'Personal', match: ['phone', 'mobile', 'telephone', 'cell', 'contact number'] },
  { key: 'pronouns', group: 'Personal', match: ['pronouns'] },

  // --- location -------------------------------------------------------------
  { key: 'location', group: 'Location', match: ['location', 'current location', 'where are you based', 'where do you live'] },
  { key: 'city', group: 'Location', match: ['city', 'town'] },
  { key: 'state', group: 'Location', match: ['state', 'province', 'region', 'state/province'] },
  { key: 'country', group: 'Location', match: ['country'] },
  { key: 'postalCode', group: 'Location', match: ['postal code', 'postcode', 'zip', 'zip code'] },
  { key: 'addressLine', group: 'Location', match: ['street address', 'address line', 'address'] },

  // --- social & links -------------------------------------------------------
  { key: 'linkedin', group: 'Social', match: ['linkedin', 'linked in'] },
  { key: 'github', group: 'Social', match: ['github', 'git hub'] },
  { key: 'portfolio', group: 'Social', match: ['portfolio'] },
  { key: 'website', group: 'Social', match: ['website', 'personal site', 'personal website', 'blog', 'url'] },
  { key: 'twitter', group: 'Social', match: ['twitter', 'x profile'] },

  // --- documents ------------------------------------------------------------
  { key: 'resume', group: 'Documents', match: ['resume', 'cv', 'upload resume', 'attach resume', 'resume/cv'] },
  { key: 'coverLetter', group: 'Documents', match: ['cover letter', 'coverletter', 'letter of interest'] },

  // --- experience -----------------------------------------------------------
  { key: 'currentCompany', group: 'Experience', match: ['current company', 'current employer', 'company', 'employer'] },
  { key: 'currentTitle', group: 'Experience', match: ['current title', 'job title', 'current role', 'title'] },
  { key: 'yearsExperience', group: 'Experience', match: ['years of experience', 'years experience', 'total experience'] },

  // --- education ------------------------------------------------------------
  { key: 'school', group: 'Education', match: ['school', 'university', 'college', 'institution'] },
  { key: 'degree', group: 'Education', match: ['degree', 'qualification'] },
  { key: 'fieldOfStudy', group: 'Education', match: ['field of study', 'major', 'discipline'] },
  { key: 'graduationYear', group: 'Education', match: ['graduation year', 'year of graduation', 'grad year'] },

  // --- work authorization ---------------------------------------------------
  { key: 'workAuthorization', group: 'Work Authorization', match: ['work authorization', 'authorized to work', 'legally authorized', 'right to work'] },
  { key: 'requiresSponsorship', group: 'Work Authorization', match: ['sponsorship', 'require sponsorship', 'visa sponsorship'] },

  // --- compensation & availability -----------------------------------------
  { key: 'salaryExpectation', group: 'Compensation', match: ['salary expectation', 'expected salary', 'desired salary', 'compensation expectation'] },
  { key: 'noticePeriod', group: 'Compensation', match: ['notice period', 'availability', 'start date', 'when can you start'] },
];

/**
 * Never guessed at.
 *
 * Demographic questions are voluntary and legally sensitive, and a wrong
 * autofilled answer is worse than a blank one. We recognise them so they can be
 * reported as deliberately skipped, rather than silently ignored.
 */
const NEVER_FILL = [
  'gender', 'race', 'ethnicity', 'veteran', 'disability',
  'sexual orientation', 'date of birth', 'age', 'hispanic', 'latino',
];

/**
 * Consent and legal acknowledgements. Always left for the person to tick:
 * agreeing to terms or data processing is their decision, never a default.
 */
const CONSENT = /consent|i agree|agree to|privacy (policy|notice)|terms (of|and)|gdpr|data processing|i have read|acknowledge|certify that/i;

const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

/** Text of the element(s) named by aria-labelledby, which may list several ids. */
function labelledByText(element) {
  const ids = element.getAttribute('aria-labelledby');
  if (!ids) return null;
  return ids.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim() || null;
}

/** The question a radio or checkbox answers: its fieldset legend or group label. */
function groupQuestion(element) {
  if (element.type !== 'radio' && element.type !== 'checkbox') return null;
  const group = element.closest('fieldset, [role="radiogroup"], [role="group"]');
  if (!group) return null;
  return group.querySelector('legend')?.textContent ?? labelledByText(group) ?? group.getAttribute('aria-label');
}

function signalsFor(element) {
  const labelFromAria = labelledByText(element);

  const labelFromFor = element.id
    ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent
    : null;

  return [
    groupQuestion(element),
    labelFromAria,
    labelFromFor,
    element.closest('label')?.textContent,
    element.getAttribute('aria-label'),
    element.getAttribute('name'),
    element.getAttribute('id'),
    element.getAttribute('placeholder'),
    element.getAttribute('autocomplete'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[_\-[\]]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function categorise(signals) {
  if (NEVER_FILL.some((term) => signals.includes(term))) {
    return { key: null, sensitive: true };
  }

  let best = null;

  for (const category of CATEGORIES) {
    for (const phrase of category.match) {
      if (!signals.includes(phrase)) continue;
      if (!best || phrase.length > best.length) {
        best = { key: category.key, length: phrase.length };
      }
    }
  }

  return { key: best?.key ?? null, sensitive: false };
}

function isFillable(element) {
  if (element.disabled || element.readOnly) return false;
  if (element.type === 'hidden') return false;
  if (['password', 'submit', 'button', 'reset', 'image'].includes(element.type)) return false;
  if (element.closest('[hidden], [aria-hidden="true"]')) return false;
  if (element.type === 'file') return element.offsetParent !== null || !!element.closest('form')?.getClientRects().length;
  return element.offsetParent !== null;
}

/** What kind of control this is — the filler needs to know. */
function kindOf(element) {
  if (element.tagName === 'SELECT') return 'select';
  if (element.tagName === 'TEXTAREA') return 'textarea';
  if (element.type === 'file') return 'file';
  if (element.type === 'checkbox' || element.type === 'radio') return element.type;
  // Suggestion boxes: address pickers and React-style custom dropdowns.
  if (element.getAttribute('role') === 'combobox' || ['list', 'both'].includes(element.getAttribute('aria-autocomplete'))) return 'combobox';
  return 'text';
}

/**
 * Drag-and-drop upload boxes (Dropzone and similar) that have no file input of
 * their own, such as Teamtailor's "Upload CV". Matched by the label beside them.
 */
const DROPZONE = '[data-controller~="forms--inputs--upload"], .dropzone, [class*="dropzone" i], .dz-clickable, [data-testid*="dropzone" i], [data-testid*="file-upload" i]';

function labelNear(zone) {
  for (let node = zone, depth = 0; node && depth < 4; node = node.parentElement, depth++) {
    const labels = [...node.querySelectorAll('label, legend')]
      .filter((label) => zone.contains(label) || label.compareDocumentPosition(zone) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (labels.length) return labels.at(-1).textContent;
  }
  return null;
}

function detectDropzones() {
  const zones = [...document.querySelectorAll(DROPZONE)]
    .filter((zone) => !zone.parentElement?.closest(DROPZONE))
    .filter((zone) => zone.getClientRects().length && !zone.querySelector('input[type="file"]'));
  const found = [];
  for (const zone of zones) {
    const signals = [zone.getAttribute('aria-label'), labelNear(zone)].filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
    const { key } = categorise(signals);
    if (key === 'resume' || key === 'coverLetter') found.push({ key, element: zone, kind: 'drop', signals, source: 'heuristic' });
  }
  return found;
}

function detectFields() {
  const elements = document.querySelectorAll('input, textarea, select');
  const found = [];
  const skipped = [];

  for (const element of elements) {
    if (!isFillable(element)) continue;

    const signals = signalsFor(element);

    if (element.type === 'checkbox' && CONSENT.test(signals)) {
      skipped.push({ signals: signals.slice(0, 60), reason: 'consent' });
      continue;
    }

    // A site rule is evidence; the heuristic is a guess. Prefer evidence.
    const fromSite = window.CVAutofillSites?.siteKeyFor(element) ?? null;
    const { key: guessed, sensitive } = categorise(signals);
    const key = fromSite ?? guessed;

    if (sensitive) {
      skipped.push({ signals: signals.slice(0, 60), reason: 'sensitive' });
      continue;
    }

    if (key) {
      found.push({
        key,
        element,
        kind: kindOf(element),
        signals,
        source: fromSite ? 'site' : 'heuristic',
      });
    }
  }

  found.push(...detectDropzones());
  return { found, skipped };
}

// ─── Required fields left empty ─────────────────────────────────────────────

/** Readable label for a control, without "*" or "Required". */
function labelOf(element) {
  // || not ??: an element without an id gives '' here, and that must fall through.
  const text = groupQuestion(element)
    || labelledByText(element)
    || (element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent)
    || element.closest('label')?.textContent
    || element.getAttribute('aria-label')
    || element.getAttribute('placeholder')
    || element.getAttribute('name')
    || 'Unnamed field';
  return text.replace(/\*/g, ' ').replace(/\bRequired\b/gi, ' ').replace(/\s+/g, ' ').replace(/[\s:]+$/, '').trim().slice(0, 90);
}

function rawLabel(element) {
  return [groupQuestion(element), labelledByText(element), element.id && document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent, element.closest('label')?.textContent].filter(Boolean).join(' ');
}

function isRequired(element) {
  if (element.required || element.getAttribute('aria-required') === 'true') return true;
  return /\*|\brequired\b/i.test(rawLabel(element));
}

function isEmpty(element) {
  if (element.type === 'checkbox') return !element.checked;
  if (element.type === 'radio') return !document.querySelector(`input[type="radio"][name="${CSS.escape(element.name)}"]:checked`);
  if (element.type === 'file') return !element.files?.length;
  return !String(element.value ?? '').trim();
}

/** A Dropzone counts as done once it shows an uploaded file or holds its URL. */
function zoneDone(zone) {
  return Boolean(zone.querySelector('.dz-success, .dz-complete:not(.dz-error)') || [...zone.querySelectorAll('input')].some((input) => input.value));
}

let nextFieldId = 0;
function tag(element) {
  if (!element.dataset.adcvField) element.dataset.adcvField = String(++nextFieldId);
  return element.dataset.adcvField;
}

/**
 * Required fields still empty, in page order, inside the forms that hold the
 * application. Each gets a data-adcv-field id so the panel can scroll to it.
 */
function findMissingRequired(found = detectFields().found) {
  const scopes = [...new Set(found.map((field) => field.element.closest('form') ?? document.body))];
  if (!scopes.length) scopes.push(document.body);
  const missing = [], seenRadios = new Set();
  for (const scope of scopes) {
    for (const element of scope.querySelectorAll('input, select, textarea')) {
      if (element.type === 'hidden' || element.disabled || ['submit', 'button', 'reset', 'image', 'password'].includes(element.type)) continue;
      const visible = element.getClientRects().length || element.closest('label')?.getClientRects().length;
      if (!visible || !isRequired(element) || !isEmpty(element)) continue;
      if (element.type === 'radio') { if (seenRadios.has(element.name)) continue; seenRadios.add(element.name); }
      missing.push({ id: tag(element), label: labelOf(element) });
    }
    for (const zone of scope.querySelectorAll(DROPZONE)) {
      const label = labelNear(zone);
      if (zone.parentElement?.closest(DROPZONE) || !label || !/\*|\brequired\b/i.test(label) || zoneDone(zone)) continue;
      missing.push({ id: tag(zone), label: label.replace(/\*/g, ' ').replace(/\bRequired\b/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) });
    }
  }
  // Page order, so the list reads like the form.
  const order = (item) => document.querySelector(`[data-adcv-field="${item.id}"]`);
  return missing.sort((a, b) => (order(a).compareDocumentPosition(order(b)) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

function groupOf(key) {
  return CATEGORY_BY_KEY.get(key)?.group ?? 'Other';
}

// Content scripts cannot be ES modules, so the API hangs off window.
window.CVAutofillFields = {
  detectFields,
  findMissingRequired,
  labelOf,
  zoneDone,
  groupOf,
  CATEGORIES,
  NEVER_FILL,
  FIELD_KEYS: CATEGORIES.map((c) => c.key),
};
