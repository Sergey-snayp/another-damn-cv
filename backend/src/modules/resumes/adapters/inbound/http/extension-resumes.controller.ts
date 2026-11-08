import { Controller, Get, Inject, Param, UseFilters, UseGuards } from '@nestjs/common';
import { CurrentUser, SyncTokenGuard } from '../../../../auth/http';
import type { ResumesApi } from '../../../contracts';
import type { RenderedResume } from '../../../domain/resume';
import { RESUMES_API } from '../../../resumes.tokens';
import { ResumeErrorFilter } from './resume-error.filter';

/**
 * The Chrome extension's CV picker and keyword match. It signs in with the
 * sync token, not the session cookie. The list has enough to choose a CV and
 * know when its PDF or text is out of date; the extension makes the PDF itself
 * from the app's page.
 */
@Controller('extension/resumes')
@UseGuards(SyncTokenGuard)
@UseFilters(ResumeErrorFilter)
export class ExtensionResumesController {
  constructor(@Inject(RESUMES_API) private readonly resumes: ResumesApi) {}

  @Get() async list(@CurrentUser() userId: string) {
    const resumes = await this.resumes.list(userId);
    return resumes.map((resume) => ({
      id: resume.id,
      name: resume.name,
      targetRole: resume.targetRole,
      isPrimary: resume.isPrimary,
      tailoredForJob: resume.jobId !== null,
      updatedAt: resume.updatedAt,
    }));
  }

  /** Plain text for keyword matching. Contact details are left out. */
  @Get(':id/text') async text(@CurrentUser() userId: string, @Param('id') id: string) {
    return { id, text: searchableText(await this.resumes.current(userId, id)) };
  }
}

export function searchableText(resume: RenderedResume): string {
  return [
    ...Object.values(resume.summaries),
    ...resume.experiences.flatMap((role) => [
      role.title,
      role.company,
      role.client,
      role.blurb,
      role.techStack,
      ...role.achievements.flatMap((item) => [item.bullet, item.problem, item.action, item.result]),
    ]),
    ...resume.skills.flatMap((skill) => [skill.name, skill.category, ...skill.aliases]),
    ...resume.educations.flatMap((entry) => [entry.degree, entry.field, entry.institution, entry.fullName]),
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join('\n');
}
