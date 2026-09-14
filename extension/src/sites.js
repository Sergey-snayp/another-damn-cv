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

function siteFor(hostname) {
  return SITES.find((site) => site.matches.test(hostname)) ?? null;
}

/** A category key when the current site names this element explicitly. */
function siteKeyFor(element, hostname = location.hostname) {
  const site = siteFor(hostname);
  if (!site) return null;

  const id = element.getAttribute('id');
  const name = element.getAttribute('name');

  return (id && site.byId?.[id]) || (name && site.byName?.[name]) || null;
}

window.CVAutofillSites = { siteKeyFor, siteFor, SITES };
