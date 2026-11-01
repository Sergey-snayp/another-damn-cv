import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ResumeService } from './resume.service';
import { RewriteService, type RewriteRequest } from './rewrite.service';
import { DiffService } from './diff.service';
import { TailorResumeService } from './tailor-resume.service';
import type { ResumeChanges } from './resume.types';

@Controller('resumes')
@UseGuards(AuthGuard)
export class ResumeController {
  constructor(
    private readonly resumes: ResumeService,
    private readonly rewrites: RewriteService,
    private readonly diffs: DiffService,
    private readonly tailor: TailorResumeService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(@CurrentUser() userId: string) {
    const profile = await this.profileFor(userId);

    const rows = await this.prisma.resume.findMany({
      where: { profileId: profile.id },
      select: { id: true, name: true, targetRole: true, isPrimary: true,
                currentSnapshotId: true, updatedAt: true, jobId: true, tailoring: true },
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map(({ tailoring, ...row }) => ({ ...row, hasTailoring: tailoring !== null }));
  }

  @Post()
  async create(@CurrentUser() userId: string, @Body() body: { name: string; targetRole?: string }) {
    const profile = await this.profileFor(userId);
    return this.resumes.create(profile.id, body.name, body.targetRole);
  }

  /** The live resume, straight from the materialised projection. */
  @Get(':id')
  read(@Param('id') id: string) {
    return this.resumes.current(id);
  }

  /** One save, one snapshot. A save that changes nothing creates none. */
  @Post(':id/save')
  save(@Param('id') id: string, @Body() body: ResumeChanges & { message?: string }) {
    const { message, ...changes } = body;
    return this.resumes.save(id, changes, message);
  }

  @Get(':id/snapshots')
  snapshots(@Param('id') id: string) {
    return this.resumes.snapshots(id);
  }

  /** What changed in one snapshot — added, reworded and removed. */
  @Get(':id/diff/:number')
  diff(@Param('id') id: string, @Param('number') number: string) {
    return this.diffs.diff(id, Number(number));
  }

  @Get(':id/at/:number')
  atSnapshot(@Param('id') id: string, @Param('number') number: string) {
    return this.resumes.atSnapshot(id, Number(number));
  }

  /** Every version of one entry — "this bullet has been reworded four times". */
  @Get(':id/history')
  history(
    @Param('id') _id: string,
    @Query('table') table: 'experienceEntry' | 'achievement' | 'skillEntry'
      | 'educationEntry' | 'summaryVariant' | 'contactInformation',
    @Query('lineageId') lineageId: string,
  ) {
    return this.resumes.history(table, lineageId);
  }

  /** Reverting moves forward: the old content becomes a new snapshot. */
  @Post(':id/revert/:number')
  revert(@Param('id') id: string, @Param('number') number: string) {
    return this.resumes.revertTo(id, Number(number));
  }

  /**
   * Suggests a rewrite of one line. Nothing is saved — the browser shows the
   * original beside the suggestion and the person decides.
   */
  @Post(':id/rewrite')
  rewrite(@Param('id') _id: string, @Body() body: RewriteRequest) {
    return this.rewrites.rewrite(body);
  }

  /** Suggestions from "Tailor resume for this job", waiting for review. */
  @Get(':id/tailoring')
  tailoring(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.tailor.pending(userId, id);
  }

  /** Done reviewing: the suggestions are dropped, whatever was saved stays. */
  @Delete(':id/tailoring')
  @HttpCode(204)
  discardTailoring(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.tailor.discard(userId, id);
  }

  /** The projection is derived, so a suspected drift is fixed by rebuilding. */
  @Post(':id/rebuild')
  rebuild(@Param('id') id: string) {
    return this.resumes.rebuild(id);
  }

  /** Created on demand: a user gets a profile the first time they need one. */
  private async profileFor(userId: string) {
    const existing = await this.prisma.profile.findUnique({ where: { userId } });
    if (existing) return existing;

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const [firstName = '', ...rest] = (user.name ?? '').split(' ');

    return this.prisma.profile.create({
      data: { userId, firstName, lastName: rest.join(' '), email: user.email },
    });
  }
}
