import type { AssessmentProfileReader } from '../ports/assessment-profile';
import type { TailoringJobReader } from '../ports/tailoring';
import { TailoringError } from '../tailoring-error';
import {
  assessmentEvidence,
  assessmentHasSources,
  settledAssessment,
  type JobAssessment,
  type JobAssessmentDraft,
  type JobAssessmentInput,
} from '../../domain/job-assessment';

export interface JobAssessor {
  assess(input: JobAssessmentInput): Promise<JobAssessmentDraft>;
}

export type AssessedJob = JobAssessment & {
  basis: { source: 'profile'; profileRevision: number; jobId: string };
};

/** Read-only advice from the full saved Profile. No CV or PDF is read or written. */
export class AssessJobFit {
  private readonly cache = new Map<string, { expires: number; result: Promise<AssessedJob> }>();

  constructor(
    private readonly profiles: AssessmentProfileReader,
    private readonly jobs: TailoringJobReader,
    private readonly assessor: JobAssessor,
    private readonly now: () => number = Date.now,
  ) {}

  async execute(userId: string, jobId: string): Promise<AssessedJob> {
    // Ownership is checked on every call, including cache hits.
    const job = await this.jobs.getForTailoring(userId, jobId);
    const profile = await this.profiles.read(userId);
    if (!job.description?.trim())
      throw new TailoringError('invalid', 'Add a job description to get an application recommendation.');
    const input: JobAssessmentInput = {
      evidence: assessmentEvidence(profile.career),
      job: {
        title: job.title || job.pageTitle || 'This role',
        company: job.company,
        description: job.description.slice(0, 30000),
      },
      asOf: new Date(this.now()).toISOString().slice(0, 10),
    };
    const basis = { source: 'profile' as const, profileRevision: profile.revision, jobId };
    if (!input.evidence.trim())
      return {
        verdict: 'unclear',
        score: null,
        summary:
          'Your Profile has no career details to compare with this role yet. Add your experience, achievements and skills in Profile to get a useful recommendation.',
        strengths: [],
        gaps: [],
        questions: ['What relevant experience, achievements and skills should your Profile include?'],
        technologies: [],
        basis,
      };
    const key = JSON.stringify({ userId, basis, input });
    const existing = this.cache.get(key);
    if (existing && existing.expires > this.now()) return structuredClone(await existing.result);

    const entry = {
      expires: Infinity,
      result: (async (): Promise<AssessedJob> => {
        const assessment = await this.assessor.assess(input);
        if (!assessmentHasSources(assessment, input))
          throw new TailoringError(
            'unavailable',
            'The assessment could not be checked against your Profile and this posting. Try again.',
          );
        return { ...settledAssessment(assessment, input), basis };
      })(),
    };
    this.cache.set(key, entry);
    if (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value!);
    try {
      const result = await entry.result;
      entry.expires = this.now() + 5 * 60_000;
      return structuredClone(result);
    } catch (error) {
      if (this.cache.get(key) === entry) this.cache.delete(key);
      throw error;
    }
  }
}
