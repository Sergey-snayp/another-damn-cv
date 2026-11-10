import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import type { Response } from 'express';
import { AuthGuard, CurrentUser } from '../../../../auth/http';
import { ResumeOwnerGuard } from './resume-owner.guard';
import { ResumeErrorFilter } from './resume-error.filter';
import { TailoringErrorFilter } from './tailoring-error.filter';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import { ResumeAssistant, type JobChoice } from '../../../application/use-cases/resume-assistant';
import { DescribeTechnology } from '../../../application/use-cases/describe-technology';
import { ChooseRoleBullets } from '../../../application/use-cases/choose-role-bullets';
import type { CvRole } from '../../../domain/role-bullets';
import type { AiSettings, ChatMessage, SkillGroupInput } from '../../../domain/resume-assistant';
import { ResumeError } from '../../../contracts';
import { TailoringError } from '../../../application/tailoring-error';

const jobSchema = z.union([
  z.object({ jobId: z.string().min(1) }).strict(),
  z
    .object({
      title: z.string().trim().max(300).optional(),
      description: z
        .string('Paste the job description.')
        .trim()
        .min(30, 'Paste the job description.')
        .max(30_000),
    })
    .strict(),
]);

const chatSchema = z
  .object({
    messages: z
      .array(
        z.object({ role: z.enum(['user', 'assistant']), text: z.string().trim().min(1).max(4_000) }).strict(),
      )
      .min(1)
      .max(30),
    job: jobSchema.optional(),
  })
  .strict();

const tailorLineSchema = z
  .object({
    text: z.string('There is nothing to tailor yet.').trim().max(5_000),
    // "blurb": the line under a job's title that says what the work was about.
    // "techStack": the job's tools, a list under its bullets.
    kind: z.enum(['bullet', 'blurb', 'headline', 'techStack']),
    /** What the person asked for in the card, such as "shorter". */
    instruction: z.string().trim().max(500).optional(),
    // For a tech stack: the job's own lines, the only place a tool may come from.
    context: z.string().max(8_000).optional(),
    /** A bullet's neighbours: the job's other lines, which the rewrite must not repeat. */
    others: z.array(z.string().max(5_000)).max(40).optional(),
    job: jobSchema,
  })
  .strict();

/** A whole job on the CV, for choosing its bullets from the Profile. */
const tailorRoleSchema = z
  .object({
    role: z
      .object({
        company: z.string().trim().max(300),
        title: z.string().trim().max(300),
        from: z.string().max(80).default(''),
        client: z.string().trim().max(300).optional(),
        description: z.string().max(12000).optional(),
        techStack: z.string().max(8000).optional(),
        bullets: z.array(z.string().max(5_000)).max(60),
      })
      .strict(),
    instruction: z.string().trim().max(500).optional(),
    job: jobSchema,
    position: z.number().int().min(0).max(100).optional(),
  })
  .strict();

const skillName = z.string().trim().min(1).max(80);
const tailorSkillsSchema = z
  .object({
    groups: z
      .array(z.object({ category: z.string().trim().max(60), skills: z.array(skillName).max(80) }).strict())
      .min(1)
      .max(20),
    elsewhere: z.array(skillName).max(400).default([]),
    instruction: z.string().trim().max(500).optional(),
    job: jobSchema,
  })
  .strict();

const tailorSummarySchema = z
  .object({
    instruction: z.string().trim().max(500).optional(),
    job: jobSchema,
  })
  .strict();

const technologySchema = z.string('Name a technology.').trim().min(1, 'Name a technology.').max(80);

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
  constructor(
    @Inject(ResumeAssistant) private readonly assistant: ResumeAssistant,
    @Inject(DescribeTechnology) private readonly technologies: DescribeTechnology,
    @Inject(ChooseRoleBullets) private readonly roleBullets: ChooseRoleBullets,
  ) {}

  /** A job's bullets chosen for the posting from the Profile's full list for that job. */
  @Post(':id/tailor-role')
  @HttpCode(200)
  tailorRole(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(tailorRoleSchema))
    body: { role: CvRole; instruction?: string; job: JobChoice; position?: number },
  ) {
    return this.roleBullets.execute(userId, id, body);
  }

  /** What a skill on the CV is: one sentence, written once by the AI and then saved. */
  @Get(':id/technology')
  technology(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Query('name', new ZodValidationPipe(technologySchema)) name: string,
  ) {
    return this.technologies.describe(userId, id, name);
  }

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

  @Post(':id/tailor-line')
  @HttpCode(200)
  tailorLine(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(tailorLineSchema))
    body: {
      text: string;
      kind: 'bullet' | 'blurb' | 'headline' | 'techStack';
      context?: string;
      others?: string[];
      instruction?: string;
      job: JobChoice;
    },
  ) {
    return this.assistant.tailorLine(userId, id, body);
  }

  /** The summary, written from the summary instructions and checked in code. */
  @Post(':id/tailor-summary')
  @HttpCode(200)
  tailorSummary(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(tailorSummarySchema)) body: { instruction?: string; job: JobChoice },
  ) {
    return this.assistant.tailorSummary(userId, id, body);
  }

  /**
   * The same summary, streamed as one JSON object per line: "draft" with the
   * summary so far while it is written, "fixing" when a check failed, then
   * "done" with the checked result (or "error"). A failure before the first
   * line is an ordinary error response.
   */
  @Post(':id/tailor-summary/stream')
  async tailorSummaryStream(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(tailorSummarySchema)) body: { instruction?: string; job: JobChoice },
    @Res() res: Response,
  ): Promise<void> {
    let started = false;
    const send = (event: Record<string, unknown>) => {
      if (!started) {
        started = true;
        res.status(200);
        res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
      }
      res.write(`${JSON.stringify(event)}\n`);
    };
    try {
      const result = await this.assistant.tailorSummary(userId, id, body, {
        draft: (summary) => send({ type: 'draft', summary }),
        fixing: (failed) => send({ type: 'fixing', failed: failed.map((check) => check.name) }),
      });
      send({ type: 'done', ...result });
      res.end();
    } catch (error) {
      if (!started) throw error;
      const known =
        error instanceof TailoringError || error instanceof ResumeError || error instanceof HttpException;
      send({ type: 'error', message: known ? error.message : 'The AI did not answer. Try again.' });
      res.end();
    }
  }

  /** Quick tailoring of skills lines; every skill returned is checked against the CV. */
  @Post(':id/tailor-skills')
  @HttpCode(200)
  tailorSkills(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(tailorSkillsSchema))
    body: { groups: SkillGroupInput[]; elsewhere: string[]; instruction?: string; job: JobChoice },
  ) {
    return this.assistant.tailorSkills(userId, id, body);
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
