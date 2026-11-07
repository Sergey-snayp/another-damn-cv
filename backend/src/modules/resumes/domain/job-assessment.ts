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
  }>;
  educations: Array<{ institution: string; degree: string; field: string }>;
  skills: string[];
}

export type AssessmentVerdict = 'apply' | 'stretch' | 'skip' | 'unclear';

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
}

/** A technology the posting names, and whether the Profile shows it (worked out in code). */
export interface AssessedTechnology {
  name: string;
  inProfile: boolean;
}

export interface JobAssessment extends Omit<JobAssessmentDraft, 'technologies'> {
  technologies: AssessedTechnology[];
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

/** The AI's draft as shown: the score kept inside its verdict, technologies checked against both texts. */
export function settledAssessment(draft: JobAssessmentDraft, input: JobAssessmentInput): JobAssessment {
  return {
    ...draft,
    score: scoreForVerdict(draft.verdict, draft.score),
    technologies: technologiesFor(draft.technologies, input),
  };
}
