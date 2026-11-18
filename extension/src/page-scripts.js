/** The page scripts, in load order. Chrome puts only src/page-check.js on every page. */
export const PAGE_SCRIPTS = [
  'src/top-layer.js',
  'src/site-fields.js',
  'src/sites.js',
  'src/fields.js',
  'src/filler.js',
  'src/account-form.js',
  'src/workday-history.js',
  'src/marks.js',
  'src/launcher.js',
  'src/panel-host.js',
  'src/job-form.js',
  'src/linkedin.js',
  'src/logo.js',
  'src/job-details.js',
  'src/match-card.js',
  'src/content.js',
];
/** Runs in the page's own world (see page-world.js). */
export const PAGE_WORLD_SCRIPT = 'src/page-world.js';
