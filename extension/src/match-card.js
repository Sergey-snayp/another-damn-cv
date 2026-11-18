/**
 * The keyword match card on a job page, on the job systems Simplify shows its
 * card on. It sits just above the job's description. The numbers come from the
 * background (src/match-card-data.js), so it works with the panel closed.
 */
(() => {
  if (window.CVAutofillMatchCard) return;

  const SITES = new Set(['adp', 'adp2', 'amazon', 'apple', 'ashby', 'ashbyhq', 'avature', 'bamboohr', 'brassring', 'breezy', 'breezyhr', 'bytedance', 'coinbase', 'comeet', 'cursor', 'dayforcehcm', 'dover', 'eightfold', 'freshteam', 'google', 'governmentjobs', 'greenhouse', 'gusto', 'hibob', 'ibm', 'icims', 'indeed', 'jazzhr', 'jobscore', 'jobvite', 'lever', 'mechanize', 'meta', 'naukri', 'okta', 'oraclecloud', 'paylocity', 'phenompeople', 'pinpointhq', 'polymer', 'recruitee', 'rippling', 'roblox', 'saashr', 'seek', 'smartrecruiters', 'successfactors', 'taleo', 'talnet', 'teamtailor', 'tesla', 'tiktok', 'trinethire', 'uber', 'ultipro', 'waymo', 'welcometothejungle', 'workable', 'workday']);
  /** Application forms that show the card too: it goes at the top of the form. */
  const FORMS = { mechanize: 'main form', lever: '#application-form', ashby: '.ashby-application-form-container', ashbyhq: '.ashby-application-form-container' };
  /** Finished or form-only addresses of these systems. */
  const NOT_HERE = /greenhouse\.io\/.*\/confirmation|dayforcehcm\.com\/.*\/jobs\/.*\/apply|jobs\.gusto\.com\/postings\/.*\/applicants\/|seek\.com(?:\.au)?\/job\/.*\/apply/i;
  const INDEED_JOB = /(^|\.)indeed\.[a-z.]+$/i;
  const LEVELS = [
    { above: 80, name: 'good', badge: 'Good match', title: 'Strong match, one final boost', rest: () => 'keywords matched. Now make it even stronger.' },
    { above: 40, name: 'fair', badge: 'Fair match', title: 'Almost there, close the last gap', rest: (matched, total) => `keywords matched, ${Math.max(0, total - matched)} more to improve your CV.` },
    { above: -1, name: 'low', badge: 'Low match', title: 'Let’s strengthen your CV', rest: () => 'keywords matched. Add more to stand out.' },
  ];
  const WAIT_FOR_DESCRIPTION_MS = 8000, EVERY_MS = 1500;
  const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
  const visible = (node) => Boolean(node?.getClientRects().length);
  const alive = () => Boolean(chrome.runtime?.id);
  const linkedin = () => Boolean(window.CVAutofillLinkedIn?.isPage());

  let host = null, shadow = null, closed = false, jobKey = '', result = null, asked = 0, waitingSince = 0, lastRun = 0, later = 0;
  let settings = { launcherEnabled: true, launcherDisabledHosts: [], ready: false };

  function belongsHere() {
    if (window !== window.top && (innerWidth < 400 || innerHeight < 260)) return false;
    if (NOT_HERE.test(location.href)) return false;
    if (linkedin()) return true;
    if (INDEED_JOB.test(location.hostname)) return true;
    return SITES.has(window.CVAutofillSites?.siteForPage()?.name);
  }
  const turnedOff = () => settings.launcherEnabled === false || settings.launcherDisabledHosts?.includes(location.hostname);

  function currentJob() {
    if (linkedin()) {
      const job = window.CVAutofillLinkedIn.read();
      return job ? { url: job.url, title: job.title ?? '', description: job.description ?? '', root: job.root ?? document } : null;
    }
    const reader = window.CVAutofillJobDetails;
    return { url: reader.jobUrl() || location.href, title: reader.title(), description: reader.read().description ?? '', root: document };
  }

  /** Where the card goes: { node, inside }. */
  function placeFor(job) {
    if (linkedin()) {
      const heading = [...job.root.querySelectorAll('h1, h2, h3')].find((node) => /^about the job$/i.test(clean(node.textContent)) && visible(node));
      const node = heading?.closest('[componentkey^="JobDetails_AboutTheJob"], article, .jobs-description, section')
        ?? job.root.querySelector('.jobs-description, .description__text, .show-more-less-html');
      return visible(node) ? { node: blockOf(node) } : null;
    }
    const form = document.querySelector(FORMS[window.CVAutofillSites?.siteForPage()?.name]);
    if (visible(form)) return { node: form, inside: true };
    // No job text on the page (an error or a closed job): nothing to match against.
    if (job.description.length < 200) return null;
    // Indeed's own place only: its other pages are search results and error pages.
    const node = blockOf(INDEED_JOB.test(location.hostname) ? document.querySelector('#jobDescriptionText, .ia-JobDescription') : window.CVAutofillJobDetails.descriptionNode(job.description));
    // Directly under <body> it would sit above the whole page.
    return visible(node) && node.parentElement !== document.body ? { node } : null;
  }

  /** A card cannot sit inside a paragraph, a list or a table: the block holding them. */
  const INSIDE_TEXT = new Set(['P', 'SPAN', 'A', 'B', 'I', 'U', 'EM', 'STRONG', 'FONT', 'LI', 'UL', 'OL', 'DD', 'DT', 'DL', 'TD', 'TH', 'TR', 'TBODY', 'TABLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
  function blockOf(start) {
    let node = start;
    while (node?.parentElement && node.parentElement !== document.body && INSIDE_TEXT.has(node.parentElement.tagName)) node = node.parentElement;
    return node;
  }

  const gauge = (score, size, level) => {
    const radius = 42, length = 2 * Math.PI * radius, arc = length * 0.75, value = arc * Math.max(0, Math.min(100, score ?? 0)) / 100;
    return `<svg class="gauge ${level}" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${score === null ? 'Match score pending' : `Match score ${score}`}">
      <circle class="track" cx="50" cy="50" r="${radius}" stroke-dasharray="${arc} ${length}" transform="rotate(135 50 50)"></circle>
      ${score === null ? '' : `<circle class="value" cx="50" cy="50" r="${radius}" stroke-dasharray="${value} ${length}" transform="rotate(135 50 50)"></circle>`}
      <text x="50" y="59" text-anchor="middle">${score === null ? '–' : score}</text></svg>`;
  };
  // !important: rules of the page that reach this element ("… > div") must not hide or squeeze it.
  const CSS = `:host { all: initial !important; display: block !important; visibility: visible !important; position: static !important; float: none !important; box-sizing: border-box !important; width: 100% !important; max-width: var(--adcv-card-width, 640px) !important; height: auto !important; margin: 16px 0 16px var(--adcv-card-inset, 0) !important; padding: 0 !important; font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif !important; color: var(--color-text) !important; }
    * { box-sizing: border-box; } button { font: inherit; cursor: pointer; }
    .card { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 18px 22px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 16px; }
    .copy { display: flex; min-width: 0; flex-direction: column; align-items: flex-start; gap: 6px; } .brand { width: 26px; height: 26px; object-fit: contain; margin-bottom: 4px; }
    strong { font-size: 18px; line-height: 24px; } p { margin: 0; color: var(--color-muted); } p b { color: var(--color-text); }
    .action { margin-top: 8px; padding: 8px 14px; color: var(--color-text); background: var(--color-accent); border: 1px solid var(--color-accent-border); border-radius: 999px; font-weight: 600; } .action:hover { background: var(--color-accent-hover); }
    .score { display: flex; flex: none; flex-direction: column; align-items: center; width: 100px; } .badge { margin-top: 4px; padding: 2px 12px; border-radius: 4px; font-size: 12px; }
    .good.badge { color: var(--color-surface); background: var(--color-success); } .fair.badge { color: var(--color-text); background: var(--color-accent); } .low.badge { color: var(--color-surface); background: var(--color-error); }
    circle { fill: none; stroke-width: 8; stroke-linecap: round; } .track { stroke: var(--color-border); } .good .value { stroke: var(--color-success); } .fair .value { stroke: var(--color-accent-hover); } .low .value { stroke: var(--color-error); }
    text { fill: var(--color-text); font-size: 28px; font-weight: 700; }
    .close { position: absolute; top: 6px; right: 8px; padding: 2px 6px; color: var(--color-muted); background: none; border: 0; font-size: 16px; line-height: 1; }
    button:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
    @media (max-width: 460px) { .card { padding: 16px; gap: 12px; } strong { font-size: 16px; } }`;

  function ensureHost() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'adcv-match-card';
    shadow = host.attachShadow({ mode: 'open' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    shadow.adoptedStyleSheets = [sheet];
    fetch(chrome.runtime.getURL('assets/theme/launcher-colors.css')).then((response) => response.text()).then((theme) => sheet.replaceSync(theme + CSS)).catch(() => {});
    // The page must not treat clicks on the card as clicks on its own job row.
    shadow.addEventListener('click', (event) => {
      event.stopPropagation();
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'close') { closed = true; remove(); }
      else if (action === 'open') void chrome.runtime.sendMessage({ type: 'match-card-open' }).catch(() => {});
      else if (action === 'applied') void chrome.runtime.sendMessage({ type: 'match-card-job', jobId: result?.applied?.jobId }).catch(() => {});
    });
  }
  const remove = () => host?.remove();

  function draw() {
    ensureHost();
    const large = linkedin(), brand = `<img class="brand" alt="Another Damn CV" src="${chrome.runtime.getURL('assets/brand/d-stamp-logo.png')}">`;
    const close = '<button class="close" type="button" data-action="close" aria-label="Close">×</button>';
    let html;
    if (result.applied) {
      const date = result.applied.at ? new Date(result.applied.at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
      html = `<div class="copy">${brand}<strong>You applied to this job</strong><p>${date ? `Applied on ${date}.` : 'It is in your applications.'}</p><button class="action" type="button" data-action="applied">View in the app</button></div>`;
    } else {
      const hasScore = Number.isFinite(result.score) && result.total > 0;
      const level = hasScore ? LEVELS.find((item) => result.score > item.above) : null;
      const label = large ? 'View match details' : 'Improve my match';
      const words = document.createElement('p');
      if (hasScore) { const count = document.createElement('b'); count.textContent = `${result.matched} out of ${result.total} `; words.append(count, level.rest(result.matched, result.total)); } else words.textContent = result.message || 'Reading the keywords…';
      html = `<div class="copy">${brand}<strong>${hasScore ? level.title : 'CV match'}</strong>${words.outerHTML}<button class="action" type="button" data-action="open">${label}</button></div>
        <div class="score">${gauge(hasScore ? result.score : null, large ? 90 : 82, level?.name ?? '')}${hasScore ? `<span class="badge ${level.name}">${level.badge}</span>` : ''}</div>`;
    }
    const card = `<section class="card" aria-label="CV match for this job">${close}${html}</section>`;
    if (shadow.innerHTML !== card) shadow.innerHTML = card;
  }

  function put(place) {
    if (place.inside ? place.node.firstElementChild === host : host.nextElementSibling === place.node) return;
    if (place.inside) place.node.prepend(host); else place.node.parentElement?.insertBefore(host, place.node);
  }

  /** Lines the card up with the job's text when that text is indented inside a wide block. */
  function align(place) {
    let inset = 0;
    if (!place.inside) {
      const walker = document.createTreeWalker(place.node, NodeFilter.SHOW_TEXT);
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (!clean(text.textContent)) continue;
        const range = document.createRange();
        range.selectNodeContents(text);
        const box = range.getClientRects()[0];
        if (!box) continue;
        inset = Math.round(box.left - host.parentElement.getBoundingClientRect().left);
        break;
      }
    }
    const room = host.parentElement.clientWidth - inset;
    const value = inset > 0 && room >= 320 ? `${inset}px` : '0px';
    const width = `${Math.min(640, Math.max(room, 240))}px`;
    if (host.style.getPropertyValue('--adcv-card-inset') !== value) host.style.setProperty('--adcv-card-inset', value);
    if (host.style.getPropertyValue('--adcv-card-width') !== width) host.style.setProperty('--adcv-card-width', width);
  }

  async function ask(job, key) {
    const run = ++asked;
    let reply = null;
    try { reply = await chrome.runtime.sendMessage({ type: 'match-card', url: job.url, title: job.title, description: job.description.slice(0, 20000) }); } catch { /* the extension was reloaded */ }
    if (run !== asked || key !== jobKey) return;
    result = reply ?? { show: false };
    update(true);
  }

  function run() {
    lastRun = Date.now();
    if (!alive() || !settings.ready || closed || turnedOff() || !belongsHere()) { remove(); return; }
    let job;
    try { job = currentJob(); } catch { return; }
    if (!job?.url) { remove(); return; }
    const key = `${job.url}|${job.title}|${job.description.length >= 200 ? job.description.slice(0, 200) : ''}`;
    if (key !== jobKey) { jobKey = key; result = null; waitingSince = Date.now(); remove(); }
    if (!result) {
      const ready = job.description.length >= 200 || Date.now() - waitingSince > WAIT_FOR_DESCRIPTION_MS;
      if (!ready) { update(); return; }
      result = { pending: true };
      void ask(job, key);
      return;
    }
    if (result.pending || !result.show) { if (!result.show) remove(); return; }
    const place = placeFor(job);
    if (!place) { remove(); return; }
    draw();
    put(place);
    align(place);
  }

  /** Called as the page changes; runs at most every so often. */
  function update(now = false) {
    clearTimeout(later);
    const wait = now ? 0 : Math.max(0, EVERY_MS - (Date.now() - lastRun));
    later = setTimeout(run, wait);
  }

  const KEYS = ['launcherEnabled', 'launcherDisabledHosts', 'matchCardHidden', 'chosenResumeId', 'cvTexts'];
  chrome.storage.local.get(KEYS.slice(0, 2)).then((values) => { settings = { ...settings, ...values, ready: true }; update(true); }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !KEYS.some((key) => changes[key])) return;
    for (const key of KEYS.slice(0, 2)) if (changes[key]) settings[key] = changes[key].newValue;
    jobKey = ''; result = null;
    update(true);
  });
  window.CVAutofillMatchCard = { update };
})();
