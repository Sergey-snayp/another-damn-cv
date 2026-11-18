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

  // [type, words in any case, the structured data's own code]. Never "contract" or "temporary" alone
  // in a sentence: "service contract" and "temporary workers" are not a job type.
  const TYPES = [
    ['Internship', /^\s*intern(?:ship)?\s*$|\binternship\s+(?:position|role|program|programme|opportunity)\b|\b(?:summer|student|paid|unpaid|software|engineering|marketing|data|design)\s+intern(?:ship)?s?\b/i, /\bINTERN\b/],
    ['Part-time', /\bpart[- ]?time\b/i, /PART_TIME/],
    ['Full-time', /\bfull[- ]?time\b|\bpermanent\s+(?:position|role|job|contract)\b|^\s*permanent\s*$/i, /FULL_TIME/],
    ['Contract', /^\s*contract(or)?\s*$|\bcontract(?:or)?\s+(?:position|role|job|basis|assignment|opportunity|employee)\b|\bcontract[- ]to[- ]hire\b|\bfixed[- ]term\b|\bfreelance\b/i, /\bCONTRACTOR\b/],
    ['Temporary', /\btemporary\s+(?:position|role|job|assignment|employee)\b|^\s*temporary\s*$/i, /\bTEMPORARY\b/],
  ];
  const SIGNS = { $: 'USD', '€': 'EUR', '£': 'GBP', 'zł': 'PLN', '₹': 'INR', '₴': 'UAH', '¥': 'JPY', 'US$': 'USD', 'HK$': 'HKD', 'CA$': 'CAD', 'C$': 'CAD', 'AU$': 'AUD', 'A$': 'AUD', 'NZ$': 'NZD', 'SG$': 'SGD', 'S$': 'SGD' };
  const CODES = 'USD|EUR|GBP|CAD|PLN|AUD|CHF|SEK|NOK|DKK|CZK|UAH|INR|JPY|SGD|ILS|NZD|HKD';
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
    const parse = (text) => new DOMParser().parseFromString(String(text ?? ''), 'text/html').body;
    let body = parse(html);
    // Written twice over ("&lt;p&gt;…"): the first reading gives tags as plain text.
    if (!body.children.length && /<\/?[a-z][^>]*>/i.test(body.textContent)) body = parse(body.textContent);
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
  const textOf = (selector) => clean(document.querySelector(selector)?.textContent);
  /** The innermost pieces of text in an element, in order. */
  const leaves = (node) => [...(node?.querySelectorAll('*') ?? [])].filter((item) => !item.children.length).map((item) => clean(item.textContent)).filter((text) => /\p{L}/u.test(text));
  const microValue = (name) => { const node = document.querySelector(`[itemprop~="${name}" i]`); return clean(node?.getAttribute('content') || node?.textContent); };
  const list = (selector) => [...document.querySelectorAll(selector)].map((node) => clean(node.textContent)).filter(Boolean).join(' · ');
  /** The element after the one saying `label` ("Location:" and then the place). */
  const labelled = (selector, label) => clean([...document.querySelectorAll(selector)].find((node) => label.test(clean(node.textContent)))?.nextElementSibling?.textContent);
  /** BrassRing: a p.question, and its p.answer next. */
  const answerTo = (label) => labelled('p.question', label);
  /** Tal.net's description line: "Vacancy title: X. Location: Y. Closing Date: …". */
  const vacancyMeta = () => clean(document.querySelector('meta[name="description"]')?.content).match(/Vacancy title:\s*(.+?)\.\s+Location:\s*(.+?)\.\s+Closing/i);
  /** A board's rule: a selector for its text, or a function. */
  const ask = (rule) => (typeof rule === 'string' ? textOf(rule) : rule?.() ?? '');
  const capital = (text) => text.replace(/(^|\s)(\p{Ll})/gu, (_, gap, letter) => gap + letter.toUpperCase());
  const BOARDS = [{
    host: /(^|\.)jobs\.smartrecruiters\.com$/i,
    title: () => textOf('h1.job-title') || microValue('title'),
    location: () => [microValue('addressLocality'), microValue('addressRegion'), microValue('addressCountry')].filter(Boolean).map(capital).join(', '),
  }, {
    host: /(^|\.)ultipro\.com$/i,
    location: () => (leaves(document.querySelector('address.custom-address')).at(-1) || textOf('address.custom-address')).replace(/\s+\d{5,}(?=,)/, ''),
    company: () => clean(document.title).match(/\|\s*(.+?)\s+Career Opportunities$/i)?.[1] ?? '',
    type: () => textOf('#JobFullTime'),
  }, {
    host: /(^|\.)oraclecloud\.com$/i,
    location: () => textOf('.job-details__subtitle'),
    description: '.job-details-wrapper',
  }, {
    host: /(^|\.)applytojob\.com$/i,
    title: () => textOf('.job-header h2') || clean(document.title).match(/^(.+?)\s+-\s+.+?\s+-\s+Career Page$/i)?.[1] || '',
    location: () => [...(document.querySelector('.job-attributes-container')?.children ?? [])].filter((node) => !/^resumator-job-(employment|department)/.test(node.id)).map((node) => clean(node.textContent))[0] ?? '',
    company: () => clean(document.title).match(/\s+-\s+(.+?)\s+-\s+Career Page$/i)?.[1] ?? '',
    type: () => textOf('#resumator-job-employment'),
  }, {
    host: /(^|\.)indeed\.[a-z.]+$/i,
    title: () => textOf('[data-testid="vj-job-title"], [data-testid="jobsearch-JobInfoHeader-title"]') || clean(document.title).split(/\s+-\s+/)[0],
    location: () => leaves(document.querySelector('[data-testid="company-info-metadata"]')).at(-1) ?? '',
    company: () => textOf('[data-testid="company-info-metadata"]').split('·')[0].trim(),
  }, {
    host: /^ats\.rippling\.com$/i,
    company: () => slugName(location.pathname.match(/\/([^/]+)\/jobs(?:\/|$)/)?.[1]),
  }, {
    host: /\.jobs\.personio\.(?:de|com)$/i,
    company: () => hiringOrganization() || slugName(location.hostname.split('.')[0]),
  }, {
    host: /(^|\.)adp\.com$/i,
    title: () => textOf('h2.job-description-title'),
  }, {
    host: /(^|\.)taleo\.net$/i,
    // The employer's banner at the top of the page names it.
    company: () => clean([...document.images].find((image) => image.alt.trim() && image.naturalWidth > 100)?.alt),
    title: () => textOf('[id="requisitionDescriptionInterface.reqTitleLinkAction.row1"]') || clean(document.querySelector('meta[property="og:title"]')?.content),
    description: '#taleo_holder',
  }, {
    // Gusto's h1 holds the company, the title and "Remote · Full time" in that order.
    host: /^jobs\.gusto\.com$/i,
    title: () => textOf('h1 > span:nth-of-type(2)'),
    company: () => textOf('h1 > span:nth-of-type(1)'),
    location: () => textOf('h1 > span:nth-of-type(3)').split(/\s*·\s*/)[0],
    descriptionHtml: () => [...document.querySelectorAll('.rich-text-container')].at(-1)?.innerHTML ?? '',
  }, {
    host: /^recruitingbypaycor\.com$/i,
    title: () => textOf('#gnewtonJobPosition').replace(/^position:\s*/i, ''),
    company: () => textOf('h4'),
    location: () => textOf('#gnewtonJobLocationInfo'),
    description: '#gnewtonJobDescriptionText',
  }, {
    host: /(^|\.)ripplehire\.com$/i,
    title: () => textOf('.section-title h2'),
    description: 'p.description',
    logo: () => { const brand = document.querySelector('a.navbar-brand'); return brand ? getComputedStyle(brand).backgroundImage.match(/url\("?([^")]+)"?\)/)?.[1] ?? null : null; },
  }, {
    host: /(^|\.)saashr\.com$/i,
    title: () => textOf('.c-career-search-details-view__title-heading-text'),
    company: () => textOf('h1.c-applicant-header__comp-name'),
    location: () => clean([...document.querySelectorAll('.c-one-column-layout__list-item')].find((item) => /^location/i.test(clean(item.textContent)))?.querySelector('.c-one-column-layout__value')?.textContent),
    descriptionHtml: () => [...document.querySelectorAll('.c-career-search-details-view__details-section')].filter((section) => /^(description|requirements)$/i.test(clean(section.querySelector('.c-career-search-details-view__details-heading')?.textContent))).map((section) => section.innerHTML).join('\n'),
    logo: () => document.querySelector('.c-applicant-header-logo img')?.src ?? null,
  }, {
    host: /(^|\.)hire\.trakstar\.com$/i,
    title: () => textOf('.js-job-title'),
    location: () => ['.meta-job-location-city', '.meta-job-location-state', '.meta-job-location-country'].map(textOf).filter(Boolean).join(', '),
    description: '.jobdesciption',
  }, {
    host: /^app\.trinethire\.com$/i,
    title: () => textOf('h3.job-name').replace(/^:\s*/, ''),
    company: () => textOf('.header-links a').replace(/^jobs at\s+/i, ''),
    location: () => textOf('ul.job-meta li:first-child'),
  }, {
    host: /(^|\.)zohorecruit\.[a-z.]+$/i,
    location: () => {
      const line = document.querySelector('.cw-jobheader-info > p:nth-of-type(2)')?.cloneNode(true);
      line?.querySelector('.cw-small-size')?.remove();
      return clean(line?.textContent);
    },
    type: () => clean([...document.querySelectorAll('.cw-summary li')].map((item) => clean(item.textContent)).find((text) => /^job type/i.test(text))?.replace(/^job type:?/i, '')),
  }, {
    // Its structured data's title ends in "| dentsu | Handshake".
    host: /(^|\.)joinhandshake\.com$/i,
    title: () => textOf('h1'),
  }, {
    host: /(^|\.)amazon\.jobs$/i,
    company: () => 'Amazon',
    location: () => list('div.association.location-icon li'),
    description: '#job-detail-body div.content',
  }, {
    host: /^jobs\.apple\.com$/i,
    location: '#jobdetails-joblocation',
    descriptionHtml: 'section.hyperlink-underline',
  }, {
    host: /(^|\.)joinbytedance\.com$/i,
    company: () => 'ByteDance',
    location: () => labelled('p', /^location:?$/i),
    descriptionHtml: 'div:has(> p.bd-title)',
  }, {
    host: /(^|\.)lifeattiktok\.com$/i,
    company: () => 'TikTok',
    location: () => labelled('p', /^location:?$/i),
    descriptionHtml: 'div:has(> p.whitespace-pre-line)',
  }, {
    host: /^www\.google\.com$/i,
    path: /^\/about\/careers\//,
    title: () => clean(document.querySelector('meta[property="og:title"]')?.content) || textOf('div.DkhPwc h2.p1N2lc'),
    location: () => list('div.DkhPwc span.r0wTof').replace(/\s*·\s*;\s*/g, ' · '),
    descriptionHtml: 'div.KwJkGe, div.aG5W3, div.BDNOWe',
  }, {
    host: /^www\.hubspot\.com$/i,
    path: /^\/careers\/jobs\//,
    title: '#react-root-directory h2',
    company: () => 'HubSpot',
    location: '#react-root-directory h2 ~ h3:not(.careers-department)',
    descriptionHtml: '#react-root-directory div:has(> .content-pay-transparency)',
  }, {
    host: /^careers\.ibm\.com$/i,
    // Its structured data's title is only the grade ("AM").
    title: () => clean(document.querySelector('meta[property="og:title"]')?.content),
    location: 'span.card-item-location',
    description: '#jobDetailWidget .section__content',
  }, {
    host: /^www\.okta\.com$/i,
    description: 'article.Job__content',
  }, {
    host: /^careers\.roblox\.com$/i,
    location: '[class*="HeroJob_job__details"] span',
    description: '[class*="JobContent_job-content__rich-text"]',
  }, {
    // Its structured data is often another job's: used only when the job numbers agree.
    host: /^jobs\.uber\.com$/i,
    checkPosting: true,
    title: 'h1',
    company: () => 'Uber',
    location: '[data-testid="job-page"] dl dd',
    description: 'div.shrink-0 div.wysiwyg',
  }, {
    host: /^careers\.walmart\.com$/i,
    location: () => clean([...document.querySelectorAll('[data-testid^="JobRoleTitleCard"] p.text-sm')].find((node) => node.getClientRects().length)?.textContent),
    description: '[data-testid="JobDescription-htmldiv"]',
  }, {
    host: /^x\.company$/i,
    location: () => clean(document.querySelectorAll('[class*="_subtitle_"] span')[1]?.textContent),
    description: '[class*="_contentBody_"]',
    logo: (page) => page.querySelector('a[aria-label="Go to X homepage."] img')?.getAttribute('src') || null,
  }, {
    host: /^cursor\.com$/i,
    location: () => textOf('article header p.text-theme-text-sec').split(/\s*·\s*/).at(-1) ?? '',
    description: 'div.prose.prose-lg',
  }, {
    host: /(^|\.)workatastartup\.com$/i,
    company: 'a[href^="/companies/"]',
    location: () => labelled('span.font-mono', /^location$/i),
    description: '.variant2-prose',
    logo: (page) => page.querySelector('img[alt$=" logo"]')?.getAttribute('src') || null,
  }, {
    host: /(^|\.)brassring\.com$/i,
    location: () => answerTo(/^(location|city)\b/i) || answerTo(/^country\b/i),
    descriptionHtml: '.jobDetailsLiner.mainDetails .questionClass',
  }, {
    host: /(^|\.)careers\.hibob\.com$/i,
    title: '[data-testid="job-ad-title"]',
    company: () => slugName(location.hostname.split('.')[0].replace(/-[0-9a-f]{8,}$/i, '')),
    location: 'careers-ui-job-listing-details .subtitle-content',
    description: 'careers-ui-job-listing-details .content',
    type: '#display-value-employmenttype',
  }, {
    host: /(^|\.)tal\.net$/i,
    title: () => vacancyMeta()?.[1] || textOf('h1.section').replace(/^view vacancy\s*-\s*/i, ''),
    company: () => clean(document.title).split(/\s+-\s+/).at(-1) ?? '',
    location: () => vacancyMeta()?.[2] ?? '',
    descriptionHtml: '.htmltype-richtext .form-control-static',
  }, {
    host: /^apply\.appcast\.io$/i,
    company: () => clean(document.querySelectorAll('app-uapp-job-details .job-details span')[0]?.textContent),
    location: () => clean(document.querySelectorAll('app-uapp-job-details .job-details span')[1]?.textContent),
  }, {
    host: /(^|\.)careers-page\.com$/i,
    company: () => { const spans = document.querySelectorAll('main .banner span'); return clean(spans[1]?.textContent) || clean(document.title).match(/\s-\s(.+?)\s*\|\s*Career Page$/i)?.[1] || ''; },
    location: () => { const spans = document.querySelectorAll('main .banner span'); return spans.length > 1 ? clean(spans[0].textContent) : ''; },
    description: '.redactor-styles',
  }, {
    host: /(^|\.)catsone\.com$/i,
    company: () => clean(document.querySelector('img.logo-image')?.alt),
    location: 'ul.job-tags li:first-child',
    descriptionHtml: 'div.job-description',
    logo: (page) => page.querySelector('img.logo-image')?.getAttribute('src') || null,
  }, {
    host: /(^|\.)(clearcompany|hrmdirect)\.com$/i,
    company: () => clean(document.querySelector('img.cc-logo')?.alt) || clean(document.querySelector('meta[property="og:title"]')?.content).match(/\bat\s+(.+)$/i)?.[1] || '',
    description: '.ccs-job-description-text',
  }, {
    host: /(^|\.)freshteam\.com$/i,
    location: () => clean([...(document.querySelector('.job-details-header .stick-hide-in-mobile')?.childNodes ?? [])].find((node) => node.nodeType === Node.TEXT_NODE && clean(node.textContent))?.textContent),
  }, {
    host: /^jobs\.gohire\.io$/i,
    location: '.jp-sidebar-item-data',
  }, {
    host: /^jobs\.ashbyhq\.com$/i,
    // Every place the job lists; its structured data has only the first.
    location: () => clean([...document.querySelectorAll('.ashby-job-posting-left-pane h2, [class*="ashby-job"] h2')].find((heading) => /^location$/i.test(clean(heading.textContent)))?.nextElementSibling?.textContent).split(/\s*;\s*/).filter(Boolean).join(' · '),
  }, {
    host: /^apply\.workable\.com$/i,
    location: () => [textOf('[data-ui="job-location"]'), textOf('[data-ui="job-workplace"]')].filter(Boolean).join(' · '),
  }, {
    host: /(^|\.)pinpointhq\.com$/i,
    location: () => textOf('dd.pinpoint-job-sidebar--location'),
  }, {
    // Its header logo is often drawn for a dark header: the site's icon is the company's own.
    host: /(^|\.)recruitee\.com$/i,
    logo: (page) => page.querySelector('link[rel~="icon"]')?.getAttribute('href') || null,
  }, {
    host: /(^|\.)comeet\.com?$/i,
    logo: (page) => page.querySelector('meta[property="og:image"]')?.content || null,
  }, {
    host: /^jobs\.gem\.com$/i,
    location: () => textOf('[class*="iconLabel"] > span').split(/\s*•\s*/).join(' · '),
  }, {
    host: /(^|\.)bamboohr\.com$/i,
    location: () => textOf('div[class*="fabric"][class$="-description"]'),
  }, {
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
  }, {
    // Workday, read as Simplify reads it (its ResumeScores rules): the title is
    // the jobPostingHeader, the details sit under "Job Posting Description",
    // and the company's logo is the header's data-automation-id="logo" image,
    // served from the Workday site itself.
    host: /(^|\.)myworkday(?:jobs|site)\.com$/i,
    title: () => clean(document.querySelector('[data-automation-id="jobPostingHeader"]')?.textContent),
    // Its list ends with counts for the other places ("4 Locations").
    location: () => [...document.querySelectorAll('[data-automation-id="locations"] dd')].map((node) => clean(node.textContent)).filter((text) => text && !/^\d+\s+locations?$/i.test(text)).join(' · '),
    // The posting's own name for the employer; else the Workday tenant ("ubc" → "UBC").
    company: () => hiringOrganization() || tenantName(location.hostname.split('.')[0]),
    description: '[data-automation-id="jobPostingDescription"]',
    // Its header, on the job page and its apply steps alike: this page's first (a fetched
    // Workday page is drawn by its scripts and has no header yet).
    logo: (page) => (document.querySelector('img[data-automation-id="logo"]') ?? page.querySelector('img[data-automation-id="logo"]'))?.getAttribute('src') || null,
    // An apply page (…/job/<place>/<name>/apply/applyManually) is its job page.
    jobUrl: () => {
      const found = location.pathname.match(/^(.*?\/(?:job|details)\/.+?)\/apply(?:\/|$)/);
      return found ? `${location.origin}${found[1]}` : null;
    },
  }, {
    // Avature, also on a company's own domain (Lululemon's careers site), as Simplify reads it (its
    // jobTitlePath, jobDescriptionPath…): the title in og:title (the job page's banner says "We've been
    // waiting for you."), the description in the rich-text article, the company in the header logo. Its
    // apply pages (ApplicationMethods, the form) have no description: that is on the job page, their "Back".
    host: /(^|\.)avature\.net$/i,
    marker: 'meta[name="avature.portal.id"]',
    title: () => clean(document.querySelector('meta[property="og:title"]')?.content).replace(/\s+[-|]\s+(careers|jobs)$/i, '')
      || clean(document.querySelector('.banner--main .banner__text__title')?.textContent),
    location: () => [...document.querySelectorAll('p')].map((node) => node.textContent.replace(/\s+/g, ' ').trim().match(/^Location:\s*(.+)$/i)?.[1]).find(Boolean) ?? textOf('.banner__text__subtitle p:first-child'),
    company: () => hiringOrganization() || clean(document.querySelector('.header__logo h1, [class*="logo"] h1')?.textContent).slice(0, 100),
    description: '.article__content--rich-text',
    // Some themes have no rich-text block: the job is in the article's plain blocks.
    descriptionHtml: () => (document.querySelector('.article__content--rich-text') ? '' : [...document.querySelectorAll('article.article--details .article__content')].map((node) => node.innerHTML).join('\n')),
    logo: (page) => page.querySelector('meta[property="og:image"]')?.content || null,
    jobUrl: () => {
      if (/\/JobDetail\//.test(location.pathname)) return `${location.origin}${location.pathname}`;
      return document.querySelector('a.back[href*="/JobDetail/"], a[href*="/JobDetail/"]')?.href ?? null;
    },
  }];
  /** "ubc" → "UBC" (a short tenant is an acronym); "salesforce" → "Salesforce". */
  const tenantName = (slug) => (slug && slug.length <= 4 ? slug.toUpperCase() : slugName(slug));
  const board = () => BOARDS.find((item) => item.host.test(location.hostname) && (!item.path || item.path.test(location.pathname))) ?? BOARDS.find((item) => item.marker && document.querySelector(item.marker)) ?? null;
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

  /**
   * The job's title: the board's place for it, the posting's structured data
   * (an apply page's h1 is its step, "Create Account"), the page's h1, else the
   * tab's title without "X Careers - Apply for".
   */
  function title() {
    // The first h1 on screen: a page can keep a hidden one ("Internet Explorer is no longer supported").
    const heading = [...document.querySelectorAll('h1')].find((node) => node.getClientRects().length && clean(node.innerText));
    return ask(board()?.title) || clean(posting()?.title) || clean(heading?.innerText) || tabParts()?.title || clean(document.title);
  }
  /**
   * The company: the board's own place for it, else the posting's structured
   * data (JobPosting.hiringOrganization.name, which most job boards include).
   */
  function company() {
    return ask(board()?.company) || hiringOrganization();
  }
  /** The employer the posting's structured data names. */
  function hiringOrganization() {
    const organization = posting()?.hiringOrganization;
    return clean(typeof organization === 'string' ? organization : organization?.name).slice(0, 100);
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
      // Raw line breaks inside its strings are common (Trakstar's) and break strict JSON.
      try { data = JSON.parse(script.textContent.replace(/[\u0000-\u001f]/g, ' ')); } catch { continue; }
      const items = [data, ...(Array.isArray(data) ? data : []), ...(Array.isArray(data?.['@graph']) ? data['@graph'] : [])];
      const found = items.find((item) => [].concat(item?.['@type'] ?? []).includes('JobPosting'));
      const jobNumber = (address) => String(address ?? '').match(/\d{4,}/g)?.at(-1);
      if (found && (!board()?.checkPosting || !found.url || jobNumber(found.url) === jobNumber(location.pathname))) return found;
    }
    return microdataPosting();
  }

  /**
   * The same details written as microdata, in JSON-LD's shape: SAP SuccessFactors'
   * career sites (careers.ey.com) have no JSON-LD.
   */
  function microdataPosting() {
    const root = document.querySelector('[itemtype*="schema.org/JobPosting" i]');
    if (!root) return null;
    const node = (name, within = root) => within?.querySelector(`[itemprop~="${name}" i]`) ?? null;
    const value = (name, within) => { const found = node(name, within); return clean(found?.getAttribute('content') || found?.getAttribute('datetime') || found?.textContent); };
    const posted = new Date(value('datePosted'));
    const place = node('jobLocation');
    const organization = node('hiringOrganization');
    return {
      '@type': 'JobPosting',
      title: value('title'),
      description: node('description')?.innerHTML ?? '',
      employmentType: value('employmentType'),
      ...(Number.isFinite(posted.getTime()) && { datePosted: posted.toISOString() }),
      hiringOrganization: { '@type': 'Organization', name: clean(organization?.getAttribute('content')) || value('name', organization) || clean(organization?.textContent) },
      ...(place && { jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: value('addressLocality', place), addressRegion: value('addressRegion', place), postalCode: value('postalCode', place), addressCountry: value('addressCountry', place) } } }),
    };
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

  const CONTINENT = /^(north america|south america|latin america|europe|asia|africa|oceania|emea|apac|latam)$/i;
  function locationFrom(job) {
    const places = [].concat(job?.jobLocation ?? []).map((place) => {
      const address = place?.address ?? place;
      if (typeof address === 'string') return clean(address);
      const country = typeof address?.addressCountry === 'string' ? address.addressCountry : address?.addressCountry?.name;
      // Boards write "-", "30", "BC,CA" or "North America" here: only real place names stay.
      const parts = [address?.addressLocality, address?.addressRegion, country].flatMap((part) => clean(part).split(/\s*,\s*/)).filter((part) => /\p{L}/u.test(part) && !CONTINENT.test(part));
      return parts.filter((part, index) => parts.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index).join(', ');
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
      if (text.length >= 2 && text.length <= 120 && !/^location:?$|^and \d+ more$/i.test(text)) return text.replace(/^location:?\s*/i, '');
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
    const sign = `(?:US|HK|CA|AU|NZ|SG|C|A|S)\\$|[$€£₹₴¥]|zł|${CODES}`;
    const number = '(\\d{1,3}(?:[ ,.\\u00a0]\\d{3})+(?:[.,]\\d{1,2}(?!\\d))?|\\d+(?:[.,]\\d+)?)\\s*([kK])?';
    const period = '(?:\\s*(?:per|an|a|/)\\s*(?:hour|hr|day|week|month|year|yr))?';
    // "$156,000 USD - $234,000 USD", "HK$20,159 to HK$24,503", "$14.71 To $15.21 Hourly".
    const pattern = new RegExp(`(${sign})?\\s?${number}(?:\\s*(?:${CODES}))?${period}\\s*(?:-|–|—|‒|−|to|do)\\s*(?:(?:${CODES})\\s+)?(${sign})?\\s?${number}\\s*(${sign})?`, 'gi');
    const currencyOf = (found) => SIGNS[found.toUpperCase()] ?? SIGNS[found] ?? found.toUpperCase();
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
        salaryCurrency: currencyOf(currencyText),
        salaryPeriod: PERIODS.find(([, period]) => period.test(after))?.[0] ?? null,
      };
    }
    // One rate with its period: "$32.90 USD per hour".
    const single = text.match(new RegExp(`(${sign})\\s?${number}(?:\\s*(?:${CODES}))?\\s*(?:per|an|a|/)\\s*(?:hour|hr|day|week|month|year|yr)\\b`, 'i'));
    if (single) {
      const value = amount(single[2], single[3]);
      if (Number.isFinite(value) && value >= 1) return { salaryMin: value, salaryMax: value, salaryCurrency: currencyOf(single[1]), salaryPeriod: PERIODS.find(([, period]) => period.test(single[0]))?.[0] ?? null };
    }
    return null;
  }

  function typeOf(text) {
    return TYPES.find(([, words, code]) => words.test(text) || code.test(text))?.[0] ?? '';
  }

  /** The posting's description, with its responsibilities and qualifications when those are separate (Meta). */
  function postingText(job) {
    let text = htmlText(job.description);
    for (const part of [job.responsibilities, job.qualifications]) {
      const more = typeof part === 'string' ? htmlText(part) : '';
      if (more && !text.includes(more.slice(0, 80))) text += `\n\n${more}`;
    }
    return text.slice(0, 20000);
  }

  /** A page's "Employment type: …" line, else the job's first words. */
  function typeFromText(text) {
    const stated = text.match(/\bemployment type:?\s+([a-z]+(?:[- ]time)?)/i)?.[1];
    return typeOf(stated ?? text.slice(0, 3000));
  }

  /** The job's own text: a description element, else the main content without the application form. */
  function descriptionOnPage() {
    const rule = board()?.descriptionHtml;
    const html = typeof rule === 'string' ? [...document.querySelectorAll(rule)].map((node) => node.innerHTML).join('\n') : rule?.();
    if (html) return htmlText(html).slice(0, 20000);
    const own = board()?.description;
    if (own) {
      const node = document.querySelector(own);
      if (node) return htmlText(node.innerHTML).slice(0, 20000);
      // The board's own place: an apply page without it waits for the job page (readAsync).
      if (board().jobUrl) return '';
    }
    const selectors = ['.job__description', '#job-description', '[data-qa="job-description"]', '[class*="job-description" i]', '[class*="jobDescription"]', '[class*="description" i]', 'article', 'main', '[role="main"]'];
    // A short "article" is usually a side note: the page's main part comes first, then anything.
    const broad = (selector) => /^(article|main|\[role=)/.test(selector);
    for (const longest of [600, 200]) for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        if (node.closest('form') || !node.getClientRects().length) continue;
        // A cookie notice and a pay notice have a "description" too.
        const notice = node.closest('[class*="pay-transparency" i], [class*="cookie" i], [id*="cookie" i], [class*="consent" i], [id*="consent" i], [class*="onetrust" i], [id*="onetrust" i], [class*="cmplz" i]');
        if (notice && notice !== document.body && notice !== document.documentElement) continue;
        const copy = node.cloneNode(true);
        copy.querySelectorAll('form, input, select, textarea, button, script, style, nav, footer').forEach((child) => child.remove());
        const text = htmlText(copy.innerHTML);
        if (text.length >= (broad(selector) ? longest : 200)) return text.slice(0, 20000);
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
    // A board's own place for the description first (Workday's keeps its headings and lists), then the structured data's.
    const own = !linkedin && (board()?.description || board()?.descriptionHtml) ? descriptionOnPage() : '';
    const description = linkedin ? selected?.description ?? '' : own || (job?.description ? postingText(job) : descriptionOnPage());
    const salary = salaryFrom(job) ?? salaryInText(bodyText) ?? { salaryMin: null, salaryMax: null, salaryCurrency: null, salaryPeriod: null };
    const types = [].concat(job?.employmentType ?? []).join(' ');
    return {
      // A board's own place first: its structured data can be thinner than its page (Gem's "USA").
      location: linkedin ? selected?.location || locationFrom(job) : ask(board()?.location) || locationFrom(job) || locationOnPage(),
      ...salary,
      // What the posting states wins; its text is read only when it states nothing.
      employmentType: typeOf(ask(board()?.type)) || (types ? typeOf(types) : /\bintern(?:ship)?\b/i.test(title()) ? 'Internship' : typeFromText(linkedin ? `${clean(document.querySelector('.description__job-criteria-list')?.innerText)} ${bodyText}` : bodyText)),
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

  window.CVAutofillJobDetails = { read, readAsync, logo, title, company, jobUrl, postedAt, salaryInText, typeOf, microdata: microdataPosting };
})();
