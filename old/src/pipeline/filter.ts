import type { RawJob } from '../types.js';
import type { SearchPrefs } from '../config.js';

export interface Rejection { job: RawJob; reason: string }
export interface FilterResult { kept: RawJob[]; rejected: Rejection[] }

const has = (hay: string, needles: string[]): boolean =>
  needles.some((n) => hay.includes(n.toLowerCase()));

/**
 * Deterministic gate applied before any LLM call. Everything here is a
 * knock-out rule: cheap, explainable, and tunable from profile/search.yaml.
 */
export function hardFilter(jobs: RawJob[], prefs: SearchPrefs, now = new Date()): FilterResult {
  const kept: RawJob[] = [];
  const rejected: Rejection[] = [];

  for (const job of jobs) {
    const title = job.title.toLowerCase();
    const loc = job.location.toLowerCase();
    const desc = job.description.toLowerCase();

    if (has(title, prefs.titles_exclude)) {
      rejected.push({ job, reason: 'title excluded' }); continue;
    }
    if (!has(title, prefs.titles_include)) {
      rejected.push({ job, reason: 'title not a match' }); continue;
    }
    if (!has(desc, prefs.stack_required_any)) {
      rejected.push({ job, reason: 'stack mismatch' }); continue;
    }

    // Location: allow if the location string matches, or it's remote and the
    // description doesn't scope that remoteness to a region he can't work in.
    const locOk = has(loc, prefs.locations.allow);
    const scoped = has(desc, prefs.locations.deny_remote_scoped_to);
    if (scoped) { rejected.push({ job, reason: 'remote scoped elsewhere' }); continue; }
    if (!locOk && !job.remote) { rejected.push({ job, reason: `location: ${job.location}` }); continue; }

    if (job.postedAt) {
      const age = (now.getTime() - new Date(job.postedAt).getTime()) / 86_400_000;
      if (age > prefs.freshness_days) { rejected.push({ job, reason: `stale (${Math.round(age)}d)` }); continue; }
    }

    kept.push(job);
  }
  return { kept, rejected };
}
