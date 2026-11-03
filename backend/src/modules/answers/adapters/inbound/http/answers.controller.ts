import {
  Body,
  Catch,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UseFilters,
  UseGuards,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthGuard, CurrentUser, SyncTokenGuard } from '../../../../auth/http';
import { ZodValidationPipe } from '../../../../../shared/http/zod-validation.pipe';
import { AnswerNotFoundError, QUESTION_KINDS, type FormQuestion } from '../../../domain/answers';
import {
  DeleteAnswer,
  ListAnswers,
  MatchAnswers,
  SaveAnswers,
  UpdateAnswer,
} from '../../../application/use-cases/manage-answers';

const question = z.string().trim().min(1).max(500);
const answer = z.string().max(5000);
const company = z.string().trim().max(200).optional();

export const saveAnswersSchema = z
  .object({ company, answers: z.array(z.object({ question, answer }).strict()).min(1).max(50) })
  .strict();
export const updateAnswerSchema = z
  .object({ answer: answer.refine((value) => value.trim().length > 0) })
  .strict();
export const matchAnswersSchema = z
  .object({
    company,
    questions: z
      .array(
        z
          .object({
            id: z.string().min(1).max(40),
            question,
            kind: z.enum(QUESTION_KINDS),
            options: z.array(z.string().max(300)).max(200).optional(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();

@Catch(AnswerNotFoundError)
class AnswerErrorFilter implements ExceptionFilter {
  catch(error: AnswerNotFoundError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(404).json({ statusCode: 404, message: error.message });
  }
}

/** Profile → Saved answers in the app. */
@Controller('answers')
@UseGuards(AuthGuard)
@UseFilters(AnswerErrorFilter)
export class AnswersController {
  constructor(
    @Inject(ListAnswers) private readonly listAnswers: ListAnswers,
    @Inject(UpdateAnswer) private readonly updateAnswer: UpdateAnswer,
    @Inject(DeleteAnswer) private readonly deleteAnswer: DeleteAnswer,
  ) {}
  @Get() list(@CurrentUser() userId: string) {
    return this.listAnswers.execute(userId);
  }
  @Patch(':id') update(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAnswerSchema)) body: { answer: string },
  ) {
    return this.updateAnswer.execute(userId, id, body.answer);
  }
  @Delete(':id') @HttpCode(204) async remove(@CurrentUser() userId: string, @Param('id') id: string) {
    await this.deleteAnswer.execute(userId, id);
  }
}

/** The extension saves answers from a form and finds them for the next one. */
@Controller('extension/answers')
@UseGuards(SyncTokenGuard)
export class ExtensionAnswersController {
  constructor(
    @Inject(SaveAnswers) private readonly saveAnswers: SaveAnswers,
    @Inject(MatchAnswers) private readonly matchAnswers: MatchAnswers,
  ) {}
  @Post() async save(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(saveAnswersSchema)) body: z.infer<typeof saveAnswersSchema>,
  ) {
    return { saved: (await this.saveAnswers.execute(userId, body)).length };
  }
  @Post('match') @HttpCode(200) match(
    @CurrentUser() userId: string,
    @Body(new ZodValidationPipe(matchAnswersSchema)) body: { company?: string; questions: FormQuestion[] },
  ) {
    return this.matchAnswers.execute(userId, body);
  }
}
