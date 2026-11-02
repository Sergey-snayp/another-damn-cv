import { JobNotFoundError, type JobsApi } from '../../../../jobs/contracts';
import { ResumeError, type ResumesApi } from '../../../../resumes/contracts';
import { emptyPreparation, PreparationNotFoundError } from '../../../domain/preparation';
import type { PracticeContext, PracticeEvidence } from '../../../domain/practice';
import type { PracticeContextReader } from '../../../application/ports/practice';
import type { PreparationRepository } from '../../../application/ports/preparation';

export class PublicPracticeContextReader implements PracticeContextReader {
  constructor(
    private readonly jobs: Pick<JobsApi, 'getForPreparation'>,
    private readonly resumes: Pick<ResumesApi, 'atSnapshot'>,
    private readonly preparations: PreparationRepository,
  ) {}
  async read(userId: string, jobId: string): Promise<PracticeContext> {
    const job = await this.jobs.getForPreparation(userId, jobId).catch((error: unknown) => {
      if (error instanceof JobNotFoundError) throw new PreparationNotFoundError();
      throw error;
    });
    const prep = (await this.preparations.read(userId, jobId)) ?? emptyPreparation(jobId);
    const evidence: PracticeEvidence[] = [];
    let cv: PracticeContext['cv'] = null;
    if (job.applicationResumeId && job.applicationSnapshot) {
      try {
        const resume = await this.resumes.atSnapshot(
          userId,
          job.applicationResumeId,
          job.applicationSnapshot,
        );
        cv = { id: job.applicationResumeId, snapshot: resume.snapshot };
        Object.entries(resume.summaries).forEach(([variant, text], index) => {
          if (text.trim())
            evidence.push({
              id: `cv-summary-${index}`,
              source: 'cv',
              label: `CV summary (${variant})`,
              text,
            });
        });
        resume.experiences.forEach((role, i) => {
          const label = `${role.company} · ${role.title}`;
          evidence.push({
            id: `cv-role-${i}`,
            source: 'cv',
            label,
            text: [role.from, role.current ? 'Present' : role.to, role.client, role.blurb]
              .filter(Boolean)
              .join(' · '),
          });
          role.achievements.forEach((item, n) =>
            evidence.push({
              id: `cv-bullet-${i}-${n}`,
              source: 'cv',
              label: `${label} · achievement ${n + 1}`,
              text: item.bullet,
            }),
          );
        });
        if (resume.skills.length)
          evidence.push({
            id: 'cv-skills',
            source: 'cv',
            label: 'CV skills (not attributed to a particular employer)',
            text: resume.skills.map((row) => row.name).join(', '),
          });
        resume.educations.forEach((row, i) =>
          evidence.push({
            id: `cv-education-${i}`,
            source: 'cv',
            label: 'CV education',
            text: [row.institution, row.degree, row.field, row.from, row.to].filter(Boolean).join(' · '),
          }),
        );
      } catch (error) {
        if (!(error instanceof ResumeError && error.code === 'not-found')) throw error;
      }
    }
    for (const key of ['instructions', 'notes', 'questions'] as const)
      if (prep[key].trim())
        evidence.push({
          id: `preparation-${key}`,
          source: 'preparation',
          label: `Saved preparation ${key}`,
          text: prep[key],
        });
    return {
      job: {
        title: job.title || job.pageTitle || 'Untitled role',
        company: job.company || 'Company not added',
        description: job.description || '',
        salary: job.salary,
      },
      cv,
      interviewType: prep.interviewType,
      evidence,
    };
  }
}
