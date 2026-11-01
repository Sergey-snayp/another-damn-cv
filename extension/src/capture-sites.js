/**
 * Where the job is on pages that show more than one.
 *
 * Search pages on LinkedIn, Indeed and Glassdoor show a list beside the open
 * job; capturing the whole page would mix the two. Each rule names the
 * container that holds just the open job, and the "show more" buttons that
 * hide the rest of its description.
 *
 * Selectors are tried in order, and one is used only if it holds real text, so
 * a stale selector falls through to the next rather than capturing nothing.
 * When a site changes its layout, this file is the only thing to update.
 *
 * Everything else (company sites, ATS boards) uses GENERIC_ROOTS.
 */
globalThis.__cvCaptureSites = [
  {
    name: 'LinkedIn',
    hosts: /(^|\.)linkedin\.com$/,
    roots: [
      '.jobs-search__job-details--container',
      '.jobs-details',
      '.job-view-layout',
      '.decorated-job-posting__details',
      '.top-card-layout + .core-section-container',
    ],
    expand: [
      '.jobs-description__footer-button',
      'button.show-more-less-html__button--more',
    ],
  },
  {
    name: 'Indeed',
    hosts: /(^|\.)indeed\.[a-z.]+$/,
    roots: [
      '#jobsearch-ViewjobPaneWrapper',
      '.jobsearch-ViewJobLayout-jobDisplay',
      '.jobsearch-JobComponent',
      '#viewJobSSRRoot',
    ],
    expand: [],
  },
  {
    name: 'Glassdoor',
    hosts: /(^|\.)glassdoor\.[a-z.]+$/,
    roots: [
      '[class*="JobDetails_jobDetailsContainer"]',
      '[data-test="job-details"]',
    ],
    expand: [
      'button[class*="JobDetails_showMore"]',
    ],
  },
  {
    name: 'Workday',
    hosts: /\.myworkdayjobs\.com$/,
    roots: ['[data-automation-id="jobPostingPage"]'],
    expand: [],
  },
];

globalThis.__cvGenericRoots = [
  '[itemtype*="schema.org/JobPosting"]',
  'main',
  '[role="main"]',
  'article',
  '#content',
];
