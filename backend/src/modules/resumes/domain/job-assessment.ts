export interface AssessmentCareer {
  summary: string;
  experiences: Array<{
    title: string;
    company: string;
    client: string;
    location: string;
    from: string;
    to: string;
    current: boolean;
    description: string;
    bullets: string[];
    techStack?: string;
  }>;
  educations: Array<{ institution: string; degree: string; field: string }>;
  skills: string[];
}

export type AssessmentVerdict = 'apply' | 'stretch' | 'skip' | 'unclear';

export type RequirementTier = 'must' | 'nice';
/** have: the Profile shows it; close: a close equivalent (`from`); missing: not shown. */
export type RequirementStatus = 'have' | 'close' | 'missing';

/** One thing the posting asks for, checked against the Profile. */
export interface RequirementDraft {
  name: string;
  tier: RequirementTier;
  status: RequirementStatus;
  /** For close: what the candidate has instead ("Node.js" for "Laravel / PHP"). */
  from?: string | null;
  /** Exact posting text that asks for it. */
  jobQuote: string;
  /** Exact Profile text that shows it (have) or its equivalent (close). */
  profileQuote?: string | null;
}

/** Facts about the job as the posting states them; null when it doesn't. */
export interface JobFacts {
  workMode: string | null;
  location: string | null;
  salary: string | null;
  applyBy: string | null;
}

/** What the AI answers: its opinion plus the technology names the posting uses. */
export interface JobAssessmentDraft {
  verdict: AssessmentVerdict;
  /** 0 to 10: how worth applying. Not a hiring probability. */
  score: number | null;
  /** A concise opinion, not a hiring probability. */
  summary: string;
  strengths: Array<{ point: string; jobQuote: string; profileQuote: string }>;
  gaps: Array<{ point: string; jobQuote: string; importance: 'required' | 'preferred' }>;
  questions: string[];
  technologies: string[];
  /** The answer in one sentence. */
  headline?: string;
  requirements?: RequirementDraft[];
  /** One thing to do if they apply. */
  advice?: string | null;
  /** A hard requirement the Profile cannot meet; only with a skip verdict. */
  dealbreaker?: { point: string; jobQuote: string } | null;
  facts?: Partial<JobFacts> | null;
}

/** A technology the posting names, and whether the Profile shows it (worked out in code). */
export interface AssessedTechnology {
  name: string;
  inProfile: boolean;
}

export interface Requirement {
  name: string;
  tier: RequirementTier;
  status: RequirementStatus;
  from: string | null;
  jobQuote: string;
}

export interface JobAssessment
  extends Omit<JobAssessmentDraft, 'technologies' | 'headline' | 'requirements' | 'advice' | 'dealbreaker' | 'facts'> {
  technologies: AssessedTechnology[];
  headline: string;
  requirements: Requirement[];
  advice: string | null;
  dealbreaker: { point: string; jobQuote: string } | null;
  facts: JobFacts;
}

export interface JobAssessmentInput {
  job: { title: string; company: string | null; description: string };
  evidence: string;
  asOf: string;
}

/** Professional evidence only: contact names and email addresses do not inform fit. */
export function assessmentEvidence(profile: AssessmentCareer): string {
  const lines: string[] = [];
  if (profile.summary.trim()) lines.push(`Summary: ${profile.summary}`);
  for (const role of profile.experiences) {
    lines.push(
      `Role: ${role.title} at ${role.company} (${role.from} to ${role.current ? 'present' : (role.to ?? '')})`,
    );
    if (role.client) lines.push(`Client: ${role.client}`);
    if (role.location) lines.push(`Role location: ${role.location}`);
    if (role.description) lines.push(role.description);
    lines.push(...role.bullets);
    if (role.techStack?.trim()) lines.push(`Tech stack: ${role.techStack.trim()}`);
  }
  for (const row of profile.educations)
    lines.push(`Education: ${[row.degree, row.field, row.institution].filter(Boolean).join(', ')}`);
  if (profile.skills.length) lines.push(`Listed skills: ${profile.skills.join(', ')}`);
  return lines.filter((line) => line.trim()).join('\n');
}

const normalized = (text: string) => text.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

/** Every supporting quote must actually occur in the supplied posting/Profile. */
export function assessmentHasSources(answer: JobAssessmentDraft, input: JobAssessmentInput): boolean {
  const profile = normalized(input.evidence),
    job = normalized(input.job.description);
  const quoteIn = (quote: string, source: string) =>
    normalized(quote).length >= 3 && source.includes(normalized(quote));
  return (
    answer.strengths.every((item) => quoteIn(item.profileQuote, profile) && quoteIn(item.jobQuote, job)) &&
    answer.gaps.every((item) => quoteIn(item.jobQuote, job)) &&
    (answer.verdict === 'unclear' || answer.strengths.length + answer.gaps.length > 0)
  );
}

/** The scores each verdict allows, so the number and the words always agree. */
const SCORE_BANDS: Record<Exclude<AssessmentVerdict, 'unclear'>, [number, number]> = {
  apply: [7, 10],
  stretch: [4, 6],
  skip: [0, 3],
};

/** A whole 0 to 10 score inside the verdict's band; none when the verdict is unclear. */
export function scoreForVerdict(verdict: AssessmentVerdict, score: number | null): number | null {
  if (verdict === 'unclear') return null;
  const [low, high] = SCORE_BANDS[verdict];
  if (score === null || !Number.isFinite(score)) return Math.round((low + high) / 2);
  return Math.min(high, Math.max(low, Math.round(score)));
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The name as a whole term: "Java" is not found inside "JavaScript". */
export function mentions(text: string, name: string): boolean {
  const term = normalized(name);
  return (
    term.length > 0 &&
    new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, 'u').test(normalized(text))
  );
}

const MAX_TECHNOLOGIES = 15;

/**
 * The posting's technologies, each marked by whether the Profile mentions it.
 * Names the posting does not contain are dropped, so the AI cannot add any.
 */
export function technologiesFor(names: string[], input: JobAssessmentInput): AssessedTechnology[] {
  const seen = new Set<string>();
  const result: AssessedTechnology[] = [];
  for (const raw of names) {
    const name = raw.trim();
    const key = normalized(name);
    if (!name || name.length > 40 || seen.has(key) || !mentions(input.job.description, name)) continue;
    seen.add(key);
    result.push({ name, inProfile: mentions(input.evidence, name) });
    if (result.length === MAX_TECHNOLOGIES) break;
  }
  return result;
}

const MAX_REQUIREMENTS: Record<RequirementTier, number> = { must: 8, nice: 5 };
const quoted = (quote: string | null | undefined, source: string) =>
  !!quote && normalized(quote).length >= 3 && normalized(source).includes(normalized(quote));

/**
 * The posting's requirements as a checklist. A requirement the posting doesn't say is dropped;
 * "you have it" or "close" needs exact Profile text, otherwise it counts as not shown.
 */
export function requirementsFor(drafts: RequirementDraft[], input: JobAssessmentInput): Requirement[] {
  const seen = new Set<string>();
  const count: Record<RequirementTier, number> = { must: 0, nice: 0 };
  const result: Requirement[] = [];
  for (const draft of drafts) {
    const name = draft.name.trim();
    const key = normalized(name);
    if (!name || name.length > 60 || seen.has(key) || count[draft.tier] >= MAX_REQUIREMENTS[draft.tier]) continue;
    if (!quoted(draft.jobQuote, input.job.description)) continue;
    const shown = draft.status !== 'missing' && quoted(draft.profileQuote, input.evidence);
    const status: RequirementStatus = shown ? draft.status : 'missing';
    const from = status === 'close' && draft.from?.trim() && mentions(input.evidence, draft.from.trim()) ? draft.from.trim() : null;
    seen.add(key);
    count[draft.tier] += 1;
    result.push({ name, tier: draft.tier, status, from, jobQuote: draft.jobQuote });
  }
  // Must-haves first, each tier in the AI's order.
  return [...result.filter((item) => item.tier === 'must'), ...result.filter((item) => item.tier === 'nice')];
}

/** A fact only when the posting says it: the text must appear in the posting. */
export function factsFor(facts: Partial<JobFacts> | null | undefined, input: JobAssessmentInput): JobFacts {
  const keep = (value: string | null | undefined) => {
    const text = value?.trim();
    return text && text.length <= 80 && quoted(text, input.job.description) ? text : null;
  };
  return {
    workMode: keep(facts?.workMode),
    location: keep(facts?.location),
    salary: keep(facts?.salary),
    applyBy: keep(facts?.applyBy),
  };
}

/** The first sentence of the summary, when the AI gives no headline. */
const firstSentence = (text: string) => text.match(/^.*?[.!?](?=\s|$)/s)?.[0] ?? text;

/** The AI's draft as shown: the score kept inside its verdict, every claim checked against both texts. */
export function settledAssessment(draft: JobAssessmentDraft, input: JobAssessmentInput): JobAssessment {
  const dealbreaker =
    draft.verdict === 'skip' && draft.dealbreaker && quoted(draft.dealbreaker.jobQuote, input.job.description)
      ? draft.dealbreaker
      : null;
  return {
    ...draft,
    score: scoreForVerdict(draft.verdict, draft.score),
    technologies: technologiesFor(draft.technologies, input),
    headline: draft.headline?.trim() || firstSentence(draft.summary.trim()),
    requirements: requirementsFor(draft.requirements ?? [], input),
    advice: draft.advice?.trim() || null,
    dealbreaker,
    facts: factsFor(draft.facts, input),
  };
}
