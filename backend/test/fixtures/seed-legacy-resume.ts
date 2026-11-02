import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../src/shared/database/prisma.service';
import golden from './legacy-resume.json';

/** Saved from the old service using synthetic data, before removing that service. */
export async function seedLegacyResume(database: PrismaService, profileId: string) {
  const ids = new Map<string, string>([[golden.record.profileId, profileId]]);
  for (const row of [golden.record, ...golden.snapshots, ...Object.values(golden.rows).flat()]) {
    ids.set(row.id, randomUUID());
    if ('lineageId' in row && typeof row.lineageId === 'string') ids.set(row.lineageId, randomUUID());
  }
  const fixture = JSON.parse(JSON.stringify(golden), (_key: string, value: unknown) =>
    typeof value === 'string' ? (ids.get(value) ?? value) : value,
  ) as typeof golden;
  await database.resume.create({
    data: {
      ...fixture.record,
      currentSnapshotId: null,
      current: fixture.record.current,
      tailoring: Prisma.DbNull,
    },
  });
  await database.snapshot.createMany({ data: fixture.snapshots });
  await database.contactInformation.createMany({ data: fixture.rows.contacts });
  await database.experienceEntry.createMany({ data: fixture.rows.experiences });
  await database.achievement.createMany({ data: fixture.rows.achievements });
  await database.educationEntry.createMany({ data: fixture.rows.educations });
  await database.skillEntry.createMany({ data: fixture.rows.skills });
  await database.summaryVariant.createMany({ data: fixture.rows.summaries });
  await database.resume.update({
    where: { id: fixture.record.id },
    data: {
      currentSnapshotId: fixture.record.currentSnapshotId,
    },
  });
  return fixture;
}
