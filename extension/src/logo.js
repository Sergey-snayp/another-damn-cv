/**
 * The hiring company's logo on a job page, for the panel's job card and the
 * saved job. Candidates, best first:
 *
 *   1. the posting's structured data (JobPosting.hiringOrganization.logo)
 *   2. an image on the page that looks like the company's logo: "logo" in its
 *      name, class or address, or alt text naming the company ("Box Logo")
 *   3. a page preview image (og:image) whose address says "logo"
 *   4. on the company's own site, its large site icon
 *
 * Footer and "powered by" images, tracking pixels, tiny images and images
 * that name a job board (Greenhouse, Lever…) are never chosen. When nothing
 * fits, `domain` lets the panel ask for the company site's icon instead.
 */
(() => {
  if (window.CVAutofillLogo) return;

  /** Job boards and job sites: their own logos are not the employer's. */
  const BOARDS = new Set(['adp', 'applytojob', 'ashby', 'ashbyhq', 'avature', 'bamboohr', 'brassring', 'breezy', 'breezyhr', 'comeet', 'dayforce', 'dayforcehcm', 'eightfold', 'freshteam', 'greenhouse', 'homerun', 'icims', 'jazzhr', 'jobscore', 'jobvite', 'lever', 'myworkday', 'myworkdayjobs', 'oraclecloud', 'paylocity', 'personio', 'phenompeople', 'pinpointhq', 'recruitee', 'rippling', 'smartrecruiters', 'successfactors', 'taleo', 'teamtailor', 'workable', 'workday',
    'builtin', 'dice', 'glassdoor', 'indeed', 'linkedin', 'licdn', 'monster', 'otta', 'simplify', 'wellfound', 'ziprecruiter', 'welcometothejungle']);
  const LEGAL = /\b(incorporated|inc|llc|ltd|limited|corp|corporation|company|gmbh|plc|sa|ag|bv|nv|pty|pte|holdings?|group)\b\.?/g;
  const TRACKER = /(^|\.)(doubleclick\.net|google-analytics\.com|googletagmanager\.com|facebook\.(com|net)|bat\.bing\.com|ads\.linkedin\.com)$/i;
  const PIXEL = /(^|[./_-])(pixel|beacon|collect|tracking|analytics|spacer|blank|placeholder|1x1)($|[./_?-])/i;

  /** "The Box, Inc." → "box": for comparing a company name with alt text and domains. */
  const key = (text) => String(text ?? '').toLowerCase().replace(/&/g, ' and ').replace(LEGAL, ' ').replace(/^\s*the\s+/, '').replace(/[^a-z0-9]/g, '');
  const url = (value) => { try { const parsed = new URL(String(value ?? '').trim(), location.href); return /^https?:$/.test(parsed.protocol) ? parsed : null; } catch { return null; } };
  /** "careers.box.com" → "box.com"; "jobs.example.co.uk" → "example.co.uk". */
  function siteOf(hostname) {
    const parts = hostname.toLowerCase().split('.').filter(Boolean);
    const keep = parts.length > 2 && parts.at(-1).length === 2 && ['co', 'com', 'org', 'net', 'ac', 'gov'].includes(parts.at(-2)) ? 3 : 2;
    return parts.slice(-keep).join('.');
  }
  const siteName = (hostname) => siteOf(hostname).split('.')[0];
  /** Whether a text names a job board other than the company itself. */
  const namesBoard = (text, company) => String(text ?? '').toLowerCase().split(/[^a-z0-9]+/).some((word) => BOARDS.has(word) && word !== company);
  /** Whether this page is on the company's own site ("box.com" for Box), not a job board. */
  function companySite(company) {
    const name = siteName(location.hostname).replace(/[^a-z0-9]/g, '');
    if (BOARDS.has(name) || name.length < 2 || !company) return false;
    return name.includes(company) || (name.length >= 4 && company.includes(name));
  }

  function fromStructuredData() {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try { data = JSON.parse(script.textContent); } catch { continue; }
      const items = [data, ...(Array.isArray(data) ? data : []), ...(Array.isArray(data?.['@graph']) ? data['@graph'] : [])];
      for (const item of items) {
        const logo = item?.hiringOrganization?.logo;
        const found = url(typeof logo === 'string' ? logo : logo?.url);
        if (found) return found.href;
      }
    }
    return null;
  }

  /** Whether the element or a close ancestor has a class or id matching `pattern`. */
  function near(element, pattern, depth) {
    for (let node = element, level = 0; node && level <= depth; node = node.parentElement, level++) {
      if (pattern.test(`${node.getAttribute?.('class') ?? ''} ${node.id ?? ''}`)) return true;
    }
    return false;
  }

  /** A score for one image as the company's logo, or 0 when it cannot be. */
  function score(image, company, index) {
    const src = url(image.currentSrc || image.getAttribute('src') || image.getAttribute('data-src') || image.getAttribute('data-lazy-src'));
    if (!src || TRACKER.test(src.hostname) || PIXEL.test(src.pathname)) return { score: 0 };
    const width = (image.complete && image.naturalWidth) || Number(image.getAttribute('width')) || 0;
    const height = (image.complete && image.naturalHeight) || Number(image.getAttribute('height')) || 0;
    if ((width && width < 16) || (height && height < 16)) return { score: 0 };
    const label = [image.getAttribute('alt'), image.getAttribute('title'), image.getAttribute('aria-label')].filter(Boolean).join(' ');
    const file = decodeURIComponent(src.pathname.split('/').pop() || '');
    if (/powered/i.test(label) || namesBoard(label, company) || namesBoard(file, company)) return { score: 0 };
    if (image.closest('footer, [role="contentinfo"]') || near(image, /footer|powered/i, 5)) return { score: 0 };
    let points = 0;
    const alt = key(label.replace(/\blogo(type)?\b|\bimage\b|\bicon\b/gi, ' '));
    if (company && alt && (alt === company || alt === company.slice(0, alt.length) && alt.length >= 3)) points += 6;
    if (/logo/i.test(label) || /logo/i.test(src.pathname) || near(image, /logo|brand/i, 4)) points += 4;
    if (image.closest('header, nav, [role="banner"]')) points += 2;
    if (index < 20) points += 1;
    return { score: points, url: src.href };
  }

  function fromImages(company) {
    let best = null;
    const images = [...document.images].slice(0, 300);
    images.forEach((image, index) => {
      const candidate = score(image, company, index);
      if (candidate.score >= 4 && (!best || candidate.score > best.score)) best = candidate;
    });
    return best?.url ?? null;
  }

  function fromPreview(company) {
    for (const meta of document.querySelectorAll('meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"], meta[property="twitter:image"]')) {
      const found = url(meta.getAttribute('content'));
      if (found && /logo/i.test(found.pathname) && !TRACKER.test(found.hostname) && !namesBoard(decodeURIComponent(found.pathname.split('/').pop() || ''), company)) return found.href;
    }
    return null;
  }

  /** The largest site icon of at least 64px: only meaningful on the company's own site. */
  function siteIcon() {
    let best = null;
    for (const link of document.querySelectorAll('link[rel][href]')) {
      const rel = link.getAttribute('rel').toLowerCase().split(/\s+/);
      if (!rel.some((word) => word === 'icon' || word.startsWith('apple-touch-icon'))) continue;
      const href = url(link.getAttribute('href'));
      if (!href) continue;
      const sizes = (link.getAttribute('sizes') || '').toLowerCase();
      const size = sizes.includes('any') || /svg/i.test(link.getAttribute('type') || '') || /\.svg$/i.test(href.pathname) ? 96
        : Math.max(0, ...[...sizes.matchAll(/(\d+)x(\d+)/g)].map(([, w, h]) => Math.min(Number(w), Number(h)))) || (rel.some((word) => word.startsWith('apple-touch-icon')) ? 180 : 0);
      if (size >= 64 && (!best || size > best.size)) best = { href: href.href, size };
    }
    return best?.href ?? null;
  }

  /**
   * { logo, domain }: the logo's address, or null; and the company's own
   * domain when the page is on it, for the panel's site-icon fallback.
   */
  function find(companyName) {
    const company = key(companyName);
    const own = companySite(company);
    try {
      const logo = fromStructuredData() ?? fromImages(company) ?? fromPreview(company) ?? (own ? siteIcon() : null);
      return { logo, domain: own ? siteOf(location.hostname) : null };
    } catch {
      return { logo: null, domain: own ? siteOf(location.hostname) : null };
    }
  }

  window.CVAutofillLogo = { find };
})();
