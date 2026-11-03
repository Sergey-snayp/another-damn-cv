import type { PrismaService } from '../../../../../shared/database/prisma.service';
import type { AnswerRepository, NewAnswer } from '../../../application/ports/answers';
import type { SavedAnswer } from '../../../domain/answers';

const FIELDS = {
  id: true,
  question: true,
  answer: true,
  company: true,
  usedCount: true,
  lastUsedAt: true,
  updatedAt: true,
} as const;

export class PrismaAnswerRepository implements AnswerRepository {
  constructor(private readonly db: PrismaService) {}

  list(userId: string): Promise<SavedAnswer[]> {
    return this.db.savedAnswer.findMany({
      where: { userId },
      select: FIELDS,
      orderBy: { updatedAt: 'desc' },
    });
  }

  upsertMany(userId: string, answers: NewAnswer[]): Promise<SavedAnswer[]> {
    return this.db.$transaction(
      answers.map((item) =>
        this.db.savedAnswer.upsert({
          where: { userId_questionKey: { userId, questionKey: item.questionKey } },
          create: { userId, ...item },
          update: { question: item.question, answer: item.answer, company: item.company },
          select: FIELDS,
        }),
      ),
    );
  }

  async update(userId: string, id: string, answer: string): Promise<SavedAnswer | null> {
    const { count } = await this.db.savedAnswer.updateMany({ where: { id, userId }, data: { answer } });
    return count ? this.db.savedAnswer.findFirst({ where: { id, userId }, select: FIELDS }) : null;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    return (await this.db.savedAnswer.deleteMany({ where: { id, userId } })).count > 0;
  }

  async markUsed(userId: string, ids: string[]): Promise<void> {
    await this.db.savedAnswer.updateMany({
      where: { userId, id: { in: ids } },
      data: { usedCount: { increment: 1 }, lastUsedAt: new Date() },
    });
  }
}
