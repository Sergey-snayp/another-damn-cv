import { getLlm, extractJson } from '../llm/index.js';
import { loadMasterRaw } from '../config.js';
import type { RawJob, ScoredJob } from '../types.js';

const SYSTEM = `You are a precise technical recruiter screening roles for one specific engineer.
You are blunt and calibrated: most postings are mediocre fits and should score below 60.
Reserve 85+ for roles where the candidate is an obviously strong applicant.
You never inflate scores to be encouraging.`;

const BATCH = 8;
// Only a handful of postings reach the model each day, so a wider window is
// cheap insurance against the requirements sitting past the cut.
const DESC_CHARS = 5000;

function buildPrompt(profile: string, batch: RawJob[]): string {
  const jobs = batch.map((j, i) => `
### JOB ${i + 1}
id: ${j.id}
title: ${j.title}
company: ${j.company}
location: ${j.location}${j.remote ? ' (remote)' : ''}
compensation: ${j.compensation ?? 'not stated'}
description: ${j.description.slice(0, DESC_CHARS)}`).join('\n');

  return `Here is the candidate profile (YAML):

<profile>
${profile}
</profile>

Score each job below from 0-100 on how good a fit it is FOR THIS CANDIDATE.

Weigh, in order of importance:
1. Stack overlap with the candidate's actual depth (Node/TypeScript/NestJS/React/AWS).
2. Seniority fit — he is a senior IC with 7+ years. Junior roles and people-management roles score low.
3. Whether he can legally and practically hold it from Vancouver, BC.
4. Domain bonus — payments, fintech, BFSI, high-load/event-driven systems are his differentiators.
5. Penalise heavy requirements he lacks: Go, Rust, Java, .NET, PHP, Ruby, ML/data-science depth,
   deep mobile-native (Swift/Kotlin), or security clearance requirements.

RULES FOR "gaps" — these are read by the candidate himself, so accuracy matters:
- A gap is something THIS POSTING REQUIRES that the candidate's profile does not show.
  Write it from the requirement's side: "Requires expert Python; profile shows none".
- NEVER state he lacks something the profile contains. He has payments/BFSI (Ciklum,
  Paymorrow/Verifone), TLS/PKI, card tokenization, AWS, Node/TypeScript, React and
  microservices — claiming otherwise is a factual error, not a judgement call.
- A role simply not using his differentiators is NOT a gap. That belongs in the score
  and the verdict, never in the gaps list.
- Facts about the LISTING rather than the candidate — thin description, unclear stack,
  no salary — belong in the verdict, not in gaps.
- If the description is too sparse to judge, say so in the verdict, score conservatively,
  and return fewer gaps rather than inventing them.

Return ONLY a JSON array, one object per job, no prose:
[{"id":"<the id verbatim>","score":<0-100>,"verdict":"<one sentence, max 20 words>",
  "matches":["<=4 concrete overlaps"],"gaps":["<=3 concrete mismatches, per the rules above"]}]
${jobs}`;
}

export async function scoreJobs(
  jobs: RawJob[],
  onProgress?: (done: number, total: number) => void,
): Promise<ScoredJob[]> {
  if (jobs.length === 0) return [];
  const llm = getLlm();
  const profile = loadMasterRaw();
  const out: ScoredJob[] = [];

  for (let i = 0; i < jobs.length; i += BATCH) {
    const batch = jobs.slice(i, i + BATCH);
    try {
      const text = await llm.complete(buildPrompt(profile, batch), { system: SYSTEM, maxTokens: 3000 });
      const parsed = extractJson<{ id: string; score: number; verdict: string;
                                   matches?: string[]; gaps?: string[] }[]>(text);
      const byId = new Map(parsed.map((p) => [p.id, p]));
      for (const job of batch) {
        const p = byId.get(job.id);
        // A job the model skipped stays unscored rather than silently scoring 0.
        if (!p) continue;
        out.push({
          ...job,
          score: Math.max(0, Math.min(100, Math.round(p.score))),
          verdict: p.verdict ?? '',
          matches: p.matches ?? [],
          gaps: p.gaps ?? [],
        });
      }
    } catch (e) {
      console.error(`  scoring batch ${i / BATCH + 1} failed: ${(e as Error).message}`);
    }
    onProgress?.(Math.min(i + BATCH, jobs.length), jobs.length);
  }
  return out;
}
