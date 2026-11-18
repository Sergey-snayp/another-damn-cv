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
  // On a company's own domain (Lululemon's careers site is Avature's): the system's mark in the
  // page (`markers`, CSS) or its own address pattern on any host (`pages`, the whole URL).
  ...((entry.markers?.length || entry.pages?.length) && {
    fingerprint: () => (entry.pages ?? []).some((page) => page.test(location.href))
      || (entry.markers ?? []).some((marker) => {
        // A selector, or a selector and the words its element says ("Powered by Pinpoint").
        const [selector, text] = typeof marker === 'string' ? [marker, null] : [marker.selector, marker.text];
        try { return [...document.querySelectorAll(selector)].some((node) => !text || text.test(node.textContent)); } catch { return false; }
      }),
  }),
}));

function siteFor(hostname) {
  return SITES.find((site) => site.matches.test(hostname)) ?? MARKED_SITES.find((site) => site.matches.test(hostname)) ?? null;
}

/** Every rule for this host: the hand-written entry and the marked-fields one. */
function rulesFor(hostname) {
  return [...SITES, ...MARKED_SITES].filter((site) => site.matches.test(hostname));
}

/**
 * The site rule for this page: by host, or (a company's own domain) by the
 * system's mark in the page, as Simplify finds them (its embeddedPaths).
 * The page's mark is looked for once per address and second: it is asked often.
 */
let marked = { at: 0, url: '', site: null };
function siteForPage(hostname = location.hostname) {
  const byHost = siteFor(hostname);
  if (byHost || hostname !== location.hostname) return byHost;
  if (marked.url === location.href && Date.now() - marked.at < 1000) return marked.site;
  const site = SITES.find((entry) => entry.fingerprint?.()) ?? MARKED_SITES.find((entry) => entry.fingerprint?.()) ?? null;
  marked = { at: Date.now(), url: location.href, site };
  return site;
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
  successfactors: 'button#applyButton_top, button#applyButton_bottom, button[href*="/talentcommunity/apply/"]',
  amazon: 'a#apply-button',
  seek: 'a[data-automation="job-detail-apply"]',
  oraclecloud: 'button.apply-now-button',
  eightfold: 'button[data-test-id="apply-button"], a[href*="/careers/apply"]',
  avature: 'a[href*="ApplicationMethods"], a[href*="ApplyRegister"]',
  brassring: 'button#applyFromDetailBtn',
  phenompeople: 'a[data-ph-at-id="apply-link"]',
  recruitee: 'button[data-cy="apply-button"], a[data-cy="apply-button"]',
  rippling: 'button[data-testid="Apply now"], a[data-testid="Apply now"]',
  adp: 'button#recruitment_jobDescription_apply',
  adp2: 'button#recruitment_jobDescription_apply',
  taleo: 'input[id$="UP_APPLY_ON_REQ.row1"], a[id$="UP_APPLY_ON_REQ.row1"]',
  indeed: 'a[data-testid="viewjob-indeed-apply"], button#indeedApplyButton',
  welcometothejungle: 'a[data-testid="job_header-button-apply"]',
  personio: 'a.action-form-toggle[href$="/apply"], a[href$="/apply"]',
  naukri: 'button#apply-button, button#company-site-button',
  apple: 'a[id$="jobdetailssubmitresume"]',
  bytedance: 'a[href*="/resume/"][href$="/apply"]',
  tiktok: 'a[href*="/resume/"][href$="/apply"]',
  google: 'a#apply-action-button',
  ibm: 'a.button--primary[href*="/careers/Login?jobId="]',
  intuit: 'a.button.job-apply.top',
  meta: { selector: 'div[role="button"]', text: /^apply now$/i },
  roblox: '[class*="HeroJob_job__cta"] button',
  uber: 'a[href*="oraclecloud.com"][href*="/apply"]',
  walmart: 'button[data-id="job-apply-button"]',
  ycombinator: 'a.ycdc-btn.mt-4',
  workatastartup: { selector: 'a[href*="account.ycombinator.com/authenticate"]', text: /^apply to this role$/i },
  hibob: { selector: 'careers-ui-job-listing-details button.primary', text: /^apply\b/i },
  governmentjobs: 'button#apply-button',
  talnet: 'form.apply-form input#submit_button',
  careerspage: 'a[href$="/apply"]',
  catsone: 'a.btn[href$="/apply"]',
  clearcompany: 'a.ccs-apply-button',
  freshteam: 'a.btn-custom[href="#applicant-form"]',
  gohire: { selector: 'a.jp-btn', text: /^apply\b/i },
  hiringthing: { selector: 'button.job-apply-button', text: /^apply\b/i },
  kula: { selector: '#application-form [role=tabpanel] button.chakra-button:not(form button)', text: /^apply for this position$/i },
  paycomonline: 'button[data-testid="Apply-loadingbutton"]',
  paycor: { selector: '.gnewtonApplyBtn', text: /^apply for this position$/i },
  ripplehire: 'button#btn-apply',
  saashr: '.c-career-search-details-view__title-buttons-view button.c-button.m-primary',
  trakstar: 'a.btn-apply[href*="apply=true"]',
  zohorecruit: '#detail-page-applybtn button',
  handshake: { selector: 'main button.rosetta-button', text: /^apply$/i },
  polymer: 'a.apply[href="#apply"]',
  recruiterflow: { selector: 'button.apply-now-button', text: /^apply to this job$/i },
  dayforcehcm: { selector: 'button.ant-btn-primary', text: /^apply\b/i },
  bamboohr: { selector: 'button', text: /^apply for this job$/i },
  ultipro: { selector: '.job-banner-right a, .job-banner-right button, .job-banner-right ukg-button', text: /^apply\b/i },
};

/** Sites whose job pages keep a search box in the page: its fields are not the application. */
const APPLY_OVER_FIELDS = new Set(['indeed']);
const applyOverFields = () => APPLY_OVER_FIELDS.has(siteForPage()?.name);

/**
 * A second step some sites show after Apply: Workday asks how to apply, and
 * "Apply Manually" opens the form (Simplify's applyOptionPaths).
 */
const APPLY_OPTIONS = {
  workday: '[data-automation-id="wd-popup-frame"] a[data-automation-id="applyManually"]',
};

/**
 * Job pages where the panel opens by itself before any form is on the page,
 * as Simplify opens its panel there (its helpMessageUrls, 3.1.10). Chrome-style
 * patterns: * is anything.
 */
const JOB_PAGES = [
  '*://*.myworkdayjobs.com/*/job/*', '*://*.myworkdaysite.com/*/job/*',
  '*://*.myworkdayjobs.com/*/apply/*', '*://*.myworkdaysite.com/*/apply/*',
  '*://*.myworkdayjobs.com/*/login*', '*://*.myworkdaysite.com/*/login*',
  '*://jobs.ashbyhq.com/*/*',
  '*://apply.workable.com/*/j/*',
  '*://*.bamboohr.com/jobs/*', '*://*.bamboohr.com/careers/*',
  '*://jobs.dayforcehcm.com/*/jobs/*',
  '*://app.trinethire.com/companies/*/jobs/*',
  '*://*/*/CandidateExperience/*/sites/*/*/preview/*', '*://*/*/CandidateExperience/*/sites/*/job/*',
  '*://*/*/sites/*/jobs/preview/*/apply/*', '*://*.oraclecloud.com/*/sites/*/job/*', '*://*/*/sites/CX*/job/*',
  '*://*/TGnewUI/Search/*ome/Home*#jobDetails=*', '*://*/TGNewUI/Search/*ome/Home*#jobDetails=*',
  '*://*/TGnewUI/Search/*ome/Home*#Applypage', '*://*/TGNewUI/Search/*ome/Home*#Applypage',
  '*://*.naukri.com/registration/createAccount*',
  '*://lifeattiktok.com/login*', '*://lifeattiktok.com/create-account*', '*://lifeattiktok.com/createaccount*',
].map((pattern) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`));

/**
 * A job posting the panel opens on by itself, as Simplify does: one of the job
 * pages above, or a job site we know whose page has its Apply button.
 */
function isJobPage(url = location.href) {
  return JOB_PAGES.some((pattern) => pattern.test(url)) || (Boolean(siteForPage()) && Boolean(formOpener()));
}

/**
 * Sites that read the uploaded CV and fill the form from it, as Simplify and
 * Jobright wait for them (Jobright's "resume gate"): the CV goes in first,
 * then Autofill waits until the site says it is done, so the site's reading
 * never overwrites what Autofill fills after. `before`: a box to untick
 * first; `busy`: shown while it reads; `done`: shown when it has; `reading`:
 * an element whose text says it is still reading.
 */
const RESUME_GATES = {
  lever: { busy: 'span.resume-upload-working', done: '.resume-upload-success, .resume-upload-failure', timeout: 20000 },
  icims: { done: '[id="PortalProfileFields.Resume_FileNameLabel"]:not(.iCIMS_NoDisplay)', reading: ['[id="PortalProfileFields.Resume_Content"]', /parsing resume/i], timeout: 15000 },
  smartrecruiters: { done: 'spl-dropzone[data-test="resume-upload"][files*="RESUME"]', timeout: 15000 },
  dayforcehcm: { done: '.ant-notification-notice-success', timeout: 60000 },
  paylocity: { before: '#useAttachedResumeToFillOutApplication', done: 'button#remove-resume', timeout: 60000 },
  jobscore: { done: '#resume_doc .files-list span.file.preview', timeout: 20000 },
};
const resumeGate = () => RESUME_GATES[siteForPage()?.name] ?? null;

/** The second step's button (Workday's "Apply Manually"), once it is on screen. */
function applyOption() {
  const selector = APPLY_OPTIONS[siteForPage()?.name];
  return selector ? [...document.querySelectorAll(selector)].find((button) => button.getClientRects().length) ?? null : null;
}

/** The button that opens this site's application form, when it is still closed. */
function formOpener() {
  const site = siteForPage();
  // A selector, or a selector and the button's words where its classes say nothing.
  const rule = site?.openForm ?? APPLY_BUTTONS[site?.name];
  const [selector, words] = typeof rule === 'object' && rule ? [rule.selector, rule.text] : [rule, null];
  return selector ? [...document.querySelectorAll(selector)].find((button) => button.getClientRects().length && (!words || words.test(button.textContent.trim()))) ?? null : null;
}

/**
 * The page's own button to the next step or to submit, as Simplify's panel
 * finds it for its "Continue Application" / "Submit Application": a site's own
 * button first (Avature's Save / Continue), else a button by its words
 * ("Continue", "Next", "Save and continue", "Submit application"), never one
 * in the page's header, menu or footer, a slideshow arrow, or Back / Cancel /
 * Sign in. A submit button wins over a continue one, as in Simplify.
 * Returns { kind: 'continue' | 'submit', text, element } or null.
 */
const ADVANCE_RULES = {
  successfactors: {
    submit: 'span[role="button"][id*="submitBtn"], button[name="fbja_apply"][type="submit"], button[name="fbqa_apply"], button#fbqa_apply',
    continue: 'span[role="button"][id*="nextBtn"], button[name="fbclc_createAccountButton"]',
  },
  avature: {
    submit: 'button[name="save"][type="submit"], input[name="save"][type="submit"]',
    continue: 'button[type="submit"].tpt_uploadResumeNextButton, button[type="submit"][class*="tpt_uploadResumeNextButton"]',
  },
};
const STRICT_CONTINUE = /^(continue|continue application|next|next step|save and continue|save & continue|review application|review and submit)$/i;
const STRICT_SUBMIT = /^(submit|submit application|finish|send application)$/i;
const NOT_ADVANCE = /\b(jobs?|positions?|openings?|listings?|pages?|results?|articles?|posts?|story|stories|slides?|photos?|images?|videos?|later|draft|exit|quit|close|cancel|back|previous|prev|cookies?|consent|shopping|cart|checkout|reading|browsing|website|site|home|log ?in|login|sign ?in|signin|sign ?up|signup|register|guest|google|linkedin|indeed|facebook|apple|email|newsletter|alerts?)\b/;
const LOOSE_CONTINUE = [/^save (and )?(continue|next|proceed)( .*)?$/, /^(go to )?(the )?next( (step|section|stage))?$/, /^(continue|proceed)( to( the)?( next)? \S+( \S+){0,2})?$/, /^(go to )?review( (and )?(continue|submit|finish))?$/, /^review( (my|your))? application$/, /^(save and )?continue( (my|your))? application$/];
const LOOSE_SUBMIT = [/^(submit|send|complete|finish)( (my|your|the))? application( now)?$/, /^(submit and finish|finish and submit|confirm and submit|submit now)$/];
const PAGE_CHROME = 'header, nav, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"], [role="search"]';
const CAROUSEL = '.owl-carousel, .swiper, .swiper-container, .slick-slider, .splide, .glide, .flickity-enabled, [aria-roledescription="carousel"], [data-bs-slide], [data-slide], [class*="carousel-control"]';
const advanceText = (element) => String(element instanceof HTMLInputElement ? element.value : element.textContent).replace(/\s+/g, ' ').trim();
function advanceKind(text) {
  if (!text) return null;
  if (STRICT_SUBMIT.test(text)) return 'submit';
  if (STRICT_CONTINUE.test(text)) return 'continue';
  if (text.length > 40) return null;
  const plain = text.toLowerCase().replace(/&/g, ' and ').replace(/[›»→▶►❯>]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^[\s.!:\-–—]+|[\s.!:\-–—]+$/g, '');
  if (!plain || NOT_ADVANCE.test(plain)) return null;
  if (LOOSE_SUBMIT.some((pattern) => pattern.test(plain))) return 'submit';
  if (LOOSE_CONTINUE.some((pattern) => pattern.test(plain))) return 'continue';
  return null;
}
function advanceButton() {
  const usable = (element) => element.getClientRects().length > 0 && !element.disabled && element.getAttribute('aria-disabled') !== 'true' && !element.closest('#adcv-autofill-launcher, #adcv-autofill-panel');
  const rules = ADVANCE_RULES[siteForPage()?.name];
  for (const kind of ['submit', 'continue']) {
    const own = rules?.[kind] && [...document.querySelectorAll(rules[kind])].find(usable);
    if (own) return { kind, text: advanceText(own) || (kind === 'submit' ? 'Submit' : 'Continue'), element: own };
  }
  const found = { submit: null, continue: null };
  for (const element of document.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"]')) {
    if (!usable(element) || element.closest(PAGE_CHROME) || element.closest(CAROUSEL)) continue;
    const text = advanceText(element);
    const kind = advanceKind(text);
    if (kind && !found[kind]) found[kind] = { kind, text, element };
  }
  return found.submit ?? found.continue;
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
  // The nearest explicit marker wins. A generic ancestor must not override
  // the input's own location marker just because its rule occurs first.
  for (let node = element, depth = 0; node && depth < 4; node = node.parentElement, depth++) {
    if (node !== element && node.querySelectorAll('input:not([type="hidden"]), textarea, select').length > 1) break;
    for (const site of sites) {
      for (const [attribute, value, key] of site.fields ?? []) {
        if (node.getAttribute?.(attribute) !== value) continue;
        return key;
      }
    }
  }
  return null;
}

window.CVAutofillSites = { siteKeyFor, siteFor, siteForPage, formOpener, applyOverFields, isJobPage, applyOption, resumeGate, advanceButton, advanceKind, SITES };
