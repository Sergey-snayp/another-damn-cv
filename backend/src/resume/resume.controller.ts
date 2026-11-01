import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ProfileService } from '../profile/profile.service';
import { ResumeOwnerGuard } from './resume-owner.guard';
import { ResumeService, VERSIONED_TABLES, type VersionedTable } from './resume.service';
import { RewriteService, type RewriteRequest } from './rewrite.service';
import { DiffService } from './diff.service';
import { TailorResumeService } from './tailor-resume.service';
import type { ResumeChanges } from './resume.types';

/** Every `:id` route is checked against the signed-in user by ResumeOwnerGuard. */
@Controller('resumes')
@UseGuards(AuthGuard, ResumeOwnerGuard)
export class ResumeController {
  constructor(
    private readonly resumes: ResumeService,
    private readonly rewrites: RewriteService,
    private readonly diffs: DiffService,
    private readonly tailor: TailorResumeService,
    private readonly profiles: ProfileService,
  ) {}

  @Get()
  async list(@CurrentUser() userId: string) {
    const profile = await this.profiles.ensureProfile(userId);
    return this.resumes.list(profile.id);
  }

  @Post()
  async create(@CurrentUser() userId: string, @Body() body: { name: string; targetRole?: string }) {
    const profile = await this.profiles.ensureProfile(userId);
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
  history(@Param('id') id: string, @Query('table') table: string, @Query('lineageId') lineageId: string) {
    if (!VERSIONED_TABLES.includes(table as VersionedTable)) {
      throw new BadRequestException(`table must be one of: ${VERSIONED_TABLES.join(', ')}.`);
    }
    return this.resumes.history(id, table as VersionedTable, lineageId);
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
}
