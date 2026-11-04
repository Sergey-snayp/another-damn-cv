import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { ResumesModule } from '../resumes/resumes.module';
import { RESUMES_API } from '../resumes/resumes.tokens';
import type { ResumesApi } from '../resumes/contracts';
import { AiModule } from '../../shared/ai/ai.module';
import { ClaudeProcessRunner } from '../../shared/ai/claude-process.runner';
import { PublicCvEvidenceReader } from './adapters/outbound/modules/cv-evidence.reader';
import { ClaudeCliAnswerDrafter } from './adapters/outbound/ai/claude-cli-answer.drafter';
import { AnswersController, ExtensionAnswersController } from './adapters/inbound/http/answers.controller';
import { DefaultsController, ExtensionDefaultsController } from './adapters/inbound/http/defaults.controller';
import { PrismaDefaultRepository } from './adapters/outbound/persistence/prisma-default.repository';
import type { DefaultRepository } from './application/ports/defaults';
import {
  DeleteDefault,
  ListDefaults,
  SaveDefaults,
  UpdateDefault,
} from './application/use-cases/manage-defaults';
import { PrismaAnswerRepository } from './adapters/outbound/persistence/prisma-answer.repository';
import type { AnswerRepository } from './application/ports/answers';
import {
  DeleteAnswer,
  DraftAnswer,
  ForgetAnswer,
  ListAnswers,
  MatchAnswers,
  SaveAnswers,
  UpdateAnswer,
} from './application/use-cases/manage-answers';
import { ANSWER_REPOSITORY, DEFAULT_REPOSITORY } from './answers.tokens';

const useCase = <T>(type: new (repository: AnswerRepository) => T) => ({
  provide: type,
  inject: [ANSWER_REPOSITORY],
  useFactory: (repository: AnswerRepository) => new type(repository),
});

const defaultsUseCase = <T>(type: new (repository: DefaultRepository) => T) => ({
  provide: type,
  inject: [DEFAULT_REPOSITORY],
  useFactory: (repository: DefaultRepository) => new type(repository),
});

@Module({
  imports: [AuthModule, DatabaseModule, ResumesModule, AiModule],
  controllers: [
    AnswersController,
    ExtensionAnswersController,
    DefaultsController,
    ExtensionDefaultsController,
  ],
  providers: [
    {
      provide: ANSWER_REPOSITORY,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => new PrismaAnswerRepository(db),
    },
    {
      provide: DEFAULT_REPOSITORY,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => new PrismaDefaultRepository(db),
    },
    defaultsUseCase(ListDefaults),
    defaultsUseCase(SaveDefaults),
    defaultsUseCase(UpdateDefault),
    defaultsUseCase(DeleteDefault),
    useCase(ListAnswers),
    useCase(SaveAnswers),
    useCase(UpdateAnswer),
    useCase(DeleteAnswer),
    useCase(MatchAnswers),
    useCase(ForgetAnswer),
    {
      provide: DraftAnswer,
      inject: [RESUMES_API, ClaudeProcessRunner],
      useFactory: (resumes: ResumesApi, runner: ClaudeProcessRunner) =>
        new DraftAnswer(new PublicCvEvidenceReader(resumes), new ClaudeCliAnswerDrafter(runner)),
    },
  ],
})
export class AnswersModule {}
