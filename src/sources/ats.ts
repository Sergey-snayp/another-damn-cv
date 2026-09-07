import type { RawJob } from '../types.js';
import type { CompanyEntry } from '../config.js';

const UA = 'job-agent/0.1 (personal job search)';

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

const stripHtml = (s: string): string =>
  s.replace(/<[^>]+>/g, ' ')
   .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
   .replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
   .replace(/\s+/g, ' ').trim();

const looksRemote = (s: string): boolean => /remote|anywhere|distributed|work from home/i.test(s);

// --- Greenhouse -------------------------------------------------------------
export const greenhouseUrl = (t: string) =>
  `https://boards-api.greenhouse.io/v1/boards/${t}/jobs?content=true`;

export async function fetchGreenhouse(c: CompanyEntry): Promise<RawJob[]> {
  const data = (await getJson(greenhouseUrl(c.token))) as {
    jobs?: { id: number; title: string; location?: { name?: string }; content?: string;
             absolute_url: string; updated_at?: string }[];
  };
  return (data.jobs ?? []).map((j) => {
    const location = j.location?.name ?? '';
    // Greenhouse double-encodes `content`, so strip twice.
    const description = stripHtml(stripHtml(j.content ?? ''));
    return {
      id: `greenhouse:${c.token}:${j.id}`, source: 'greenhouse', company: c.name,
      title: j.title, location, remote: looksRemote(`${location} ${j.title}`),
      description, url: j.absolute_url, postedAt: j.updated_at ?? null, compensation: null,
    };
  });
}

// --- Lever ------------------------------------------------------------------
export const leverUrl = (t: string) => `https://api.lever.co/v0/postings/${t}?mode=json`;

export async function fetchLever(c: CompanyEntry): Promise<RawJob[]> {
  const data = (await getJson(leverUrl(c.token))) as {
    id: string; text: string; hostedUrl: string; createdAt?: number;
    categories?: { location?: string; commitment?: string };
    descriptionPlain?: string; description?: string;
    lists?: { text: string; content: string }[];
  }[];
  return (data ?? []).map((j) => {
    const location = j.categories?.location ?? '';
    const lists = (j.lists ?? []).map((l) => `${l.text}: ${stripHtml(l.content)}`).join('\n');
    const description = `${j.descriptionPlain ?? stripHtml(j.description ?? '')}\n${lists}`.trim();
    return {
      id: `lever:${c.token}:${j.id}`, source: 'lever', company: c.name,
      title: j.text, location, remote: looksRemote(`${location} ${j.text}`),
      description, url: j.hostedUrl,
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null, compensation: null,
    };
  });
}

// --- Ashby ------------------------------------------------------------------
export const ashbyUrl = (t: string) =>
  `https://api.ashbyhq.com/posting-api/job-board/${t}?includeCompensation=true`;

export async function fetchAshby(c: CompanyEntry): Promise<RawJob[]> {
  const data = (await getJson(ashbyUrl(c.token))) as {
    jobs?: { id: string; title: string; location?: string; isRemote?: boolean;
             descriptionPlain?: string; descriptionHtml?: string; jobUrl: string;
             publishedAt?: string; isListed?: boolean;
             compensation?: { compensationTierSummary?: string } }[];
  };
  return (data.jobs ?? [])
    .filter((j) => j.isListed !== false)
    .map((j) => ({
      id: `ashby:${c.token}:${j.id}`, source: 'ashby', company: c.name,
      title: j.title, location: j.location ?? '',
      remote: j.isRemote === true || looksRemote(j.location ?? ''),
      description: j.descriptionPlain ?? stripHtml(j.descriptionHtml ?? ''),
      url: j.jobUrl, postedAt: j.publishedAt ?? null,
      compensation: j.compensation?.compensationTierSummary ?? null,
    }));
}

const FETCHERS = {
  greenhouse: fetchGreenhouse, lever: fetchLever, ashby: fetchAshby,
} as const;

export async function fetchCompany(c: CompanyEntry): Promise<RawJob[]> {
  if (c.ats === 'unknown') return [];
  return FETCHERS[c.ats](c);
}

/** Probe a token against all three providers; returns whichever answers with jobs. */
export async function detectAts(token: string): Promise<{ ats: keyof typeof FETCHERS; count: number } | null> {
  const probes: [keyof typeof FETCHERS, string][] = [
    ['greenhouse', greenhouseUrl(token)], ['lever', leverUrl(token)], ['ashby', ashbyUrl(token)],
  ];
  for (const [ats, url] of probes) {
    try {
      const data = (await getJson(url)) as unknown;
      const jobs = Array.isArray(data) ? data : ((data as { jobs?: unknown[] })?.jobs ?? []);
      if (Array.isArray(jobs) && jobs.length > 0) return { ats, count: jobs.length };
    } catch { /* 404 just means "not this provider" */ }
  }
  return null;
}
