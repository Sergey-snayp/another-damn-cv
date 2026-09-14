import { createHash } from 'node:crypto';
import type { RawJob } from '../types.js';
import { jobFromLinkedIn, linkedinJobId } from './linkedin.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/125.0 Safari/537.36';

/**
 * Career pages bury the posting under menus, and the scorer only reads the first
 * few thousand characters — so navigation left in place pushes the actual
 * requirements out of the window entirely. Strip the chrome, then drop lines that
 * recur across the page, which is what repeated nav and footer blocks look like.
 */
function textFromHtml(html: string): string {
  const flat = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer|noscript|svg|form|select)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|br|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  const lines = decode(flat)
    .replace(/[ \t\u00a0]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const seen = new Map<string, number>();
  for (const l of lines) seen.set(l, (seen.get(l) ?? 0) + 1);

  const out: string[] = [];
  for (const l of lines) {
    // A short line appearing repeatedly is a menu item, not the job description.
    if (l.length < 60 && (seen.get(l) ?? 0) > 1) continue;
    if (l === out[out.length - 1]) continue;
    out.push(l);
  }
  return out.join('\n').trim();
}

const decode = (s: string): string =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
   .replace(/&gt;/g, '>').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
   .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)));

/** Entities must be decoded here: the caller re-escapes for Telegram. */
const pick = (html: string, re: RegExp): string => decode((html.match(re)?.[1] ?? '').trim());

interface JsonLdJob {
  title?: string; description?: string; datePosted?: string;
  hiringOrganization?: { name?: string } | string;
  jobLocation?: unknown; jobLocationType?: string;
  baseSalary?: { value?: { minValue?: number; maxValue?: number; unitText?: string }; currency?: string };
}

/** Flatten schema.org addresses, which arrive as objects, arrays, or bare strings. */
function ldLocation(loc: unknown): string {
  if (!loc) return '';
  if (typeof loc === 'string') return loc;
  if (Array.isArray(loc)) return loc.map(ldLocation).filter(Boolean).join('; ');
  const o = loc as Record<string, unknown>;
  if (o.address) return ldLocation(o.address);
  const parts = [o.addressLocality, o.addressRegion, o.addressCountry]
    .map((v) => (typeof v === 'string' ? v : (v as { name?: string })?.name))
    .filter(Boolean);
  return parts.join(', ');
}

/**
 * Career pages that want to appear in Google for Jobs embed a JobPosting in
 * JSON-LD. When present it beats every heuristic below: real title, employer,
 * location and full description rather than whatever survived tag-stripping.
 */
function fromJsonLd(html: string): JsonLdJob | null {
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of blocks) {
    let parsed: unknown;
    try { parsed = JSON.parse((m[1] ?? '').trim()); } catch { continue; }
    const stack: unknown[] = [parsed];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) { stack.push(...node); continue; }
      if (!node || typeof node !== 'object') continue;
      const o = node as Record<string, unknown>;
      if (o['@type'] === 'JobPosting') return o as JsonLdJob;
      if (Array.isArray(o['@graph'])) stack.push(...(o['@graph'] as unknown[]));
    }
  }
  return null;
}

/**
 * Best-effort single-posting fetch for any URL the user pastes — the path that
 * covers LinkedIn, Indeed and company career pages without an API contract.
 * Sites that render entirely client-side will yield too little text; the caller
 * falls back to asking for a pasted description.
 */
export async function jobFromUrl(url: string): Promise<RawJob> {
  // LinkedIn needs its own path: the public URL is a login wall.
  if (linkedinJobId(url)) return jobFromLinkedIn(url);

  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`);
  const html = await res.text();

  const ld = fromJsonLd(html);

  const ogTitle = pick(html, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const title = ld?.title
    || ogTitle
    || pick(html, /<title[^>]*>([^<]+)<\/title>/i)
    || 'Untitled role';

  const ldOrg = typeof ld?.hiringOrganization === 'string'
    ? ld.hiringOrganization
    : ld?.hiringOrganization?.name;
  const company = ldOrg
    || pick(html, /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
    || new URL(url).hostname.replace(/^www\./, '');

  const location = ldLocation(ld?.jobLocation);
  // JSON-LD is cleaner but some sites put only a teaser there; keep whichever
  // actually carries the posting.
  const ldDesc = ld?.description ? textFromHtml(ld.description) : '';
  const pageDesc = textFromHtml(html);
  const description = ldDesc.length >= 600 || ldDesc.length >= pageDesc.length
    ? ldDesc
    : pageDesc;
  const remote = /^telecommute$/i.test(ld?.jobLocationType ?? '')
    || /\bremote\b|work from home|anywhere/i.test(`${location} ${title}`);

  const sal = ld?.baseSalary?.value;
  const compensation = sal?.minValue
    ? `${sal.minValue}${sal.maxValue ? `-${sal.maxValue}` : ''} ${ld?.baseSalary?.currency ?? ''}`.trim()
    : null;

  return {
    id: `url:${createHash('sha1').update(url).digest('hex').slice(0, 16)}`,
    source: 'url',
    company: decode(company),
    title: decode(title),
    location,
    remote,
    description: description.slice(0, 20_000),
    url,
    postedAt: ld?.datePosted ?? null,
    compensation,
  };
}

/** Manual escape hatch: user pastes the description text directly. */
export function jobFromText(text: string, label: string): RawJob {
  return {
    id: `manual:${createHash('sha1').update(text).digest('hex').slice(0, 16)}`,
    source: 'manual', company: label, title: label, location: '', remote: false,
    description: text, url: '', postedAt: null, compensation: null,
  };
}
