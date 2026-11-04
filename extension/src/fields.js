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
  { key: 'telegram', group: 'Social', match: ['telegram'] },

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

  // --- application ----------------------------------------------------------
  // "How did you hear about this job?": matched by HEARD_ABOUT below, not by phrases.
  { key: 'heardAbout', group: 'Application', match: [] },

  // --- work preferences -----------------------------------------------------
  // Matched by WORK_SETUP and RELOCATE below, not by phrases.
  { key: 'workArrangement', group: 'Work preferences', match: [] },
  { key: 'willingToRelocate', group: 'Work preferences', match: [] },
];

/** Never filled, whatever the settings. */
const ALWAYS_SKIP = ['sexual orientation', 'date of birth', 'age'];

/**
 * Voluntary self-identification ("diversity") questions. Legally sensitive and
 * always optional, so they are filled only when the person switched them on in
 * Settings, from answers kept in this browser. Hispanic/Latino comes first: a
 * race question that lists "Hispanic or Latino" as an option is still race.
 */
const DIVERSITY = [
  { key: 'eeoHispanic', match: ['hispanic', 'latino', 'latinx'] },
  { key: 'eeoRace', match: ['race', 'racial', 'ethnicity', 'ethnic'] },
  { key: 'eeoGender', match: ['gender'] },
  { key: 'eeoVeteran', match: ['veteran'] },
  { key: 'eeoDisability', match: ['disability', 'disabled'] },
];

/**
 * Never guessed at by the general rules: demographic questions are reported
 * and left alone unless they are diversity questions the person opted into.
 */
const NEVER_FILL = [...ALWAYS_SKIP, ...DIVERSITY.flatMap((item) => item.match)];

/**
 * Consent and legal acknowledgements. Always left for the person to tick:
 * agreeing to terms or data processing is their decision, never a default.
 */
const CONSENT = /consent|i agree|agree to|privacy (policy|notice)|terms (of|and)|gdpr|data processing|i have read|acknowledge|certify that/i;

const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

// ─── Eligibility questions ────────────────────────────────────────────────

/**
 * Sponsorship and work-authorization answers depend on the country a
 * question is about ("…to work legally for Box in Poland"). The first
 * country it names, by its usual forms; null when it names none.
 */
const COUNTRY_NAMES = {
  'United States': ['united states', 'usa', 'u.s.', 'us', 'america'], Canada: ['canada'], 'United Kingdom': ['united kingdom', 'uk', 'u.k.', 'great britain', 'britain', 'england'],
  Ireland: ['ireland'], Germany: ['germany'], France: ['france'], Netherlands: ['netherlands', 'holland'], Belgium: ['belgium'], Spain: ['spain'], Portugal: ['portugal'],
  Italy: ['italy'], Poland: ['poland'], 'Czech Republic': ['czech republic', 'czechia'], Austria: ['austria'], Switzerland: ['switzerland'], Sweden: ['sweden'],
  Norway: ['norway'], Denmark: ['denmark'], Finland: ['finland'], Estonia: ['estonia'], Latvia: ['latvia'], Lithuania: ['lithuania'], Romania: ['romania'],
  Bulgaria: ['bulgaria'], Hungary: ['hungary'], Greece: ['greece'], Ukraine: ['ukraine'], Israel: ['israel'], 'United Arab Emirates': ['united arab emirates', 'uae'],
  India: ['india'], Singapore: ['singapore'], Japan: ['japan'], 'South Korea': ['south korea', 'korea'], China: ['china'], Australia: ['australia'],
  'New Zealand': ['new zealand'], Mexico: ['mexico'], Brazil: ['brazil'], Argentina: ['argentina'], 'European Union': ['european union', 'eu'],
};
function countryIn(text) {
  const lower = ` ${String(text ?? '').toLowerCase().replace(/[^a-z.\s]/g, ' ')} `;
  let found = null, at = Infinity;
  for (const [country, names] of Object.entries(COUNTRY_NAMES)) {
    for (const name of names) {
      // Short forms ("us", "uk", "eu") count only as words: "us" in "tell us" is not a country.
      const pattern = new RegExp(`[^a-z]${name.replace(/\./g, '\\.')}[^a-z]`);
      const match = pattern.exec(lower);
      if (!match || match.index >= at) continue;
      if (name === 'us' && !/\b(in|the|for|within)\s+us\b/.test(lower)) continue;
      found = country; at = match.index;
    }
  }
  return found;
}

/**
 * "How did you hear about this job/Box?", "Where did you learn about us?",
 * "Source of application". Not "Who referred you?", which asks for a name.
 */
const HEARD_ABOUT = [
  /\b(how|where) (did|have) you (first )?hear\b/,
  // "Where did you learn about us?", not "Where did you learn to code?"
  /\b(how|where) (did|have) you (first )?(learn|find out|come across|discover|find)\b.{0,40}\b(us|about|this|our|the (job|role|position|opening|posting|vacancy|company|opportunity))\b/,
  /\bhear(d)? about (us|this|the|our)\b/,
  /\b(source of (your |this )?application|application source|referral source|lead source|recruitment source|candidate source)\b/,
];

/**
 * Where the work happens: "work from the office 3 days per week", "Are you
 * open to a hybrid setup?", "fully remote", "preferred work arrangement".
 * Relocation is its own question, which may also ask about the office
 * ("…willing to relocate and commute to this position's office?").
 */
const WORK_SETUP = /\b(hybrid|on-?site|in[- ]office|in the office|from the office|at the office|to the office|from our office|in our office|days? (a|per) week|commut\w*|in[- ]person|work(ing)? (model|arrangement|setup|set-up|location preference)|fully remote|remote(ly)? (work|role|position|first|only)|work remotely|working remotely|open to remote)\b/;
const RELOCATE = /\brelocat\w*/;

/**
 * The job's country, from the page around the form: a location line
 * ("Warsaw, Poland") or a short page description. Null when none names one.
 */
function jobCountry() {
  const places = [...document.querySelectorAll('[class*="location" i]:not(input):not(select):not(textarea), [data-testid*="location" i], [itemprop="jobLocation"], [itemprop="addressCountry"]')]
    .filter((node) => !node.closest('form') && node.textContent.length < 120)
    .map((node) => node.textContent);
  const description = document.querySelector('meta[property="og:description"]')?.content ?? '';
  if (description.length < 80) places.push(description);
  for (const text of places) { const country = countryIn(text); if (country) return country; }
  return null;
}

/** "Have you ever worked at Box…", "Were you previously employed by us?" */
const WORKED_BEFORE = [
  /\b(ever|previously|formerly|before|in the past|prior)\b.{0,60}\b(worked|been employed|employed|been an? (employee|contractor|intern|consultant))\b/,
  /\b(worked|been employed|employed)\b.{0,80}\b(previously|formerly|before|in the past)\b/,
];

// ─── Required acknowledgements (opt-in) ───────────────────────────────────

const ACKNOWLEDGE = /\b(acknowledg\w*|agree\w*|accept\w*|consent\w*|understand\w*|have read|confirm\w*|certif\w*)\b/i;
/** Never answered for the person, even worded as an acknowledgement. */
const NOT_ROUTINE = /\b(authori[sz]\w* to work|work authori[sz]ation|eligib\w*|sponsor\w*|visa|citizen\w*|residen\w*|relocat\w*|veteran|disabilit\w*|felon\w*|convict\w*|criminal|background check|drug|non-?compete|conflicts? of interest|previously (worked|employed)|salary|compensation|wage|marketing|newsletter|promotion\w*|text messages?|sms|future (job )?opportunit\w*|talent (pool|community)|contact me)\b/i;
const DECLINES = /\b(no|not|don.?t|do not|decline|disagree|reject|withdraw)\b/i;
/** An option that acknowledges: "I acknowledge", "Yes, I agree". Never a refusal. */
const acknowledges = (text) => (ACKNOWLEDGE.test(text) || /^\s*yes\b/i.test(text)) && !DECLINES.test(text);

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
    splitWords(element.getAttribute('name')),
    splitWords(element.getAttribute('id')),
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

/** "applicantFirstName" → "applicant First Name", so word matching works on ids. */
function splitWords(value) {
  return value ? value.replace(/([a-z])([A-Z])/g, '$1 $2') : value;
}

/**
 * A phrase counts only at the start of a word: "location" is not in
 * "relocation", "age" is not in "manage". Short phrases ("cv", "zip", "age")
 * must also end the word, so "cv" is not in "cvc".
 */
const phrasePatterns = new Map();
function mentions(signals, phrase) {
  let pattern = phrasePatterns.get(phrase);
  if (!pattern) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}${phrase.length <= 3 ? '(?![\\p{L}\\p{N}])' : ''}`, 'u');
    phrasePatterns.set(phrase, pattern);
  }
  return pattern.test(signals);
}

/** The diversity question this is, judged by its question text (for radios, not each option's label). */
function diversityKey(text) {
  if (ALWAYS_SKIP.some((term) => mentions(text, term))) return null;
  return DIVERSITY.find((item) => item.match.some((term) => mentions(text, term)))?.key ?? null;
}

/**
 * "In what City, State/Province, Country and Zip Code are you residing?" asks
 * for a whole address. Two or more of these parts make it a full-address
 * question, not just "state" because that was the longest word.
 */
const ADDRESS_PARTS = [['city', 'town'], ['state', 'province', 'region'], ['country'], ['zip', 'postal', 'postcode']];

function categorise(signals) {
  if (NEVER_FILL.some((term) => mentions(signals, term))) {
    return { key: null, sensitive: true };
  }
  // Before the general rules: "job" or "company" in the question must not pick a category.
  if (HEARD_ABOUT.some((pattern) => pattern.test(signals))) {
    return { key: 'heardAbout', sensitive: false };
  }
  // Office and relocation questions; eligibility ("…sponsorship to work on-site in Poland") stays eligibility.
  if (!/sponsor|authori[sz]|legally|right to work|visa/.test(signals)) {
    if (RELOCATE.test(signals)) return { key: 'willingToRelocate', sensitive: false, office: WORK_SETUP.test(signals) };
    if (WORK_SETUP.test(signals)) return { key: 'workArrangement', sensitive: false };
  }
  // Before the general rules: "employed" would otherwise read as the current employer.
  if (WORKED_BEFORE.some((pattern) => pattern.test(signals))) {
    return { key: 'workedHereBefore', sensitive: false };
  }
  if (ADDRESS_PARTS.filter((words) => words.some((word) => mentions(signals, word))).length >= 2) {
    return { key: 'location', sensitive: false, compound: true };
  }

  let best = null;

  for (const category of CATEGORIES) {
    for (const phrase of category.match) {
      if (!mentions(signals, phrase)) continue;
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
    const { key: guessed, sensitive, compound, office } = categorise(signals);
    const key = fromSite ?? guessed;

    if (sensitive) {
      const question = (groupQuestion(element) ?? '').toLowerCase().replace(/\s+/g, ' ') || signals;
      const eeo = diversityKey(question);
      if (eeo) found.push({ key: eeo, element, kind: kindOf(element), signals, source: 'heuristic', diversity: true });
      else skipped.push({ signals: signals.slice(0, 60), reason: 'sensitive' });
      continue;
    }

    if (key) {
      // Relocation is about the job's country when the question names none.
      const country = key === 'requiresSponsorship' || key === 'workAuthorization' ? countryIn(rawLabel(element) || signals)
        : key === 'willingToRelocate' ? countryIn(rawLabel(element) || signals) ?? jobCountry() : null;
      found.push({
        key,
        element,
        kind: kindOf(element),
        signals,
        source: fromSite ? 'site' : 'heuristic',
        ...(compound && !fromSite && { compound: true }),
        ...(country && { country }),
        ...(office && !fromSite && { office: true }),
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

/**
 * A form's own hidden helper, such as react-select's "required" input: an
 * invisible input under the dropdown. Not a field to fill or to flag.
 */
function isHelperInput(element) {
  return element.getAttribute('aria-hidden') === 'true' || Boolean(element.closest('[aria-hidden="true"]'))
    || (element.tabIndex === -1 && getComputedStyle(element).opacity === '0');
}

const isCombobox = (element) => element.getAttribute('role') === 'combobox' || ['list', 'both'].includes(element.getAttribute('aria-autocomplete'));

/** The visible box of a suggestion box: react-select's input is only a few pixels wide inside it. */
function controlFor(element) {
  let node = element;
  for (let depth = 0; depth < 6 && node.parentElement; depth++) {
    if (node.getBoundingClientRect().width >= 120) return node;
    node = node.parentElement;
  }
  return node;
}

const CHOSEN = '[class*="singleValue" i], [class*="single-value" i], [class*="multiValue" i], [class*="multi-value" i]';

/** What a suggestion box shows as chosen. react-select keeps its input empty and shows the option beside it. */
function comboboxValue(element) {
  return String(element.value ?? '').trim() || chosenValue(element);
}

/** The option react-select shows as chosen beside its input; empty for plain suggestion boxes. */
function chosenValue(element) {
  let node = element;
  for (let depth = 0; depth < 5 && node.parentElement; depth++) {
    node = node.parentElement;
    // Stop before reaching a box that holds another dropdown's choice.
    if (node.querySelectorAll('input[role="combobox"], input[aria-autocomplete]').length > 1) break;
    const chosen = node.querySelector(CHOSEN);
    if (chosen) return chosen.textContent.trim();
  }
  return '';
}

function isEmpty(element) {
  if (isCombobox(element)) return !comboboxValue(element);
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
      if (isHelperInput(element)) continue;
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

// ─── Questions with no profile field ────────────────────────────────────────

/** "candidate[answers_attributes][3][text]" is a name, not a question. */
const looksLikeName = (text) => !/\s/.test(text) && /[[\]_]/.test(text);

function currentAnswer(element, kind) {
  if (kind === 'radio') {
    const checked = document.querySelector(`input[type="radio"][name="${CSS.escape(element.name)}"]:checked`);
    return checked ? labelOf(checked.labels?.[0] ?? checked).trim() : '';
  }
  if (kind === 'checkbox') return element.checked ? 'Yes' : '';
  if (kind === 'select') return element.value ? element.selectedOptions[0]?.textContent.trim() ?? '' : '';
  if (kind === 'combobox') return comboboxValue(element);
  return String(element.value ?? '').trim();
}

/**
 * Questions on the application form that no profile field covers: the
 * company's own questions ("Telegram account", "Fintech experience"). Saved
 * answers fill these, and the person can save what they typed. Consent,
 * demographic and password fields are never included.
 */
function detectQuestions(found = detectFields().found) {
  // "How did you hear" stays a question too: with its setting off, a saved answer fills it.
  const profileFields = found.filter((field) => field.key !== 'heardAbout');
  const known = new Set(profileFields.map((field) => field.element));
  const knownGroups = new Set(profileFields.filter((field) => field.kind === 'radio').map((field) => field.element.name));
  const scopes = [...new Set(found.map((field) => field.element.closest('form') ?? document.body))];
  if (!scopes.length) scopes.push(document.body);
  const questions = [], seenRadios = new Set();
  for (const scope of scopes) {
    for (const element of scope.querySelectorAll('input, select, textarea')) {
      if (known.has(element) || element.disabled || element.readOnly) continue;
      if (['hidden', 'file', 'password', 'submit', 'button', 'reset', 'image', 'search'].includes(element.type)) continue;
      if (isHelperInput(element)) continue;
      const visible = element.getClientRects().length || element.closest('label')?.getClientRects().length;
      if (!visible) continue;
      const signals = signalsFor(element);
      if (NEVER_FILL.some((term) => mentions(signals, term))) continue;
      // Consent is the person's decision, as a checkbox or as a dropdown.
      if (CONSENT.test(signals)) continue;
      let kind = kindOf(element);
      if (kind === 'text' && element.type === 'number') kind = 'number';
      let options;
      if (kind === 'radio') {
        if (knownGroups.has(element.name) || seenRadios.has(element.name)) continue;
        seenRadios.add(element.name);
        if (!groupQuestion(element)) continue; // Options without their question.
        options = [...document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`)].map((radio) => labelOf(radio.labels?.[0] ?? radio));
      }
      if (kind === 'select') options = [...element.options].filter((option) => option.value !== '').map((option) => option.textContent.trim()).slice(0, 200);
      const question = labelOf(element);
      if (!question || question === 'Unnamed field' || looksLikeName(question)) continue;
      const maxLength = element.maxLength > 0 ? element.maxLength : undefined;
      questions.push({ id: tag(element), question, kind, ...(options && { options }), ...(maxLength && { maxLength }), value: currentAnswer(element, kind) });
    }
  }
  return questions;
}

/**
 * Required, still-empty acknowledgements in the application form: privacy
 * notices and terms ("Privacy Notice Acknowledgement", "I have read the
 * privacy policy"). Filled only when the person switched it on in Settings.
 * Anything that also touches eligibility, background, salary or marketing is
 * left out, whatever its wording.
 */
function detectAcknowledgements(found = detectFields().found) {
  const scopes = [...new Set(found.map((field) => field.element.closest('form') ?? document.body))];
  if (!scopes.length) scopes.push(document.body);
  const items = [], seen = new Set();
  for (const scope of scopes) {
    for (const element of scope.querySelectorAll('input[type="checkbox"], input[type="radio"], select, input[role="combobox"], input[aria-autocomplete]')) {
      if (element.disabled || isHelperInput(element)) continue;
      const visible = element.getClientRects().length || element.closest('label')?.getClientRects().length;
      if (!visible || !isRequired(element) || !isEmpty(element)) continue;
      const kind = kindOf(element);
      const group = kind === 'radio' ? element.name : null;
      if (group && seen.has(group)) continue;
      if (group) seen.add(group);
      const question = (groupQuestion(element) || labelOf(element) || '').trim();
      const own = kind === 'checkbox' ? (element.closest('label')?.textContent ?? labelOf(element)) : '';
      const options = kind === 'select' ? [...element.options].map((option) => option.textContent) : kind === 'radio'
        ? [...document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`)].map((radio) => labelOf(radio.labels?.[0] ?? radio)) : [];
      const text = `${question} ${own} ${options.join(' ')}`;
      if (!(CONSENT.test(text) || ACKNOWLEDGE.test(question) || ACKNOWLEDGE.test(own)) || NOT_ROUTINE.test(text)) continue;
      if (kind === 'checkbox' && !ACKNOWLEDGE.test(own || question)) continue;
      if ((kind === 'select' || kind === 'radio') && !options.some(acknowledges)) continue;
      items.push({ element, kind, question: question || own });
    }
  }
  return items;
}

/**
 * What kind of field Autofill leaves alone on purpose: 'consent' (the
 * person's own decision) or 'never' (personal questions it never answers).
 */
function leftAlone(element) {
  const signals = signalsFor(element);
  if (ALWAYS_SKIP.some((term) => mentions(signals, term))) return 'never';
  if (CONSENT.test(signals) || CONSENT.test(groupQuestion(element) ?? '')) return 'consent';
  return null;
}

function groupOf(key) {
  if (key.startsWith('eeo')) return 'Diversity';
  return CATEGORY_BY_KEY.get(key)?.group ?? 'Other';
}

// Content scripts cannot be ES modules, so the API hangs off window.
window.CVAutofillFields = {
  detectFields,
  findMissingRequired,
  detectQuestions,
  detectAcknowledgements,
  acknowledges,
  leftAlone,
  groupQuestion,
  kindOf,
  isCombobox,
  currentAnswer,
  countryIn,
  jobCountry,
  isEmpty,
  controlFor,
  comboboxValue,
  chosenValue,
  labelOf,
  zoneDone,
  groupOf,
  CATEGORIES,
  NEVER_FILL,
  FIELD_KEYS: CATEGORIES.map((c) => c.key),
};
