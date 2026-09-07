import { parse } from 'yaml';
import { getLlm, extractJson } from '../llm/index.js';
import { loadMasterRaw } from '../config.js';
import type { RawJob, TailoredResume } from '../types.js';
import { diffAgainstMaster, type ResumeDiff } from './diff.js';

const SYSTEM = `You tailor an existing resume to a specific job posting.

ABSOLUTE RULES — violating any of these makes the output unusable:
- You may ONLY use facts present in the provided master profile.
- NEVER invent or alter a company, job title, employment date, degree, or metric.
- NEVER add a technology to a role unless that role already lists it in the master profile.
- NEVER inflate seniority or claim years of experience beyond what the profile states.

What you SHOULD do:
- Reorder and select: lead with the experience and skills the posting cares about.
- Rephrase bullets to mirror the posting's vocabulary, when the underlying fact already matches.
  ("built integrations with Mastercard and Visa token networks" may become "delivered
  card-network integrations across Mastercard and Visa" — same fact, the posting's words.)
- Drop bullets that are irrelevant to this posting. Cutting is preferred over padding.
- Keep every bullet to one or two lines. Concrete over generic.`;

/** Collect every token that legitimately appears in the master profile. */
function allowedVocabulary(masterRaw: string): Set<string> {
  const m = parse(masterRaw) as Record<string, unknown>;
  const words = new Set<string>();
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      for (const w of v.toLowerCase().match(/[a-z0-9][a-z0-9+.#/-]*/g) ?? []) words.add(w);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(m);
  return words;
}

/** Technologies we specifically care about not being fabricated into the resume. */
const TECH_WATCHLIST = [
  'java', 'kotlin', 'swift', 'golang', 'go', 'rust', 'scala', 'ruby', 'rails', 'php',
  'laravel', 'python', 'django', 'flask', 'c#', '.net', 'dotnet', 'spring', 'hadoop',
  'spark', 'tensorflow', 'pytorch', 'kubeflow', 'salesforce', 'sap', 'azure', 'gcp',
  'flutter', 'dart', 'vue', 'angular', 'svelte', 'ember', 'symfony', 'perl', 'clojure',
];

export interface VerificationIssue { kind: 'company' | 'title' | 'tech'; detail: string }

/**
 * Deterministic check that the model stayed inside the master profile.
 * Prompts are guidance; this is the actual guarantee.
 */
export function verify(t: TailoredResume, masterRaw: string): VerificationIssue[] {
  const master = parse(masterRaw) as {
    experience: { company: string; title: string }[];
  };
  const issues: VerificationIssue[] = [];
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const realCompanies = new Set(master.experience.map((e) => norm(e.company)));
  const realTitles = new Set(master.experience.map((e) => norm(e.title)));
  for (const e of t.experience) {
    if (!realCompanies.has(norm(e.company))) {
      issues.push({ kind: 'company', detail: `"${e.company}" is not in the master profile` });
    }
    if (!realTitles.has(norm(e.title))) {
      issues.push({ kind: 'title', detail: `"${e.title}" at ${e.company} is not a real title` });
    }
  }

  const vocab = allowedVocabulary(masterRaw);
  const body = [
    t.summary, ...t.skillGroups.flatMap((g) => g.items),
    ...t.experience.flatMap((e) => e.bullets),
  ].join(' ').toLowerCase();
  for (const tech of TECH_WATCHLIST) {
    const present = new RegExp(`(^|[^a-z0-9])${tech.replace(/[.#+]/g, '\\$&')}([^a-z0-9]|$)`).test(body);
    if (present && !vocab.has(tech)) {
      issues.push({ kind: 'tech', detail: `"${tech}" appears in the resume but not in your profile` });
    }
  }
  return issues;
}

export interface TailorResult {
  content: TailoredResume;
  issues: VerificationIssue[];
  /** Application advice — what to stress, what to expect to be challenged on. */
  recommendations: string[];
  /** What this CV changed relative to the master profile. */
  diff: ResumeDiff;
}

/** The model returns the resume and the advice together; they are split on arrival. */
type TailorPayload = TailoredResume & { recommendations?: string[] };

export async function tailorResume(job: RawJob): Promise<TailorResult> {
  const masterRaw = loadMasterRaw();
  const llm = getLlm();

  const prompt = `<master_profile>
${masterRaw}
</master_profile>

<job_posting>
company: ${job.company}
title: ${job.title}
location: ${job.location}
${job.description.slice(0, 6000)}
</job_posting>

Produce a resume tailored to this posting. Return ONLY JSON matching this shape:
{
  "headline": "one line under the name, tuned to the posting",
  "summary": "3-4 sentences, first-person-implied, no 'I'",
  "skillGroups": [{"label":"Languages","items":["..."]}],
  "experience": [{
    "company":"<exactly as in master>","title":"<exactly as in master>",
    "dates":"Mon YYYY - Mon YYYY | Present","context":"optional one-line project framing",
    "bullets":["..."]
  }],
  "keywordsCovered": ["posting terms you legitimately hit"],
  "recommendations": ["3-5 short, specific pieces of advice — see below"]
}

Include every role from the master profile, most recent first — vary bullet count by relevance
(4-5 bullets for the roles this posting cares about, 2-3 for older ones). Order skillGroups so
the posting's priorities come first.

For "recommendations", give 3-5 short lines (one sentence each) that are useful to a person
about to apply. Be candid rather than encouraging — a real gap named early is worth more than
reassurance. Cover what genuinely applies:
- the strongest angle to lead with, and why this posting rewards it
- any requirement the profile does not meet, and the honest way to handle it
- something concrete to add or verify before sending
- whether this role is worth the application at all, if it plainly is not
Do not repeat the resume back. No generic advice ("tailor your resume", "be confident").`;

  const text = await llm.complete(prompt, { system: SYSTEM, maxTokens: 6000 });
  const { recommendations = [], ...content } = extractJson<TailorPayload>(text);
  return {
    content,
    issues: verify(content, masterRaw),
    recommendations,
    diff: diffAgainstMaster(content, masterRaw),
  };
}
