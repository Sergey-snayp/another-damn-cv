import { loadCompanies, loadSearch } from '../config.js';
import { fetchCompany } from '../sources/ats.js';
import { upsertJobs, saveScore, unscored } from '../store/db.js';
import { hardFilter } from './filter.js';
import { scoreJobs } from './score.js';
import type { RawJob } from '../types.js';

export interface HarvestReport {
  fetched: number; fresh: number; kept: number; scored: number;
  errors: string[]; rejectionReasons: Record<string, number>;
}

/** Bounded concurrency — these are other people's servers. */
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      if (item !== undefined) out.push(await fn(item));
    }
  }));
  return out;
}

export async function harvest(log = console.log): Promise<HarvestReport> {
  const companies = loadCompanies().filter((c) => c.ats !== 'unknown');
  const prefs = loadSearch();
  const errors: string[] = [];

  log(`Fetching ${companies.length} boards...`);
  const batches = await pool(companies, 6, async (c): Promise<RawJob[]> => {
    try { return await fetchCompany(c); }
    catch (e) { errors.push(`${c.name}: ${(e as Error).message}`); return []; }
  });
  const all = batches.flat();

  const fresh = upsertJobs(all);
  log(`  ${all.length} postings, ${fresh.length} new since last run`);

  const { kept, rejected } = hardFilter(fresh, prefs);
  const rejectionReasons: Record<string, number> = {};
  for (const r of rejected) rejectionReasons[r.reason] = (rejectionReasons[r.reason] ?? 0) + 1;
  log(`  ${kept.length} passed hard filters`);

  // Re-score anything left unscored by an earlier failed run, not just today's batch.
  const keptIds = new Set(kept.map((k) => k.id));
  const pending = [...kept, ...unscored().filter((j) => !keptIds.has(j.id) && matchesKept(j, prefs))];

  let scored = 0;
  if (pending.length > 0) {
    log(`  scoring ${pending.length} with the model...`);
    const results = await scoreJobs(pending, (d, t) => log(`    ${d}/${t}`));
    for (const s of results) { saveScore(s); scored++; }
  }
  return { fetched: all.length, fresh: fresh.length, kept: kept.length, scored, errors, rejectionReasons };
}

const matchesKept = (j: RawJob, prefs: ReturnType<typeof loadSearch>): boolean =>
  hardFilter([j], prefs).kept.length === 1;
