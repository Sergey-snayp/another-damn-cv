import type { ResumesApi } from '../../contracts';
import { practiceHints } from '../../domain/job-practices';
import {
  checkChoice,
  matchProfileRole,
  rolePool,
  type CvRole,
  type RoleBulletChoice,
} from '../../domain/role-bullets';
import { ResumeError } from '../errors';
import type { BulletChooser, ProfileRolesReader, SavedCvRolesReader } from '../ports/role-bullets';
import type { TailoringJobReader } from '../ports/tailoring';
import type { JobChoice } from './resume-assistant';

const NONE: RoleBulletChoice = { matched: false, profileRole: null, chosen: [], alternates: [] };

/**
 * Choose one or more bullets using the matching role in Profile and saved CVs.
 * Without additional evidence, the caller can tailor each existing line instead.
 */
export class ChooseRoleBullets {
  constructor(
    private readonly resumes: Pick<ResumesApi, 'assertOwned'>,
    private readonly jobs: TailoringJobReader,
    private readonly profile: ProfileRolesReader,
    private readonly chooser: BulletChooser,
    private readonly savedCvs?: SavedCvRolesReader,
  ) {}

  async execute(
    userId: string,
    id: string,
    input: { role: CvRole; instruction?: string; job: JobChoice },
  ): Promise<RoleBulletChoice> {
    await this.resumes.assertOwned(userId, id);
    const job = await this.job(userId, input.job);
    const profileRole = matchProfileRole(await this.profile.roles(userId), input.role);
    const cvRoles = (await this.savedCvs?.roles(userId)) ?? [];
    const byDocument = new Map<string, CvRole[]>();
    for (const role of cvRoles) {
      const key = role.resumeId ?? 'saved';
      byDocument.set(key, [...(byDocument.get(key) ?? []), role]);
    }
    const matchingCvs = [...byDocument.values()].flatMap((roles) => {
      const match = matchProfileRole(roles, input.role);
      return match ? [match] : [];
    });
    const pool = rolePool(input.role, profileRole, matchingCvs);
    if (!pool.some((item) => item.source === 'profile' || item.cvIndex === null)) return NONE;
    const count = Math.min(pool.length, input.role.bullets.filter((bullet) => bullet.trim()).length || 5);
    const answer = await this.chooser.choose({
      job: `${job.title}${job.company ? ` at ${job.company}` : ''}\n${job.description.slice(0, 30_000)}`,
      items: pool.map((item) => ({
        ...item,
        hint: practiceHints(job.description, item.text)
          .map((hint) => `${hint.term} (${hint.evidence.join(', ')})`)
          .join('; '),
      })),
      count,
      instruction: input.instruction,
    });
    return {
      matched: true,
      profileRole: profileRole ? { title: profileRole.title, company: profileRole.company } : null,
      ...checkChoice(answer, pool, count),
    };
  }

  private async job(userId: string, choice: JobChoice) {
    if (!('jobId' in choice))
      return { title: choice.title?.trim() || 'This job', company: null, description: choice.description };
    const job = await this.jobs.getForTailoring(userId, choice.jobId);
    if (!job.description?.trim())
      throw new ResumeError('invalid', 'This job has no description yet. Add one in the tracker.');
    return {
      title: job.title ?? job.pageTitle ?? 'This job',
      company: job.company,
      description: job.description,
    };
  }
}
