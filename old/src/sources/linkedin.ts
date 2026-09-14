import type { RawJob } from '../types.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/125.0 Safari/537.36';

/**
 * LinkedIn's logged-out job page is a login wall wrapped around a shell, so
 * fetching it directly yields navigation chrome and nothing else. The guest
 * endpoint that powers LinkedIn's own public job previews returns the real
 * posting markup without a session, which is what we read instead.
 */
const GUEST = (id: string) => `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`;

/** Job id appears either as the trailing path segment or as ?currentJobId=. */
export function linkedinJobId(url: string): string | null {
  if (!/(^|\.)linkedin\.com$/i.test(safeHost(url))) return null;
  const q = url.match(/[?&]currentJobId=(\d{6,})/)?.[1];
  if (q) return q;
  return url.match(/\/jobs\/view\/(?:[^/?#]*?-)?(\d{6,})/)?.[1] ?? null;
}

const safeHost = (u: string): string => {
  try { return new URL(u).hostname; } catch { return ''; }
};

const unescapeHtml = (s: string): string =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
   .replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
   .replace(/&([a-z]+|#\d+);/gi, ' ');

const strip = (html: string): string =>
  unescapeHtml(html
    .replace(/<\/(p|div|li|br|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map((l) => l.trim()).join('\n')
    .trim();

const pick = (html: string, re: RegExp): string => unescapeHtml(html.match(re)?.[1] ?? '').trim();

export async function jobFromLinkedIn(url: string): Promise<RawJob> {
  const id = linkedinJobId(url);
  if (!id) throw new Error('That does not look like a LinkedIn job URL.');

  const res = await fetch(GUEST(id), { headers: { 'user-agent': UA, accept: 'text/html' } });
  if (res.status === 429) {
    throw new Error('LinkedIn is rate-limiting this IP. Wait a few minutes, or paste the description as text.');
  }
  if (!res.ok) throw new Error(`LinkedIn returned HTTP ${res.status} for job ${id}.`);
  const html = await res.text();

  const body = html.match(
    /<div[^>]*class="[^"]*show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
  if (!body) {
    throw new Error('LinkedIn served a login wall for this posting. Paste the description as text instead.');
  }
  const description = strip(body);

  const title = pick(html, /class="[^"]*topcard__title[^"]*"[^>]*>([^<]+)</i)
    || pick(html, /<h2[^>]*>([^<]+)<\/h2>/i) || 'Untitled role';
  const company = pick(html, /class="[^"]*topcard__org-name-link[^"]*"[^>]*>([^<]+)</i)
    || pick(html, /class="[^"]*topcard__flavor[^"]*"[^>]*>([^<]+)</i) || 'LinkedIn';
  const location = pick(html, /class="[^"]*topcard__flavor--bullet[^"]*"[^>]*>([^<]+)</i);
  const posted = pick(html, /datetime="([\d-]+)"/i);

  return {
    id: `linkedin:${id}`,
    source: 'linkedin',
    company,
    title,
    location,
    remote: /remote|work from home|anywhere/i.test(`${location} ${description}`),
    description: description.slice(0, 20_000),
    url: `https://www.linkedin.com/jobs/view/${id}`,
    postedAt: posted || null,
    compensation: null,
  };
}
