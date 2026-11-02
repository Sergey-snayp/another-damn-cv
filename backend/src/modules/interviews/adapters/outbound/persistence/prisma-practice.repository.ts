import { Prisma, type InterviewPractice } from '@prisma/client';
import { z } from 'zod';
import type { PrismaService } from '../../../../../shared/database/prisma.service';
import type { PracticeRepository } from '../../../application/ports/practice';
import { PRACTICE_KINDS, type PracticeRecord } from '../../../domain/practice';
import { PreparationNotFoundError } from '../../../domain/preparation';
import { practiceContentSchema } from '../ai/practice-output.schema';

const outputSchema = practiceContentSchema.extend({
  cv: z.object({ id: z.string(), snapshot: z.number().int().positive() }),
  evidence: z.array(
    z.object({ id: z.string(), source: z.enum(['cv', 'preparation']), label: z.string(), text: z.string() }),
  ),
});
export class PrismaPracticeRepository implements PracticeRepository {
  constructor(private readonly db: PrismaService) {}
  async list(userId: string, jobId: string): Promise<PracticeRecord[]> {
    const rows = await this.db.interviewPractice.findMany({
      where: { userId, jobId },
      orderBy: { kind: 'asc' },
    });
    return rows.map(present);
  }
  async save(userId: string, record: PracticeRecord): Promise<PracticeRecord> {
    const { questions, cv, evidence, ...metadata } = record;
    const output = { questions, cv, evidence } as unknown as Prisma.InputJsonValue;
    try {
      return present(
        await this.db.$transaction(async (db) => {
          if (!(await db.job.findFirst({ where: { id: record.jobId, userId }, select: { id: true } })))
            throw new PreparationNotFoundError();
          return db.interviewPractice.upsert({
            where: { jobId_kind: { jobId: record.jobId, kind: record.kind }, userId },
            create: { ...metadata, userId, output },
            update: { ...metadata, output },
          });
        }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2003', 'P2025'].includes(error.code))
        throw new PreparationNotFoundError();
      throw error;
    }
  }
}
function present(row: InterviewPractice): PracticeRecord {
  return {
    jobId: row.jobId,
    kind: z.enum(PRACTICE_KINDS).parse(row.kind),
    inputHash: row.inputHash,
    promptVersion: row.promptVersion,
    provider: row.provider,
    model: row.model,
    generatedAt: row.generatedAt,
    ...outputSchema.parse(row.output),
  };
}
