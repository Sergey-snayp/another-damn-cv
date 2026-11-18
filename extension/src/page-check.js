/**
 * The only script on every page. The rest (src/page-scripts.js, about 450 KB) is
 * needed only where a job or an application may be, so this asks for it then:
 *
 *   - a form: a file upload, or two fields that are not a password or a search box
 *   - in the top page: job words in the address or title, a job posting's
 *     structured data, or the mark of a known job system (src/site-fields.js)
 *
 * It looks again as the page changes. The toolbar icon, the right-click menu and
 * an open panel load the rest on any page (src/background.js).
 */
(() => {
  if (window.__adcvPageCheck) return;
  window.__adcvPageCheck = true;

  const IS_TOP = window === window.top;
  if (!IS_TOP && (innerWidth < 250 || innerHeight < 150)) return;

  const JOB_WORDS = /job|career|apply|applic|vacanc|recruit|hiring|talent|candidate|position|opening|employ|resume|résumé|ваканс|резюме|кар.?єр|карьер|karriere|bewerb|stellen|emploi|empleo|carrera|vagas/i;
  const FIELDS = 'input:not([type=hidden],[type=password],[type=search],[type=submit],[type=button],[type=reset],[type=image],[type=checkbox],[type=radio],[type=file]),textarea,select';
  const MARKS = [
    'iframe[src^="https://jobs.ashbyhq.com/"]', 'meta[property="og:url"][content^="https://jobs.ashbyhq.com/"]',
    'meta[name="avature.portal.id"]', 'script[src*="avature"]', 'link[href*="avature"]',
    'script[src*="eightfold"]', 'link[href*="eightfold"]',
    'form[action^="https://boards.greenhouse.io/"]', 'form[action^="https://boards.eu.greenhouse.io/"]', 'form[action^="https://boards.anz.greenhouse.io/"]',
    'form[action^="https://job-boards.greenhouse.io/"]', 'form[action^="https://job-boards.eu.greenhouse.io/"]', 'form[action^="https://job-boards.anz.greenhouse.io/"]',
    'iframe#grnhse_iframe', 'iframe[src*="greenhouse.io/embed/job_app?"]', 'input[type="hidden"][name="action"][value="greenhouse/applications/submit"]',
    'script[src*="d2n5ied94mazop.cloudfront.net"]', 'link[href*="d2n5ied94mazop.cloudfront.net"]',
    'a.footer__logo[href^="https://www.polymer.co"]',
    '[data-cy="brand-wrapper-section"] > a[href^="https://recruitee.com"]', 'script[src*="recruitee"]', 'link[href*="recruitee"]',
    'meta[name="domain"][content="workable.com"]', 'meta[name*="homerun:company_id"]',
    'head[data-ph-id^="ph-page-"]', 'body[data-ph-id^="ph-page-"]', 'script[src*="APPLY_form_renderer.js"]', 'link[href*="APPLY_form_renderer.js"]',
    'main[data-controller="careersite--jobs--form-overlay"]', 'script[src*="teamtailor-cdn.com"]', 'link[href*="teamtailor-cdn.com"]',
    'script[src*="recruiterflow.com"]', 'link[href*="recruiterflow.com"]',
    '[name^="candidate["]', 'turbo-frame#application_form', '[data-action*="form-overlay#showFormOverlay"]',
  ].join(',');
  const SHADOW_EVERY_MS = 5000, MOST_ELEMENTS = 30000;

  const hasForm = (root) => Boolean(root.querySelector('input[type=file]')) || root.querySelectorAll(FIELDS).length >= 2;
  /** A form inside web components. The whole page is walked, so not at every change. */
  function hasFormInShadow(root) {
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot && (hasForm(element.shadowRoot) || hasFormInShadow(element.shadowRoot))) return true;
    }
    return false;
  }
  const isJobPosting = () => [...document.querySelectorAll('script[type="application/ld+json"]')].slice(0, 8).some((script) => script.textContent.includes('JobPosting'));

  let shadowAt = 0;
  function worthLoading() {
    if (hasForm(document)) return true;
    if (IS_TOP && (JOB_WORDS.test(`${location.href} ${document.title}`) || document.querySelector(MARKS) || isJobPosting())) return true;
    if (Date.now() - shadowAt < SHADOW_EVERY_MS || document.getElementsByTagName('*').length > MOST_ELEMENTS) return false;
    shadowAt = Date.now();
    return hasFormInShadow(document);
  }

  let timer = 0;
  const watcher = new MutationObserver(() => { timer ||= setTimeout(check, 1000); });
  function check() {
    timer = 0;
    if (!chrome.runtime?.id) { watcher.disconnect(); return; } // The extension was reloaded.
    if (!worthLoading()) return;
    watcher.disconnect();
    try { void chrome.runtime.sendMessage({ type: 'load-page-scripts' }).catch(() => {}); } catch { /* reloaded */ }
  }
  watcher.observe(document, { childList: true, subtree: true });
  check();
})();
