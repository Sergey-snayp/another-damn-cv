import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put, UseFilters, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, CurrentUser } from '../../../../auth/http';
import { ResumeOwnerGuard } from './resume-owner.guard';
import { ResumeErrorFilter } from './resume-error.filter';
import { TailoringErrorFilter } from './tailoring-error.filter';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import { ResumeAssistant, type JobChoice } from '../../../application/use-cases/resume-assistant';
import type { AiSettings, ChatMessage } from '../../../domain/resume-assistant';

const jobSchema = z.union([
  z.object({ jobId: z.string().min(1) }).strict(),
  z
    .object({
      title: z.string().trim().max(300).optional(),
      description: z.string('Paste the job description.').trim().min(30, 'Paste the job description.').max(30_000),
    })
    .strict(),
]);

const chatSchema = z
  .object({
    messages: z
      .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(4_000) }).strict())
      .min(1)
      .max(30),
    job: jobSchema.optional(),
  })
  .strict();

const settingsSchema = z
  .object({
    tone: z.enum(['balanced', 'confident', 'concise']),
    instructions: z.string().max(1_000),
  })
  .strict();

/** The CV editor's right column: Resume Score, Chat and AI Settings. */
@Controller('resumes')
@UseGuards(AuthGuard, ResumeOwnerGuard)
@UseFilters(ResumeErrorFilter, TailoringErrorFilter)
export class ResumeAssistantController {
  constructor(@Inject(ResumeAssistant) private readonly assistant: ResumeAssistant) {}

  @Post(':id/score')
  @HttpCode(200)
  score(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(jobSchema)) body: JobChoice,
  ) {
    return this.assistant.score(userId, id, body);
  }

  @Post(':id/chat')
  @HttpCode(200)
  chat(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(chatSchema)) body: { messages: ChatMessage[]; job?: JobChoice },
  ) {
    return this.assistant.chat(userId, id, body);
  }

  @Get(':id/ai-settings')
  settings(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.assistant.settings(userId, id);
  }

  @Put(':id/ai-settings')
  setSettings(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(settingsSchema)) body: AiSettings,
  ) {
    return this.assistant.setSettings(userId, id, body);
  }
}
