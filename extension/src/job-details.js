/**
 * The job's details on the page, to fill the panel's "Save job" form before
 * the person checks it: location, salary range, job type and description.
 *
 * The posting's structured data (JobPosting, which most job boards include)
 * comes first. Without it: the location line near the title, a salary range
 * written in the text ("$120,000 – $150,000 per year", "15 000–20 000 zł"),
 * words like "Full-time", and the main job text.
 */
(() => {
  if (window.CVAutofillJobDetails) return;

  const TYPES = [
    ['Internship', /\binterns?(hip)?\b|\bINTERN\b/i],
    ['Part-time', /\bpart[- ]?time\b|PART_TIME/i],
    ['Contract', /\bcontract(or)?\b|\bfreelance\b|CONTRACTOR/i],
    ['Temporary', /\btemporary\b|TEMPORARY/i],
    ['Full-time', /\bfull[- ]?time\b|FULL_TIME|\bpermanent\b/i],
  ];
  const SIGNS = { $: 'USD', '€': 'EUR', '£': 'GBP', 'zł': 'PLN', '₹': 'INR', '₴': 'UAH', '¥': 'JPY' };
  const CODES = 'USD|EUR|GBP|CAD|PLN|AUD|CHF|SEK|NOK|DKK|CZK|UAH|INR|JPY|SGD|ILS|NZD';
  const PERIODS = [
    ['hour', /\b(per|an|\/)\s*h(ou)?r\b|\bhourly\b|\/h\b/i],
    ['day', /\b(per|a|\/)\s*day\b|\bdaily\b/i],
    ['week', /\b(per|a|\/)\s*w(ee)?k\b|\bweekly\b/i],
    ['month', /\b(per|a|\/)\s*mo(nth)?\b|\bmonthly\b|\bmies(iąc|\.)/i],
    ['year', /\b(per|a|\/)\s*y(ea)?r\b|\byearly\b|\bannual(ly)?\b|\bp\.?a\.?\b|\brocznie\b/i],
  ];
  const UNIT = { HOUR: 'hour', DAY: 'day', WEEK: 'week', MONTH: 'month', YEAR: 'year' };

  const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
  const htmlText = (html) => {
    const body = new DOMParser().parseFromString(String(html ?? ''), 'text/html').body;
    body.querySelectorAll('br, p, li, h1, h2, h3, h4, div').forEach((node) => node.append('\n'));
    return body.textContent.replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  };

  /**
   * Job boards whose pages say the job's details in their own places, as
   * Simplify keeps for each board (jobTitlePath, jobLocationPath…). Jobvite:
   * the title is the h2 "jv-header", the line under it is "R&D | Vancouver,
   * Canada", the company is the header logo ("Varonis Home"). Its apply page
   * has no description: that is on the job page, the same address without
   * "/apply", which is also the job's own address.
   */
  const textAfterLastSeparator = (node) => {
    if (!node) return '';
    const separators = node.querySelectorAll('.jv-inline-separator');
    if (!separators.length) return clean(node.textContent);
    let text = '';
    for (let at = separators[separators.length - 1].nextSibling; at; at = at.nextSibling) text += at.textContent;
    return clean(text);
  };
  const BOARDS = [{
    host: /(^|\.)jobs\.jobvite\.com$/i,
    title: () => clean(document.querySelector('h2.jv-header, h1.jv-header')?.textContent),
    location: () => clean(document.querySelector('h3.jv-job-detail-location')?.textContent) || textAfterLastSeparator(document.querySelector('p.jv-apply-meta, p.jv-job-detail-meta')),
    company: () => clean(document.querySelector('.jv-logo img[alt]')?.alt).replace(/\s+(home|careers?|jobs|logo)$/i, '')
      || tabParts()?.company
      || slugName(location.pathname.match(/^\/(?:careers\/)?([^/]+)\/(?:job|jobs|search)\b/)?.[1]),
    description: '.jv-job-detail-description',
    // The company's badge Jobvite gives for link previews (app.jobvite.com/logo/…); the
    // header's logo is drawn white for a dark header, invisible on a white card.
    logo: (page) => page.querySelector('meta[property="og:image"]')?.content || null,
    jobUrl: () => {
      const found = location.pathname.match(/^\/((?:careers\/)?[^/]+\/job\/[^/]+)/);
      return found ? `${location.origin}/${found[1]}` : null;
    },
  }];
  const board = () => BOARDS.find((item) => item.host.test(location.hostname)) ?? null;
  /** "varonis" → "Varonis"; "acme-corp" → "Acme Corp". */
  function slugName(slug) {
    if (!slug) return '';
    return decodeURIComponent(slug).split(/[-_]+/).filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
  }
  /** A tab titled "Varonis Careers - Apply for Senior Software Engineer": the company and the title. */
  function tabParts() {
    const found = clean(document.title).match(/^(.+?)\s+Careers?\s*[-–—|:]\s*(?:Apply(?:ing)?\s+(?:for|to)\s+)?(.+)$/i);
    return found ? { company: found[1], title: found[2] } : null;
  }

  /** The job's title: the board's place for it, the page's h1, else the tab's title without "X Careers - Apply for". */
  function title() {
    return board()?.title() || clean(document.querySelector('h1')?.innerText) || tabParts()?.title || clean(document.title);
  }
  /** The company, when the board says it in its own place or the tab title does ("Varonis Careers - …"). */
  function company() {
    return board()?.company() || '';
  }
  /** The job's own address: an apply page's job page. */
  function jobUrl() {
    return board()?.jobUrl?.() ?? null;
  }

  /** The page's JobPosting structured data, if any. */
  function posting() {
    if (window.CVAutofillLinkedIn?.isPage()) return window.CVAutofillLinkedIn.read()?.posting ?? null;
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try { data = JSON.parse(script.textContent); } catch { continue; }
      const items = [data, ...(Array.isArray(data) ? data : []), ...(Array.isArray(data?.['@graph']) ? data['@graph'] : [])];
      const found = items.find((item) => [].concat(item?.['@type'] ?? []).includes('JobPosting'));
      if (found) return found;
    }
    return null;
  }

  /** Only a date explicitly labelled as the job's posting date, never an update/expiry date. */
  function postedAt() {
    const linkedin = window.CVAutofillLinkedIn?.isPage();
    const selected = linkedin ? window.CVAutofillLinkedIn.read() : null;
    if (linkedin && !selected) return null;
    const nodes = selected?.source === 'public' ? [] : (selected?.root ?? document).querySelectorAll('[itemprop~="datePosted" i], meta[name="datePosted" i], meta[property="job:posted_time" i]');
    const values = [posting()?.datePosted, ...Array.from(nodes, node => node.getAttribute('content') || node.getAttribute('datetime') || node.textContent)];
    for (const value of values) {
      if (typeof value !== 'string') continue;
      const text = clean(value);
      const day = text.match(/^(\d{4}-\d{2}-\d{2})(?:$|T\d{2}:\d{2})/)?.[1];
      if (!day) continue;
      // Keep the posting's calendar date; converting midnight UTC to local time can lose a day.
      const parsed = new Date(`${day}T00:00:00Z`);
      if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day) return day;
    }
    return null;
  }

  function locationFrom(job) {
    const places = [].concat(job?.jobLocation ?? []).map((place) => {
      const address = place?.address ?? place;
      const country = typeof address?.addressCountry === 'string' ? address.addressCountry : address?.addressCountry?.name;
      return [address?.addressLocality, address?.addressRegion, country].map(clean).filter(Boolean).filter((part, index, all) => all.indexOf(part) === index).join(', ');
    }).filter(Boolean);
    if (job?.jobLocationType === 'TELECOMMUTE') places.unshift('Remote');
    return [...new Set(places)].join(' · ');
  }

  /** The location line beside the job's title: a "location" element outside the application form. */
  function locationOnPage() {
    const nodes = document.querySelectorAll('[class*="location" i]:not(input):not(select):not(textarea):not(label), [data-qa*="location" i], [itemprop="jobLocation"]');
    for (const node of nodes) {
      if (node.closest('form, footer, nav')) continue;
      const text = clean(node.textContent);
      if (text.length >= 2 && text.length <= 120 && !/^location:?$/i.test(text)) return text.replace(/^location:?\s*/i, '');
    }
    return '';
  }

  function salaryFrom(job) {
    const base = job?.baseSalary;
    if (!base) return null;
    const value = base.value ?? base;
    const min = Number(value?.minValue ?? value?.value);
    const max = Number(value?.maxValue ?? value?.value);
    if (!Number.isFinite(min) && !Number.isFinite(max)) return null;
    return {
      salaryMin: Number.isFinite(min) ? Math.round(min) : null,
      salaryMax: Number.isFinite(max) ? Math.round(max) : null,
      salaryCurrency: clean(base.currency ?? value?.currency).toUpperCase() || null,
      salaryPeriod: UNIT[clean(value?.unitText ?? base.unitText).toUpperCase()] ?? null,
    };
  }

  const amount = (digits, thousands) => {
    const number = Number(String(digits).replace(/[\s,.](?=\d{3}\b)/g, '').replace(',', '.'));
    return Number.isFinite(number) ? Math.round(number * (thousands ? 1000 : 1)) : NaN;
  };
  /** A salary range written in the page's text. Needs a currency, so "2015 – 2020" is not a salary. */
  function salaryInText(text) {
    const sign = `[$€£₹₴¥]|zł|${CODES}`;
    const number = '(\\d{1,3}(?:[ ,.\\u00a0]\\d{3})+|\\d+(?:[.,]\\d+)?)\\s*([kK])?';
    const pattern = new RegExp(`(${sign})?\\s?${number}\\s*(?:-|–|—|to|do)\\s*(${sign})?\\s?${number}\\s*(${sign})?`, 'g');
    for (const match of text.matchAll(pattern)) {
      const currencyText = match[1] || match[4] || match[7];
      if (!currencyText) continue;
      const min = amount(match[2], match[3] || match[6]);
      const max = amount(match[5], match[6] || match[3]);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max < 10) continue;
      const after = text.slice(match.index, match.index + match[0].length + 40);
      return {
        salaryMin: min,
        salaryMax: max,
        salaryCurrency: SIGNS[currencyText] ?? currencyText.toUpperCase(),
        salaryPeriod: PERIODS.find(([, period]) => period.test(after))?.[0] ?? null,
      };
    }
    return null;
  }

  function typeOf(text) {
    return TYPES.find(([, pattern]) => pattern.test(text))?.[0] ?? '';
  }

  /** The job's own text: a description element, else the main content without the application form. */
  function descriptionOnPage() {
    const own = board()?.description;
    if (own) {
      const node = document.querySelector(own);
      // The board's own place: an apply page without it waits for the job page (readAsync).
      return node ? htmlText(node.innerHTML).slice(0, 20000) : '';
    }
    const selectors = ['.job__description', '#job-description', '[data-qa="job-description"]', '[class*="job-description" i]', '[class*="jobDescription"]', '[class*="description" i]', 'article', 'main', '[role="main"]'];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (node.closest('form') || !node.getClientRects().length) continue;
        const copy = node.cloneNode(true);
        copy.querySelectorAll('form, input, select, textarea, button, script, style, nav, footer').forEach((child) => child.remove());
        const text = htmlText(copy.innerHTML);
        if (text.length >= 200) return text.slice(0, 20000);
      }
    }
    return '';
  }

  /** The details found, each '' or null when the page does not say. */
  function read() {
    const linkedin = window.CVAutofillLinkedIn?.isPage();
    const selected = linkedin ? window.CVAutofillLinkedIn.read() : null;
    const job = posting();
    const bodyText = clean(linkedin ? selected?.text ?? '' : document.body?.innerText ?? '').slice(0, 80000);
    const description = linkedin ? selected?.description ?? '' : job?.description ? htmlText(job.description).slice(0, 20000) : descriptionOnPage();
    const salary = salaryFrom(job) ?? salaryInText(bodyText) ?? { salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null };
    const types = [].concat(job?.employmentType ?? []).join(' ');
    return {
      location: linkedin ? selected?.location || locationFrom(job) : locationFrom(job) || board()?.location() || locationOnPage(),
      ...salary,
      employmentType: typeOf(types) || typeOf(bodyText.slice(0, 3000)),
      description,
      country: window.CVAutofillFields?.jobCountry?.() ?? null,
    };
  }

  /**
   * The job page as a document: this page when it is the job page, else the
   * job page fetched once (same site, so the page's own fetch can read it).
   */
  let fetched = null;
  function jobPage() {
    const url = board()?.jobUrl?.();
    if (!url || url === location.origin + location.pathname) return Promise.resolve(document);
    if (fetched?.url !== url) {
      fetched = {
        url,
        page: fetch(url, { credentials: 'include' })
          .then((response) => (response.ok ? response.text() : ''))
          .then((text) => (text ? new DOMParser().parseFromString(text, 'text/html') : null))
          .catch(() => null),
      };
    }
    return fetched.page;
  }

  /** read(), and on an apply page without the description, the description from the job page. */
  async function readAsync() {
    const details = read();
    const own = board();
    if (details.description || !own?.description) return details;
    const page = await jobPage();
    const node = page && page !== document ? page.querySelector(own.description) : null;
    if (node) details.description = htmlText(node.innerHTML).slice(0, 20000);
    if (!details.employmentType && details.description) details.employmentType = typeOf(details.description.slice(0, 3000));
    return details;
  }

  /** The board's own logo for the company, from the job page; null when the board has none. */
  async function logo() {
    const own = board();
    if (!own?.logo) return null;
    const page = await jobPage();
    const found = page ? own.logo(page) : null;
    try { return found && /^https?:$/.test(new URL(found, location.href).protocol) ? new URL(found, location.href).href : null; } catch { return null; }
  }

  window.CVAutofillJobDetails = { read, readAsync, logo, title, company, jobUrl, postedAt, salaryInText, typeOf };
})();
