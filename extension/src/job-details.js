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

  /** The page's JobPosting structured data, if any. */
  function posting() {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try { data = JSON.parse(script.textContent); } catch { continue; }
      const items = [data, ...(Array.isArray(data) ? data : []), ...(Array.isArray(data?.['@graph']) ? data['@graph'] : [])];
      const found = items.find((item) => [].concat(item?.['@type'] ?? []).includes('JobPosting'));
      if (found) return found;
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
    const job = posting();
    const bodyText = clean(document.body?.innerText ?? '').slice(0, 80000);
    const description = job?.description ? htmlText(job.description).slice(0, 20000) : descriptionOnPage();
    const salary = salaryFrom(job) ?? salaryInText(bodyText) ?? { salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null };
    const types = [].concat(job?.employmentType ?? []).join(' ');
    return {
      location: locationFrom(job) || locationOnPage(),
      ...salary,
      employmentType: typeOf(types) || typeOf(bodyText.slice(0, 3000)),
      description,
      country: window.CVAutofillFields?.jobCountry?.() ?? null,
    };
  }

  window.CVAutofillJobDetails = { read, salaryInText, typeOf };
})();
