import type { PrismaService } from '../../../../../shared/database/prisma.service';
import type { DefaultRepository } from '../../../application/ports/defaults';
import type { AutofillDefault, NewDefault } from '../../../domain/defaults';

const FIELDS = { id: true, kind: true, scope: true, value: true, updatedAt: true } as const;

export class PrismaDefaultRepository implements DefaultRepository {
  constructor(private readonly db: PrismaService) {}

  async list(userId: string): Promise<AutofillDefault[]> {
    return (await this.db.autofillDefault.findMany({
      where: { userId },
      select: FIELDS,
      orderBy: [{ kind: 'asc' }, { scopeKey: 'asc' }],
    })) as AutofillDefault[];
  }

  async upsertMany(userId: string, items: (NewDefault & { scopeKey: string })[]): Promise<AutofillDefault[]> {
    return (await this.db.$transaction(
      items.map((item) =>
        this.db.autofillDefault.upsert({
          where: { userId_kind_scopeKey: { userId, kind: item.kind, scopeKey: item.scopeKey } },
          create: { userId, ...item },
          update: { scope: item.scope, value: item.value },
          select: FIELDS,
        }),
      ),
    )) as AutofillDefault[];
  }

  async update(userId: string, id: string, value: string): Promise<AutofillDefault | null> {
    const { count } = await this.db.autofillDefault.updateMany({ where: { id, userId }, data: { value } });
    return count
      ? ((await this.db.autofillDefault.findFirst({
          where: { id, userId },
          select: FIELDS,
        })) as AutofillDefault)
      : null;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    return (await this.db.autofillDefault.deleteMany({ where: { id, userId } })).count > 0;
  }
}
