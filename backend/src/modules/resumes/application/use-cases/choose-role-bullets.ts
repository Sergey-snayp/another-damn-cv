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
import type { BulletChooser, ProfileRolesReader } from '../ports/role-bullets';
import type { TailoringJobReader } from '../ports/tailoring';
import type { JobChoice } from './resume-assistant';

const NONE: RoleBulletChoice = { matched: false, profileRole: null, chosen: [], alternates: [] };

/**
 * Quick tailoring of a whole job: its bullets chosen for the posting from the
 * Profile's full list for that job and the CV's own bullets. When the Profile
 * has nothing more for the job, the answer says so and each line is tailored on
 * its own instead.
 */
export class ChooseRoleBullets {
  constructor(
    private readonly resumes: Pick<ResumesApi, 'assertOwned'>,
    private readonly jobs: TailoringJobReader,
    private readonly profile: ProfileRolesReader,
    private readonly chooser: BulletChooser,
  ) {}

  async execute(
    userId: string,
    id: string,
    input: { role: CvRole; instruction?: string; job: JobChoice },
  ): Promise<RoleBulletChoice> {
    await this.resumes.assertOwned(userId, id);
    const profileRole = matchProfileRole(await this.profile.roles(userId), input.role);
    if (!profileRole) return NONE;
    const pool = rolePool(input.role, profileRole);
    if (!pool.some((item) => item.source === 'profile')) return NONE;
    const job = await this.job(userId, input.job);
    const count = Math.min(pool.length, input.role.bullets.filter((bullet) => bullet.trim()).length || 5);
    const answer = await this.chooser.choose({
      job: `${job.title}${job.company ? ` at ${job.company}` : ''}\n${job.description.slice(0, 8_000)}`,
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
      profileRole: { title: profileRole.title, company: profileRole.company },
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
