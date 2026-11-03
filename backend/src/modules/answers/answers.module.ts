import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/database.module';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuthModule } from '../auth/auth.module';
import { AnswersController, ExtensionAnswersController } from './adapters/inbound/http/answers.controller';
import { PrismaAnswerRepository } from './adapters/outbound/persistence/prisma-answer.repository';
import type { AnswerRepository } from './application/ports/answers';
import {
  DeleteAnswer,
  ListAnswers,
  MatchAnswers,
  SaveAnswers,
  UpdateAnswer,
} from './application/use-cases/manage-answers';
import { ANSWER_REPOSITORY } from './answers.tokens';

const useCase = <T>(type: new (repository: AnswerRepository) => T) => ({
  provide: type,
  inject: [ANSWER_REPOSITORY],
  useFactory: (repository: AnswerRepository) => new type(repository),
});

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [AnswersController, ExtensionAnswersController],
  providers: [
    {
      provide: ANSWER_REPOSITORY,
      inject: [PrismaService],
      useFactory: (db: PrismaService) => new PrismaAnswerRepository(db),
    },
    useCase(ListAnswers),
    useCase(SaveAnswers),
    useCase(UpdateAnswer),
    useCase(DeleteAnswer),
    useCase(MatchAnswers),
  ],
})
export class AnswersModule {}
