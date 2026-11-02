import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../../shared/database/prisma.service';
import type { PreparationRepository } from '../../../application/ports/preparation';
import {
  PreparationNotFoundError,
  type PreparationInput,
  type InterviewType,
} from '../../../domain/preparation';
export class PrismaPreparationRepository implements PreparationRepository {
  constructor(private readonly db: PrismaService) {}
  async read(userId: string, jobId: string) {
    const row = await this.db.interviewPreparation.findFirst({ where: { userId, jobId } });
    return row ? present(row) : null;
  }
  async save(userId: string, jobId: string, input: PreparationInput) {
    try {
      return present(
        await this.db.interviewPreparation.upsert({
          where: { jobId, userId },
          create: { userId, jobId, ...input },
          update: input,
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2003', 'P2025'].includes(error.code))
        throw new PreparationNotFoundError();
      throw error;
    }
  }
}
function present(row: {
  jobId: string;
  interviewType: string | null;
  interviewer: string;
  instructions: string;
  notes: string;
  questions: string;
  updatedAt: Date;
}) {
  return {
    jobId: row.jobId,
    interviewType: row.interviewType as InterviewType | null,
    interviewer: row.interviewer,
    instructions: row.instructions,
    notes: row.notes,
    questions: row.questions,
    updatedAt: row.updatedAt,
  };
}
