import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { CurrentUser, SyncTokenGuard } from '../../../../auth/http';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import { CoverLetters } from '../../../application/use-cases/cover-letters';
import { ResumeErrorFilter } from './resume-error.filter';
import { TailoringErrorFilter } from './tailoring-error.filter';
import { sendPdf } from './resume-pdf.controller';

const generateSchema = z
  .object({
    resumeId: z.string('Choose a CV.').min(1, 'Choose a CV.'),
    instruction: z.string().trim().max(500).optional(),
  })
  .strict();

const updateSchema = z
  .object({ text: z.string('Write the letter.').trim().min(1, 'The letter is empty.').max(10_000) })
  .strict();

/**
 * The extension's cover letter for a saved job: written by the AI from the
 * chosen CV, edited in the panel, and downloaded as a PDF to attach.
 */
@Controller('extension/jobs/:jobId/cover-letter')
@UseGuards(SyncTokenGuard)
@UseFilters(ResumeErrorFilter, TailoringErrorFilter)
export class ExtensionCoverLettersController {
  constructor(@Inject(CoverLetters) private readonly letters: CoverLetters) {}

  @Get() async get(@CurrentUser() userId: string, @Param('jobId') jobId: string) {
    return { letter: await this.letters.get(userId, jobId) };
  }

  @Post()
  @HttpCode(200)
  generate(
    @CurrentUser() userId: string,
    @Param('jobId') jobId: string,
    @Body(new ZodValidationPipe(generateSchema)) body: { resumeId: string; instruction?: string },
  ) {
    return this.letters.generate(userId, jobId, body);
  }

  @Put()
  update(
    @CurrentUser() userId: string,
    @Param('jobId') jobId: string,
    @Body(new ZodValidationPipe(updateSchema)) body: { text: string },
  ) {
    return this.letters.update(userId, jobId, body.text);
  }

  @Get('pdf') async pdf(@CurrentUser() userId: string, @Param('jobId') jobId: string, @Res() res: Response) {
    sendPdf(res, await this.letters.pdfOf(userId, jobId), 'attachment');
  }
}
