import { NotSignedInError, lookupJob } from './jobs.js';
import { findKeywords, scoreCv } from './match.js';
import { cvTexts, fetchResumes } from './resumes.js';

const APPLIED = new Set(['applied', 'screening', 'interview', 'offer', 'accepted', 'rejected', 'declined']);
const MIN_DESCRIPTION = 200;

/**
 * What the match card on a job page shows, as Simplify's: nothing when signed
 * out or without a CV, "you applied" for a job already applied to (even with the
 * card hidden in Settings), else the chosen CV's keyword match for this job.
 */
export async function matchCardData({ url, title = '', description = '' }) {
  const { auth, matchCardHidden } = await chrome.storage.local.get(['auth', 'matchCardHidden']);
  if (!auth?.syncToken) return { show: false };
  try {
    const job = await lookupJob(url).catch((error) => { if (error instanceof NotSignedInError) throw error; return null; });
    if (job && (APPLIED.has(job.status) || job.appliedAt)) return { show: true, applied: { jobId: job.id, at: job.appliedAt ?? null } };
    if (matchCardHidden === true) return { show: false };
    const { items, chosen } = await fetchResumes();
    if (!chosen) return { show: false };
    if (String(description).trim().length < MIN_DESCRIPTION) return { show: true, message: 'No job description found on this page' };
    const keywords = findKeywords(`${title}\n${description}`);
    if (!keywords.length) return { show: true, message: 'No keywords found in this job description' };
    const text = (await cvTexts(items))[chosen.id];
    if (text === undefined) return { show: true, message: 'Your CV could not be read yet' };
    const { score, matched } = scoreCv(keywords, text);
    return { show: true, score, matched: matched.length, total: keywords.length };
  } catch (error) {
    if (error instanceof NotSignedInError) return { show: false };
    throw error;
  }
}
