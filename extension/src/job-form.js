/**
 * Does this page look like a job application form?
 *
 * The extension runs on every site, so the D! button must stay away from login,
 * search, newsletter and checkout forms. It appears when:
 *
 *   - a CV/resume file upload sits with name or email fields, or
 *   - one form holds 3+ applicant fields AND the page shows a job sign
 *     (apply, vacancy, career, CV, резюме… in the address, title or headings), or
 *   - on a known job board, a resume field or 2+ fields (the original rule).
 *
 * Forms with a password, card fields, or a search box are never counted.
 */
(() => {
  if (window.CVAutofillJobForm) return;

  const CONTACT = new Set(['firstName', 'lastName', 'fullName', 'email', 'phone']);
  const APPLICANT = new Set([
    'firstName', 'lastName', 'fullName', 'preferredName', 'email', 'phone', 'location', 'city', 'country',
    'linkedin', 'github', 'portfolio', 'resume', 'coverLetter', 'currentCompany', 'currentTitle',
    'yearsExperience', 'school', 'degree', 'workAuthorization', 'requiresSponsorship', 'salaryExpectation', 'noticePeriod',
  ]);
  const JOB_WORDS = /\b(apply|applying|application|applicant|jobs?|careers?|vacanc(y|ies)|positions?|hiring|recruit\w*|candidates?|resume|résumé|cv)\b|ваканс|резюме|відгук|кар['’]?єр|работ|отклик|робот/i;
  const CARD = /\b(card ?number|cc ?number|cvc|cvv|security code|expiry|expiration)\b/i;

  /** The form a field belongs to; fields outside any <form> share the page. */
  const containerOf = element => element.closest('form, [role="form"]') ?? document.body;

  function excluded(container) {
    if (container.querySelector('input[type="password"]')) return true;
    if (container.querySelector('input[autocomplete^="cc-"]')) return true;
    if ([...container.querySelectorAll('input')].some(input => CARD.test(`${input.name} ${input.id} ${input.placeholder} ${input.getAttribute('aria-label') ?? ''}`))) return true;
    // A search form: a search box and no applicant contact fields.
    return Boolean(container.querySelector('input[type="search"], [role="search"] input')) && !container.querySelector('input[type="email"], input[type="tel"], input[type="file"]');
  }

  function pageText(container) {
    const headings = [...document.querySelectorAll('h1, h2, legend')].slice(0, 8).map(node => node.textContent);
    const buttons = [...container.querySelectorAll('button, input[type="submit"]')].slice(0, 6).map(node => node.textContent || node.value);
    return [decodeURIComponent(location.href), document.title, ...headings, ...buttons].join(' ');
  }

  /**
   * found: Fields.detectFields().found. Returns { show, reason }.
   * `text` replaces the page's own address/title/headings (tests use it).
   */
  function assess(found, { knownSite = false, text } = {}) {
    const groups = new Map();
    for (const field of found) {
      const container = containerOf(field.element);
      if (!groups.has(container)) groups.set(container, []);
      groups.get(container).push(field);
    }
    let fallback = { show: false, reason: 'no applicant form' };
    for (const [container, fields] of groups) {
      if (excluded(container)) { fallback = { show: false, reason: 'login, search or payment form' }; continue; }
      const usable = fields.filter(field => field.key !== 'coverLetter');
      const keys = new Set(usable.map(field => field.key));
      const resumeUpload = usable.some(field => field.key === 'resume' && field.kind === 'file');
      const contacts = [...keys].filter(key => CONTACT.has(key)).length;
      const applicant = [...keys].filter(key => APPLICANT.has(key)).length;
      if (knownSite && (keys.has('resume') || usable.length >= 2)) return { show: true, reason: 'job board form' };
      if (resumeUpload && contacts >= 1) return { show: true, reason: 'CV upload with contact fields' };
      const signal = JOB_WORDS.test(text ?? pageText(container));
      if (resumeUpload && signal) return { show: true, reason: 'CV upload on a job page' };
      if (applicant >= 3 && signal) return { show: true, reason: 'applicant fields on a job page' };
    }
    return fallback;
  }

  window.CVAutofillJobForm = { assess };
})();
