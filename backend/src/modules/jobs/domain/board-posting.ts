/**
 * A job posting on a job board, found from its address, so the server can ask
 * the board when it was posted (as Simplify does: "Posted on 10/30/2026").
 *
 *   job-boards.greenhouse.io/boxinc/jobs/8267934      greenhouse boxinc 8267934
 *   jobs.lever.co/palantir/6ed76ce8-…                  lever      palantir 6ed76ce8-…
 *   jobs.ashbyhq.com/ramp/34413f8d-…                   ashby      ramp     34413f8d-…
 *   jobs.smartrecruiters.com/BoschGroup/744000159777230-intern   smartrecruiters …
 */
export type JobBoard = 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters';

export interface BoardPosting {
  board: JobBoard;
  /** The company's name on the board: Greenhouse board token, Lever site, Ashby org, SmartRecruiters company. */
  account: string;
  id: string;
  /** Greenhouse and Lever keep EU boards on their own hosts. */
  eu: boolean;
}

/** When the board says the job was posted, and last changed. ISO dates, or null when unknown. */
export interface PostingDates {
  posted: string | null;
  updated: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE = /^[A-Za-z0-9._-]{1,100}$/;

export function boardPosting(address: string): BoardPosting | null {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  const found = (board: JobBoard, account: string | undefined, id: string | undefined, eu = false) =>
    account && id && SAFE.test(account) && SAFE.test(id) ? { board, account, id, eu } : null;

  const greenhouse = /^(job-)?boards(\.eu)?\.greenhouse\.io$/.exec(host);
  if (greenhouse) {
    const eu = Boolean(greenhouse[2]);
    // Embedded application forms: /embed/job_app?for=boxinc&token=8267934
    if (parts[0] === 'embed')
      return found(
        'greenhouse',
        url.searchParams.get('for') ?? undefined,
        url.searchParams.get('token') ?? undefined,
        eu,
      );
    if (parts[1] === 'jobs' && /^\d+$/.test(parts[2] ?? ''))
      return found('greenhouse', parts[0], parts[2], eu);
    return null;
  }
  const lever = /^jobs(\.eu)?\.lever\.co$/.exec(host);
  if (lever) return UUID.test(parts[1] ?? '') ? found('lever', parts[0], parts[1], Boolean(lever[1])) : null;
  if (host === 'jobs.ashbyhq.com')
    return UUID.test(parts[1] ?? '') ? found('ashby', parts[0], parts[1]) : null;
  if (host === 'jobs.smartrecruiters.com') {
    const id = /^(\d{6,})(?:-|$)/.exec(parts[1] ?? '')?.[1];
    return found('smartrecruiters', parts[0], id);
  }
  return null;
}

/** "lever:eu:palantir/6ed7…": one posting, for remembering its dates. */
export const postingKey = (posting: BoardPosting) =>
  `${posting.board}:${posting.eu ? 'eu:' : ''}${posting.account}/${posting.id}`;
