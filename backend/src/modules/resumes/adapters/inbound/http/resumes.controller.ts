import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, CurrentUser } from '../../../../auth/http';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import type { ResumesApi } from '../../../contracts';
import { VERSIONED_TABLES, type VersionedTable } from '../../../domain/resume';
import { RESUMES_API } from '../../../resumes.tokens';
import { ResumeErrorFilter } from './resume-error.filter';
import { ResumeOwnerGuard } from './resume-owner.guard';
import {
  createResumeSchema,
  saveResumeSchema,
  type CreateResumeInput,
  type SaveResumeInput,
} from './resume.schemas';

@Controller('resumes')
@UseGuards(AuthGuard, ResumeOwnerGuard)
@UseFilters(ResumeErrorFilter)
export class ResumesController {
  constructor(@Inject(RESUMES_API) private readonly resumes: ResumesApi) {}
  @Get() list(@CurrentUser() userId: string) {
    return this.resumes.list(userId);
  }
  @Post() create(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(createResumeSchema)) body: CreateResumeInput,
  ) {
    return this.resumes.create(userId, body.name, body.targetRole);
  }
  @Get(':id') read(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.resumes.current(userId, id);
  }
  @Post(':id/save') save(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveResumeSchema)) body: SaveResumeInput,
  ) {
    const { message, ...changes } = body;
    return this.resumes.save(userId, id, changes, message);
  }
  @Get(':id/snapshots') snapshots(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.resumes.snapshots(userId, id);
  }
  @Get(':id/diff/:number') diff(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Param('number', ParseIntPipe) number: number,
  ) {
    return this.resumes.diff(userId, id, number);
  }
  @Get(':id/at/:number') atSnapshot(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Param('number', ParseIntPipe) number: number,
  ) {
    return this.resumes.atSnapshot(userId, id, number);
  }
  @Get(':id/history') history(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Query('table') table: string,
    @Query('lineageId') lineageId: string,
  ) {
    if (!VERSIONED_TABLES.includes(table as VersionedTable))
      throw new BadRequestException(`table must be one of: ${VERSIONED_TABLES.join(', ')}.`);
    return this.resumes.history(userId, id, table as VersionedTable, lineageId);
  }
  @Post(':id/revert/:number') revert(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Param('number', ParseIntPipe) number: number,
  ) {
    return this.resumes.revertTo(userId, id, number);
  }
  @Post(':id/rebuild') rebuild(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.resumes.rebuild(userId, id);
  }
}
