/**
 * Apply on LinkedIn opens the company's page in a new tab. Which new tab a
 * click opened: one opened from the clicked LinkedIn tab within a few seconds
 * of the click, before or after it (the click's message and the new tab can
 * reach the background in either order).
 */
export const LINKEDIN_PAIRING_MS = 15_000;

/** The new tab ({ tabId, opener, at }) the click ({ tabId, at }) opened, or null. */
export function tabOpenedBy(clicked, opened, now = Date.now()) {
  if (!clicked || now - clicked.at >= LINKEDIN_PAIRING_MS) return null;
  return opened.find((entry) => entry.opener === clicked.tabId && Math.abs(entry.at - clicked.at) < LINKEDIN_PAIRING_MS) ?? null;
}

/** One posting across its overview/apply URLs, without tracking parameters. */
export function handoffTarget(raw) {
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = '';
    const knownPosting = url.hostname === 'jobs.jobvite.com' ? /\/job\/[^/]+/.test(url.pathname)
      : ['jobs.lever.co', 'jobs.ashbyhq.com'].includes(url.hostname) && /^\/[^/]+\/[^/]+/.test(url.pathname);
    if (knownPosting) {
      url.pathname = url.pathname.replace(/\/(?:apply|application)(?:\/.*)?$/, '').replace(/\/$/, '');
      url.search = '';
    } else {
      for (const key of [...url.searchParams.keys()])
        if (/^(?:utm_|trk|tracking|referrer|ref$|source$|gh_src$)/i.test(key)) url.searchParams.delete(key);
      url.searchParams.sort();
    }
    return url.href;
  } catch { return null; }
}

/** Where a posting names itself in its address, on any site: its own job number. */
const ID_PARAMS = ['jobId', 'jobid', 'job_id', 'jobID', 'gh_jid', 'jid', 'jobReqId', 'requisitionId', 'reqId', 'ashby_jid', 'pid'];

/**
 * A posting as Simplify tracks one: its site and its own job number there, the
 * same on every page of its application (Avature's job page
 * /JobDetail/<title>/65847, then ApplicationMethods?jobId=65847, then the form;
 * Workday's ..._JR26638, then .../apply). `id` is null when the address names none.
 */
export function postingOf(raw) {
  let url;
  try { url = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  for (const name of ID_PARAMS) {
    const value = url.searchParams.get(name)?.trim();
    if (value) return { host, id: value };
  }
  const parts = url.pathname.split('/').filter(Boolean);
  // One site, many companies: the company is part of the posting.
  if (host === 'jobs.jobvite.com') {
    const at = parts.indexOf('job');
    if (at > 0 && parts[at + 1]) return { host, id: `${parts[at - 1]}/${parts[at + 1]}` };
  }
  if (['jobs.lever.co', 'jobs.eu.lever.co', 'jobs.ashbyhq.com'].includes(host) && parts.length >= 2) return { host, id: `${parts[0]}/${parts[1]}` };
  // Workday: .../job/<place>/<Title>_JR26638 and its /apply pages.
  if (/(^|\.)myworkday(jobs|site)?\.com$/.test(host)) {
    const requisition = parts.map((part) => part.match(/_([A-Z]*-?\d[\w-]*)$/i)?.[1]).filter(Boolean).at(-1);
    if (requisition) return { host, id: requisition };
  }
  // A job number or UUID in the path (Avature's /JobDetail/<title>/65847, Greenhouse's /jobs/4567).
  const id = [...parts].reverse().find((part) => /^\d{4,}$/.test(part) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part));
  return { host, id: id ?? null };
}

/**
 * The LinkedIn job this tab was opened for, on every page of that posting's
 * application: same site, and the same job number wherever the page names one.
 * Another posting (another number, or another site) never gets it. Read again
 * on capture: the panel may have opened before the Apply handoff arrived.
 */
export async function linkedInJobForTab(tab) {
  if (!Number.isInteger(tab?.id) || !chrome.storage.session) return null;
  const posting = postingOf(tab.jobUrl || tab.url);
  if (!posting || /(^|\.)linkedin\.com$/i.test(posting.host)) return null;
  const key = `fromLinkedIn:${tab.id}`;
  const { [key]: carried } = await chrome.storage.session.get(key).catch(() => ({}));
  if (!carried?.job || Date.now() - carried.at > 12 * 3600_000) return null;
  const bound = carried.posting;
  if (bound) {
    if (bound.host !== posting.host) return null;
    if (bound.id && posting.id && bound.id !== posting.id) return null;
    // The first page named no number (a landing page); the posting's own pages do.
    if (!bound.id && posting.id) await chrome.storage.session.set({ [key]: { ...carried, posting } }).catch(() => {});
    return carried.job;
  }
  if (carried.host && carried.host !== posting.host) return null;
  await chrome.storage.session.set({ [key]: { ...carried, host: posting.host, posting } }).catch(() => {});
  return carried.job;
}
