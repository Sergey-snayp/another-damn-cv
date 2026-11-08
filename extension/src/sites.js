/**
 * Per-site field maps.
 *
 * The 32-category heuristic in fields.js handles most forms on its own. This
 * file is for the cases it cannot reach: inputs with no usable label, such as
 * Greenhouse's custom questions, which render as `question_37990761002` with the
 * wording in a sibling element.
 *
 * Site rules take priority; the heuristic is the fallback. Nothing here is
 * required for the extension to work — an unknown site simply falls through.
 *
 * WHY MOST ENTRIES ARE EMPTY
 * Only Greenhouse serves its form in server HTML. Every other ATS renders
 * client-side, so its selectors cannot be fetched — they have to be read from a
 * live page in a browser. Each entry below is therefore a placeholder that
 * activates the extension on that host and lets the heuristic work, until
 * someone fills it in from a real application.
 *
 * HOW TO FILL ONE IN
 *   1. Open an application form on that site
 *   2. DevTools console:
 *        $$('input,select,textarea').map(e => [e.tagName, e.type, e.id, e.name])
 *   3. Keep only identifiers that look stable. A numeric or hashed id is
 *      per-posting and will not generalise.
 *   4. Add them under byId or byName and reload the extension.
 */

const SITES = [
  {
    name: 'greenhouse',
    matches: /(^|\.)(job-boards|boards)(\.eu)?\.greenhouse\.io$/,
    // Verified against a live posting, 2026-09-14. Greenhouse keys on id.
    byId: {
      first_name: 'firstName',
      last_name: 'lastName',
      preferred_name: 'preferredName',
      email: 'email',
      phone: 'phone',
      country: 'country',
      'candidate-location': 'location',
      resume: 'resume',
      cover_letter: 'coverLetter',
    },
  },
  {
    name: 'lever',
    matches: /(^|\.)jobs\.lever\.co$/,
    // Lever names its inputs semantically and posts a flat form.
    byName: {
      name: 'fullName',
      email: 'email',
      phone: 'phone',
      org: 'currentCompany',
      'urls[LinkedIn]': 'linkedin',
      'urls[GitHub]': 'github',
      'urls[Portfolio]': 'portfolio',
      'urls[Other]': 'website',
      resume: 'resume',
      comments: 'coverLetter',
    },
  },

  {
    name: 'teamtailor',
    // Companies run Teamtailor on their own domains (careers.zexter.com), so the
    // page structure identifies it as well as the host. Read from a live form,
    // 2026-11-02.
    matches: /(^|\.)teamtailor\.com$/,
    fingerprint: () => Boolean(document.querySelector('[name^="candidate["], turbo-frame#application_form, [data-action*="form-overlay#showFormOverlay"]')),
    byName: {
      'candidate[first_name]': 'firstName',
      'candidate[last_name]': 'lastName',
      'candidate[email]': 'email',
      'candidate[phone]': 'phone',
      'candidate[location][query]': 'location',
      'candidate[job_applications_attributes][0][cover_letter]': 'coverLetter',
    },
    // The job page loads its form into an overlay only after Apply is pressed.
    openForm: '[data-action*="form-overlay#showFormOverlay"]:not([disabled])',
  },

  // --- activated, heuristic-only until someone reads a live form -------------
  { name: 'ashby', matches: /(^|\.)jobs\.ashbyhq\.com$/, byId: {} },
  { name: 'smartrecruiters', matches: /(^|\.)jobs\.smartrecruiters\.com$/, byId: {} },
  { name: 'workable', matches: /(^|\.)apply\.workable\.com$/, byId: {} },
  { name: 'bamboohr', matches: /\.bamboohr\.com$/, byId: {} },
  { name: 'recruitee', matches: /\.recruitee\.com$/, byId: {} },
  { name: 'breezy', matches: /\.breezy\.hr$/, byId: {} },
  { name: 'jazzhr', matches: /\.applytojob\.com$/, byId: {} },
  { name: 'workday', matches: /\.myworkdayjobs\.com$/, byId: {} },
  { name: 'icims', matches: /\.icims\.com$/, byId: {} },
];

/** The job sites site-fields.js knows by their markup, as site entries. */
const MARKED_SITES = (window.CVAutofillSiteFields ?? []).map((entry) => ({
  name: entry.name,
  matches: { test: (hostname) => entry.hosts.some((host) => host.test(hostname)) },
  fields: entry.fields,
}));

function siteFor(hostname) {
  return SITES.find((site) => site.matches.test(hostname)) ?? MARKED_SITES.find((site) => site.matches.test(hostname)) ?? null;
}

/** Every rule for this host: the hand-written entry and the marked-fields one. */
function rulesFor(hostname) {
  return [...SITES, ...MARKED_SITES].filter((site) => site.matches.test(hostname));
}

/** The site rule for this page: by host, or by page structure for custom domains. */
function siteForPage(hostname = location.hostname) {
  return siteFor(hostname) ?? SITES.find((site) => site.fingerprint?.()) ?? null;
}

/**
 * The button on a job page that opens its application form: Ashby keeps the
 * form on an "Application" tab, Lever and Workday behind "Apply". Facts about
 * each site's markup, first gathered from the Simplify extension's site rules.
 */
const APPLY_BUTTONS = {
  ashby: 'a[href$="/application"], a[href*="/application?"]',
  ashbyhq: 'a[href$="/application"], a[href*="/application?"]',
  lever: 'a[data-qa="show-page-apply"], a.template-btn-submit[href*="/apply"]',
  workable: 'a[data-ui="apply-button"], button[data-ui="apply-button"]',
  workday: 'a[role="button"][data-automation-id="adventureButton"], a[role="button"][data-uxi-element-id="Apply_adventureButton"]',
  smartrecruiters: 'a.js-oneclick[href*="/oneclick-ui/"]',
  icims: 'a.iCIMS_ApplyOnlineButton',
  jobvite: 'a.jv-button-apply:not(.apply-later)',
  breezy: 'a.button.apply[href$="/apply"], a[href$="/apply"]:not([href*="linkedin"])',
  breezyhr: 'a.button.apply[href$="/apply"], a[href$="/apply"]:not([href*="linkedin"])',
  comeet: 'button#showApplyForm',
  gusto: 'a[href*="/applicants/new"]',
  homerun: 'a.btn-apply',
  jobscore: 'a.js-btn-apply',
  paylocity: 'a.apply-link-marker',
  pinpointhq: 'a[href$="/applications/new"]',
  successfactors: 'button#applyButton_top, button#applyButton_bottom',
  amazon: 'a#apply-button',
  seek: 'a[data-automation="job-detail-apply"]',
  oraclecloud: 'button.apply-now-button',
  eightfold: 'button[data-test-id="apply-button"], a[href*="/careers/apply"]',
};

/** The button that opens this site's application form, when it is still closed. */
function formOpener() {
  const site = siteForPage();
  const selector = site?.openForm ?? APPLY_BUTTONS[site?.name];
  return selector ? [...document.querySelectorAll(selector)].find((button) => button.getClientRects().length) ?? null : null;
}

/** A category key when the current site names this element explicitly. */
function siteKeyFor(element, hostname = location.hostname) {
  const sites = rulesFor(hostname);
  const page = siteForPage(hostname);
  if (page && !sites.includes(page)) sites.push(page);
  if (!sites.length) return null;

  const id = element.getAttribute('id');
  const name = element.getAttribute('name');
  for (const site of sites) {
    const key = (id && site.byId?.[id]) || (name && site.byName?.[name]);
    if (key) return key;
  }
  // An attribute the site puts on the input or on a box right around it
  // (Workday: data-automation-id="legalNameSection_firstName").
  for (const site of sites) {
    for (const [attribute, value, key] of site.fields ?? []) {
      for (let node = element, depth = 0; node && depth < 4; node = node.parentElement, depth++) {
        if (node.getAttribute?.(attribute) !== value) continue;
        // A box that holds other fields too is not this field's own.
        if (node !== element && node.querySelectorAll('input:not([type="hidden"]), textarea, select').length > 1) break;
        return key;
      }
    }
  }
  return null;
}

window.CVAutofillSites = { siteKeyFor, siteFor, siteForPage, formOpener, SITES };
