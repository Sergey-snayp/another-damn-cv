/**
 * One URL per job, however you arrived at it.
 *
 * The same posting is reachable from a search page, a share link and a
 * recommendation email, each with its own tracking noise. Saving it twice
 * should update it, so every URL is reduced to the one form a job has.
 */

/** Parameters that say how you got here, never which job it is. */
const TRACKING = new Set([
  'gclid', 'fbclid', 'msclkid', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi',
  'ref', 'referrer', 'refid', 'trk', 'trkinfo', 'trackingid', 'lipi',
  'lever-source', 'lever-origin', 'gh_src', 'ashby_jid_source',
]);

export function canonicalUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const host = url.hostname.toLowerCase();

  // LinkedIn: a search page shows the job as ?currentJobId=, the job page
  // carries it at the end of the slug. Both are the same posting.
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
    const id = url.searchParams.get('currentJobId')
      ?? url.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d+)\/?$/)?.[1];
    if (id && /^\d+$/.test(id)) return `https://www.linkedin.com/jobs/view/${id}`;
  }

  // Indeed: jk on the job page, vjk when it is open beside a search.
  if (/(^|\.)indeed\.[a-z.]+$/.test(host)) {
    const id = url.searchParams.get('jk') ?? url.searchParams.get('vjk');
    if (id && /^[a-z0-9]+$/i.test(id)) return `https://${host}/viewjob?jk=${id}`;
  }

  url.hash = '';
  url.hostname = host;

  // The apply form of a posting is the same posting.
  if (host === 'jobs.lever.co') url.pathname = url.pathname.replace(/\/apply\/?$/, '');
  if (host === 'jobs.ashbyhq.com') url.pathname = url.pathname.replace(/\/application\/?$/, '');

  const kept = [...url.searchParams]
    .filter(([key]) => !key.toLowerCase().startsWith('utm_') && !TRACKING.has(key.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b));
  url.search = new URLSearchParams(kept).toString();

  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');

  return url.toString();
}
