import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ResumeService } from './resume.service';
import type { ResumeChanges } from './resume.types';

@Controller('resumes')
@UseGuards(AuthGuard)
export class ResumeController {
  constructor(
    private readonly resumes: ResumeService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(@CurrentUser() userId: string) {
    const profile = await this.profileFor(userId);

    return this.prisma.resume.findMany({
      where: { profileId: profile.id },
      select: { id: true, name: true, targetRole: true, isPrimary: true,
                currentSnapshotId: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
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
