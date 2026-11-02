import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../../../shared/database/prisma.service';
import type { CareerProfileRepository } from '../../application/ports/career-profile';
import {
  conflict,
  mergeCareer,
  selectedContactChanged,
  type CareerImport,
  type CareerState,
} from '../../domain/career-profile';
import { careerDataSchema } from '../career.schemas';
export class PrismaCareerProfileRepository implements CareerProfileRepository {
  constructor(private readonly db: PrismaService) {}
  async read(userId: string): Promise<CareerState> {
    const row = await this.db.profile.findUnique({
      where: { userId },
      select: { career: true, careerRevision: true },
    });
    return {
      revision: row?.careerRevision ?? 0,
      data: row?.career ? careerDataSchema.parse(row.career) : {},
    };
  }
  async import(userId: string, input: CareerImport, importedAt: string): Promise<CareerState> {
    try {
      return await this.db.$transaction(
        async (db) => {
          const row = await db.profile.findUnique({ where: { userId } });
          if (!row || row.careerRevision !== input.expectedRevision || selectedContactChanged(row, input))
            throw conflict();
          const state = mergeCareer(
            { revision: row.careerRevision, data: row.career ? careerDataSchema.parse(row.career) : {} },
            input,
            importedAt,
          );
          await db.profile.update({
            where: { userId },
            data: {
              ...input.contact,
              career: state.data as Prisma.InputJsonValue,
              careerRevision: state.revision,
            },
          });
          return state;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') throw conflict();
      throw error;
    }
  }
}
