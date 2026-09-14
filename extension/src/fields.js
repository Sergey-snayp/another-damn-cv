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

const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

function signalsFor(element) {
  const labelledBy = element.getAttribute('aria-labelledby');
  const labelFromAria = labelledBy
    ? document.getElementById(labelledBy)?.textContent
    : null;

  const labelFromFor = element.id
    ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent
    : null;

  return [
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
  if (element.type === 'file') return true;
  return element.offsetParent !== null;
}

/** What kind of control this is — the filler needs to know. */
function kindOf(element) {
  if (element.tagName === 'SELECT') return 'select';
  if (element.tagName === 'TEXTAREA') return 'textarea';
  if (element.type === 'file') return 'file';
  if (element.type === 'checkbox' || element.type === 'radio') return element.type;
  return 'text';
}

function detectFields() {
  const elements = document.querySelectorAll('input, textarea, select');
  const found = [];
  const skipped = [];

  for (const element of elements) {
    if (!isFillable(element)) continue;

    const signals = signalsFor(element);

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

  return { found, skipped };
}

function groupOf(key) {
  return CATEGORY_BY_KEY.get(key)?.group ?? 'Other';
}

// Content scripts cannot be ES modules, so the API hangs off window.
window.CVAutofillFields = {
  detectFields,
  groupOf,
  CATEGORIES,
  NEVER_FILL,
  FIELD_KEYS: CATEGORIES.map((c) => c.key),
};
