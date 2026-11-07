/** The selected LinkedIn posting, shared by the panel and its job capture. */
(() => {
  if (window.CVAutofillLinkedIn?.version === 3) return;

  const isPage = () => /(^|\.)linkedin\.com$/i.test(location.hostname);
  const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const visible = node => Boolean(node?.getClientRects().length) && !node.closest('[hidden]') && getComputedStyle(node).visibility !== 'hidden';
  const first = (root, selectors) => {
    for (const selector of selectors) {
      const found = [...root.querySelectorAll(selector)].find(visible);
      if (found) return found;
    }
    return null;
  };
  const idFromUrl = value => {
    try {
      const url = new URL(value, location.href);
      if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) return null;
      const id = url.searchParams.get('currentJobId') || url.searchParams.get('jobPostingId') || url.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d+)\/?$/)?.[1];
      return /^\d+$/.test(id ?? '') ? id : null;
    } catch { return null; }
  };
  const ROOTS = [
    '.jobs-search__job-details--container', '.jobs-search__job-details',
    '.jobs-details__main-content', '.jobs-details', '.job-view-layout', '.scaffold-layout__detail',
    '.decorated-job-posting__details', '.two-pane-serp-page__detail-view',
    '.core-rail',
  ];
  const TITLES = [
    '.job-details-jobs-unified-top-card__job-title', '.jobs-unified-top-card__job-title',
    '.topcard__title', '.top-card-layout__title', 'h1',
  ];
  const COMPANIES = [
    '.job-details-jobs-unified-top-card__company-name', '.jobs-unified-top-card__company-name',
    '.topcard__org-name-link', '[data-testid="company-name"]',
  ];
  const DESCRIPTIONS = [
    '#job-details', '.jobs-description__content .jobs-box__html-content',
    '.jobs-description-content__text', '.jobs-description__content',
    '.description__text .show-more-less-html__markup', '.show-more-less-html__markup',
    '.description__text',
  ];
  const STRIP = 'script, style, noscript, template, button, form, input, select, textarea, nav, footer, [hidden], .visually-hidden, .sr-only';
  function textOf(node) {
    if (!node) return '';
    const copy = node.cloneNode(true);
    copy.querySelectorAll(STRIP).forEach(child => child.remove());
    copy.querySelectorAll('[role="button"], a').forEach(child => {
      if (/^(?:(?:see|show)\s+)?(?:more|less)$/i.test(clean(child.textContent).replace(/^[.…\s]+/, ''))) child.remove();
    });
    copy.querySelectorAll('br, p, li, h1, h2, h3, h4, div').forEach(child => child.append('\n'));
    return copy.textContent.replace(/[ \t\u00a0]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function postings() {
    const found = [], queue = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { queue.push(JSON.parse(script.textContent)); } catch { /* the selected DOM still works */ }
    }
    let visited = 0;
    while (queue.length && visited++ < 5000) {
      const item = queue.shift();
      if (!item || typeof item !== 'object') continue;
      if (Array.isArray(item)) { queue.push(...item); continue; }
      if ([].concat(item['@type'] ?? []).includes('JobPosting')) found.push(item);
      else queue.push(...Object.values(item).filter(value => value && typeof value === 'object'));
    }
    return found;
  }
  function postingId(posting) {
    const identifier = posting.identifier?.value ?? posting.identifier;
    return idFromUrl(posting.url) || idFromUrl(posting['@id'])
      || (typeof identifier === 'string' || typeof identifier === 'number' ? String(identifier).match(/^(?:urn:li:jobPosting:)?(\d+)$/)?.[1] : null);
  }
  function htmlText(html) {
    return textOf(new DOMParser().parseFromString(String(html ?? ''), 'text/html').body);
  }

  const ABOUT = /^about\s+(?:the|this)\s+job\s*:?$/i;
  const END = /^(?:similar jobs|people also viewed|meet the hiring team|about the company|more jobs|job activity)\s*:?$/i;
  const publicJobs = new Map();
  const cachedPosting = id => {
    const saved = publicJobs.get(id);
    return saved?.expires > Date.now() ? saved.job ?? null : null;
  };

  /** The selected job's public page is independent of LinkedIn's signed-in
   * layout, virtualized header and embedded details. Read just this one ID. */
  async function publicPosting() {
    const id = idFromUrl(location.href);
    if (!id || !isPage() || !/^\/jobs(?:\/|$)/.test(location.pathname)) throw new Error('Open a LinkedIn job and wait for its description to load.');
    const existing = publicJobs.get(id);
    if (cachedPosting(id)) return cachedPosting(id);
    if (existing?.retryAfter > Date.now()) throw new Error(existing.error);
    if (existing?.request) return existing.request;
    const entry = {};
    publicJobs.set(id, entry);
    if (publicJobs.size > 12) publicJobs.delete(publicJobs.keys().next().value);
    entry.request = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(`${location.origin}/jobs-guest/jobs/api/jobPosting/${id}`, { credentials: 'omit', signal: controller.signal });
        if (!response.ok) throw new Error('LinkedIn has not returned the job description yet.');
        const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        const title = clean(doc.querySelector('.topcard__title, .top-card-layout__title')?.textContent);
        const company = clean(doc.querySelector('.topcard__org-name-link')?.textContent);
        const description = textOf(doc.querySelector('.show-more-less-html__markup, .description__text'));
        if (!title || !company || description.length < 80) throw new Error('Open a LinkedIn job and wait for its description to load.');
        const place = clean(doc.querySelector('.topcard__flavor--bullet')?.textContent);
        const insights = textOf(doc.querySelector('.description__job-criteria-list'));
        const image = doc.querySelector('.top-card-layout img');
        const source = image?.getAttribute('data-delayed-url') || image?.getAttribute('src');
        const logo = /^https?:\/\//i.test(source ?? '') ? source : null;
        entry.job = {
          id, url: `https://www.linkedin.com/jobs/view/${id}`, source: 'public', root: null, posting: null,
          title, company, location: place, description, logo,
          text: [title, company, place, insights, description].filter(Boolean).join('\n\n'),
        };
        entry.expires = Date.now() + 60000;
        if (idFromUrl(location.href) !== id) throw new Error('The LinkedIn job changed while it was being read.');
        window.dispatchEvent(new Event('adcv-job-ready'));
        return entry.job;
      } catch (error) {
        entry.error = error.message; entry.retryAfter = Date.now() + 15000;
        throw error;
      } finally { clearTimeout(timer); entry.request = null; }
    })();
    return entry.request;
  }
  /** New search-results layouts use generated classes. Start at their actual
   * heading and stop at the nearest description block, never the whole main. */
  function descriptionSection(wanted) {
    for (const heading of document.querySelectorAll('h1, h2, h3, h4, [role="heading"], p, span, strong')) {
      if (!ABOUT.test(clean(heading.textContent)) || !visible(heading)) continue;
      if (heading.closest('li, [role="listitem"], nav')) continue;
      const owner = heading.closest('[data-job-id], [data-occludable-job-id]');
      const ownerId = owner?.getAttribute('data-job-id') || owner?.getAttribute('data-occludable-job-id');
      if (wanted && ownerId && ownerId !== wanted) continue;
      for (let root = heading.parentElement, depth = 0; root && depth < 8; root = root.parentElement, depth++) {
        if (root.matches('main, body, [role="main"]')) break;
        const range = document.createRange();
        range.setStartAfter(heading); range.setEnd(root, root.childNodes.length);
        const body = range.cloneContents();
        const boundary = [...body.querySelectorAll('h1, h2, h3, [role="heading"]')].find(node => END.test(clean(node.textContent)));
        if (boundary) {
          const tail = document.createRange(); tail.setStartBefore(boundary); tail.setEnd(body, body.childNodes.length); tail.deleteContents();
        }
        const text = textOf(body);
        if (text.length >= 80) return { root, text };
      }
    }
    return null;
  }

  /** A matching job link can name the selected posting even when its header
   * has scrolled out of a virtualized details pane. */
  function selectedCard(id) {
    if (!id) return {};
    const links = [...document.querySelectorAll('a[href*="/jobs/view/"], a[href*="currentJobId="]')]
      .filter(link => idFromUrl(link.href) === id && visible(link));
    for (const link of links) {
      const title = clean((link.innerText || link.textContent).split('\n')[0]);
      if (!title || /^(apply|save|view job|show.*details)$/i.test(title)) continue;
      let card = link.closest('[data-job-id], [data-occludable-job-id], li, article, [role="listitem"]');
      if (!card) {
        for (let parent = link.parentElement, depth = 0; parent && depth < 5; parent = parent.parentElement, depth++) {
          const ids = new Set([...parent.querySelectorAll('a[href*="/jobs/view/"]')].map(node => idFromUrl(node.href)).filter(Boolean));
          if (ids.size > 1 || clean(parent.textContent).length > 1500) break;
          card = parent;
          if (parent.querySelector('a[href*="/company/"], img[alt*="logo" i]')) break;
        }
      }
      const companyLink = card && [...card.querySelectorAll('a[href*="/company/"]')].find(node => visible(node) && clean(node.textContent));
      const image = card?.querySelector('img[alt*="logo" i]');
      const lines = (card?.innerText ?? '').split('\n').map(clean).filter(Boolean);
      const nextLine = lines.slice(lines.findIndex(line => line === title) + 1).find(line => line !== title && !/^(?:verified|promoted|saved|viewed|easy apply|\d|.*top applicant)/i.test(line));
      return { title, company: clean(companyLink?.textContent) || clean(image?.alt).replace(/\s*(?:company\s*)?logo\s*$/i, '') || nextLine || '' };
    }
    return {};
  }

  /** No fallback to the results list, feed or sign-in page. Reads never click. */
  function read() {
    if (!isPage() || !/^\/jobs(?:\/|$)/.test(location.pathname)) return null;
    const wanted = idFromUrl(location.href);
    let root, descriptionNode, titleNode;
    for (const selector of ROOTS) {
      for (const candidate of document.querySelectorAll(selector)) {
        if (!visible(candidate)) continue;
        const description = first(candidate, DESCRIPTIONS), title = first(candidate, TITLES);
        if (!description || !title) continue;
        root = candidate; descriptionNode = description; titleNode = title; break;
      }
      if (root) break;
    }
    const section = !root ? descriptionSection(wanted) : null;
    if (!root && !section) return cachedPosting(wanted);
    root ??= section.root;

    const card = selectedCard(wanted);
    const allPostings = postings();
    const identified = allPostings.find(item => postingId(item) === wanted);
    const headingTitle = clean(titleNode?.textContent);
    const title = (!/^(?:jobs?|job search|search results|job details)$/i.test(headingTitle) ? headingTitle : '') || clean(identified?.title) || card.title || '';
    const company = clean(first(root, COMPANIES)?.textContent) || clean(identified?.hiringOrganization?.name) || card.company || '';
    const titleLink = titleNode?.matches('a[href]') ? titleNode : titleNode?.querySelector('a[href]');
    const headerId = idFromUrl(titleLink?.href) || root.getAttribute('data-job-id')
      || first(root, ['.job-details-jobs-unified-top-card [data-job-id]', '.jobs-unified-top-card [data-job-id]'])?.getAttribute('data-job-id');
    // LinkedIn changes the address before replacing the old details pane.
    if (wanted && headerId && wanted !== headerId) return cachedPosting(wanted);
    const id = wanted || headerId;
    // A description can be analyzed while LinkedIn has virtualized its header.
    // Its explicit selected ID and isolated content identify it independently.
    if (!id || !/^\d+$/.test(id)) return null;

    const posting = allPostings.find(item => postingId(item) === id)
      ?? allPostings.find(item => !postingId(item) && clean(item.title) === title
        && clean(item.hiringOrganization?.name) === company) ?? null;
    const description = section?.text || textOf(descriptionNode) || htmlText(posting?.description);
    if (description.length < 80) return cachedPosting(wanted);
    const locationNode = first(root, [
      '.job-details-jobs-unified-top-card__primary-description-container .tvm__text--low-emphasis',
      '.job-details-jobs-unified-top-card__primary-description-container',
      '.jobs-unified-top-card__bullet', '.topcard__flavor--bullet',
    ]);
    const place = clean(locationNode?.textContent).split(/[·•]/)[0].trim();
    const insights = [...root.querySelectorAll('.job-details-jobs-unified-top-card__job-insight, .jobs-unified-top-card__job-insight, .description__job-criteria-list')]
      .filter(visible).map(node => textOf(node)).join('\n');
    const header = titleNode?.closest('.job-details-jobs-unified-top-card, .jobs-unified-top-card, .top-card-layout') ?? root;
    const image = first(header, ['a[href*="/company/"] img', 'img.artdeco-entity-image', 'img[alt*="logo" i]']);
    const source = image?.getAttribute('data-delayed-url') || image?.getAttribute('data-src') || image?.currentSrc || image?.getAttribute('src');
    let logo = null;
    try { const url = new URL(source); if (/^https?:$/.test(url.protocol)) logo = url.href; } catch { /* no company image */ }
    return {
      id, url: `https://www.linkedin.com/jobs/view/${id}`, root, posting,
      title, company, location: place, description, logo,
      text: [title, company, place, insights, description].filter(Boolean).join('\n\n'),
    };
  }

  /** Only expand the selected job's description, never other cards or Apply. */
  async function expand() {
    let before;
    try { before = read(); } catch { /* use the selected public posting */ }
    if (!before) return publicPosting();
    if (before.source === 'public') return before;
    let clicked = false;
    const buttons = [...before.root.querySelectorAll('.jobs-description__footer-button, button.show-more-less-html__button--more, button, [role="button"], a, span')];
    for (const button of buttons) {
      if (!button.matches('.jobs-description__footer-button, .show-more-less-html__button--more')
        && !/^(?:(?:see|show)\s+)?more$/i.test(clean(button.textContent).replace(/^[.…\s]+/, ''))
        && !/^(?:see|show) more(?: description)?$/i.test(button.getAttribute('aria-label') ?? '')) continue;
      if (!visible(button) || button.getAttribute('aria-expanded') === 'true' || /(?:see|show) less/i.test(button.textContent)) continue;
      button.click(); clicked = true;
    }
    if (clicked) await new Promise(resolve => setTimeout(resolve, 400));
    const after = read();
    if (!after || after.id !== before.id) throw new Error('The LinkedIn job changed while it was being read. Try again on the selected job.');
    return after;
  }

  window.CVAutofillLinkedIn = { version: 3, isPage, read, expand };
})();
