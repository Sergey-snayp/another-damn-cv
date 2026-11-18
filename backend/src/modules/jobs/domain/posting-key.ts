/**
 * A posting as Simplify tracks one across its pages: its site and its own job
 * number there (Avature's ?jobId=65847 on the application, /JobDetail/<title>/65847
 * on the job page). Pages of one application share it, so a form page finds the
 * job saved from its job page. Null when the address names no job number.
 */
const ID_PARAMS = ['jobId', 'jobid', 'job_id', 'jobID', 'gh_jid', 'jid', 'jobReqId', 'requisitionId', 'reqId', 'ashby_jid', 'pid'];

export interface PostingKey {
  host: string;
  id: string;
}

export function postingKey(raw: string): PostingKey | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.toLowerCase();
  for (const name of ID_PARAMS) {
    const value = url.searchParams.get(name)?.trim();
    if (value && /^[\w-]{3,80}$/.test(value)) return { host, id: value };
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (host === 'jobs.jobvite.com') {
    const at = parts.indexOf('job');
    if (at > 0 && parts[at + 1]) return { host, id: `${parts[at - 1]}/${parts[at + 1]}` };
  }
  if (['jobs.lever.co', 'jobs.eu.lever.co', 'jobs.ashbyhq.com'].includes(host) && parts.length >= 2) {
    return { host, id: `${parts[0]}/${parts[1]}` };
  }
  if (/(^|\.)myworkday(jobs|site)?\.com$/.test(host)) {
    const requisition = parts.map((part) => part.match(/_([A-Z]*-?\d[\w-]*)$/i)?.[1]).filter(Boolean).at(-1);
    if (requisition) return { host, id: requisition };
  }
  const id = [...parts]
    .reverse()
    .find((part) => /^\d{4,}$/.test(part) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part));
  return id ? { host, id } : null;
}

export const samePosting = (a: PostingKey | null, b: PostingKey | null) =>
  Boolean(a && b && a.host === b.host && a.id === b.id);
