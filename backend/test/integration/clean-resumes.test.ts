import { prisma, migrateTestDatabase, createUser } from './setup';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createResumesApi } from '../../src/modules/resumes/application/resumes-api';
import { PrismaResumeRepository } from '../../src/modules/resumes/adapters/outbound/persistence/prisma-resume.repository';
import type { PrismaService } from '../../src/shared/database/prisma.service';
import { seedLegacyResume } from '../fixtures/seed-legacy-resume';
import type { ResumeChanges } from '../../src/modules/resumes/contracts';
import { toChanges } from '../../src/modules/resumes/domain/document';

let owner: Awaited<ReturnType<typeof createUser>>, other: Awaited<ReturnType<typeof createUser>>;
before(async () => {
  migrateTestDatabase();
  owner = await createUser('Clean Resumes');
  other = await createUser('Other Owner');
});
after(() => prisma.$disconnect());
const directory = {
  ensureProfile: async (userId: string) => await prisma.profile.findUniqueOrThrow({ where: { userId } }),
};
const resumes = createResumesApi(new PrismaResumeRepository(prisma), directory, { next: randomUUID });
function content(): ResumeChanges {
  const roleLineageId = randomUUID();
  return {
    experiences: [
      { lineageId: roleLineageId, company: 'Acme', title: 'Engineer', from: '2020', current: true },
    ],
    achievements: [
      {
        lineageId: randomUUID(),
        experienceLineageId: roleLineageId,
        bullet: 'Built Node.js services.',
        authoredBy: 'human',
        evidence: 'repo/commit',
        weight: 5,
        verified: true,
      },
    ],
    educations: [
      {
        lineageId: randomUUID(),
        institution: 'UT',
        fullName: 'University of Testing',
        degree: 'BSc',
        from: '2016',
      },
    ],
    skills: [{ lineageId: randomUUID(), name: 'Node.js', aliases: ['Node'], evidence: 'repo', weight: 4 }],
    summaries: [{ lineageId: randomUUID(), variant: 'default', text: 'Engineer.' }],
  };
}

test('new use cases read frozen legacy rows and JSON and preserve history and diff after new saves', async () => {
  const fixture = await seedLegacyResume(prisma, owner.profile.id);
  const row = fixture.record;
  const first = fixture.document;
  assert.deepEqual(await resumes.current(owner.user.id, row.id), first);
  const changes = toChanges(await resumes.current(owner.user.id, row.id));
  assert.deepEqual(await resumes.save(owner.user.id, row.id, changes), first);
  assert.equal((await resumes.snapshots(owner.user.id, row.id)).length, 1);
  const next = await resumes.save(
    owner.user.id,
    row.id,
    { summaries: [{ variant: 'default', text: 'Updated.' }] },
    'New implementation',
  );
  assert.deepEqual((await prisma.resume.findUniqueOrThrow({ where: { id: row.id } })).current, next);
  assert.deepEqual(next.experiences, first.experiences);
  assert.deepEqual(next.skills, first.skills);
  assert.deepEqual(next.educations, first.educations);
  const snapshot = await prisma.snapshot.findUniqueOrThrow({
    where: { resumeId_number: { resumeId: row.id, number: 2 } },
  });
  assert.deepEqual(await resumes.diff(owner.user.id, row.id, 2), {
    number: 2,
    message: 'New implementation',
    createdAt: snapshot.createdAt,
    counts: { added: 0, changed: 1, removed: 0 },
    changes: [
      {
        section: 'Summary',
        table: 'summaryVariant',
        lineageId: fixture.rows.summaries[0].lineageId,
        kind: 'changed',
        label: 'default',
        fields: [{ field: 'text', before: 'Engineer.', after: 'Updated.' }],
        before: { ...fixture.rows.summaries[0], supersededInSnapshot: 2 },
      },
    ],
  });
  assert.deepEqual(await resumes.atSnapshot(owner.user.id, row.id, 1), first);
  const reverted = await resumes.revertTo(owner.user.id, row.id, 1);
  assert.equal(reverted.snapshot, 3);
  assert.equal(reverted.summaries.default, 'Engineer.');
  assert.deepEqual(await resumes.rebuild(owner.user.id, row.id), { ...first, snapshot: 3 });
});

test('new application ownership checks protect reads, saves and proposal operations', async () => {
  const row = await resumes.create(owner.user.id, 'Owned');
  for (const call of [
    () => resumes.current(other.user.id, row.id),
    () => resumes.save(other.user.id, row.id, { summaries: [] }),
    () => resumes.pending(other.user.id, row.id),
    () => resumes.storeProposal(other.user.id, row.id, { changed: true }),
    () => resumes.discardProposal(other.user.id, row.id),
  ])
    await assert.rejects(call(), /No such resume/);
});

test('resume lists expose independent creation and edit dates for the document gallery without content or foreign rows', async () => {
  const older = await resumes.create(owner.user.id, 'Older document');
  const newer = await resumes.create(owner.user.id, 'Newer document');
  const foreign = await resumes.create(other.user.id, 'Foreign document');
  const createdAt = new Date('2025-01-01T00:00:00.000Z');
  const editedAt = new Date('2026-09-01T00:00:00.000Z');
  await prisma.resume.update({ where: { id: older.id }, data: { createdAt, updatedAt: editedAt } });
  await prisma.resume.update({
    where: { id: newer.id },
    data: {
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    },
  });
  const list = await resumes.list(owner.user.id);
  const published = list.find((row) => row.id === older.id)!;
  assert.deepEqual(published.createdAt, createdAt);
  assert.deepEqual(published.updatedAt, editedAt);
  assert.ok(list.findIndex((row) => row.id === older.id) < list.findIndex((row) => row.id === newer.id));
  assert.ok(!list.some((row) => row.id === foreign.id));
  assert.ok(!('current' in published));
});

test('workspace copying refreshes lineage, reuses the latest copy and proposal discard leaves content unchanged', async () => {
  const source = await resumes.create(owner.user.id, 'Copy source');
  const original = await resumes.save(owner.user.id, source.id, content());
  const job = await prisma.job.create({
    data: {
      userId: owner.user.id,
      source: 'MANUAL',
      extraction: 'MANUAL',
      editedFields: [],
      title: 'Backend',
      company: 'Acme',
    },
  });
  const workspace = await resumes.workspaceForJob(owner.user.id, job, source.id);
  assert.notEqual(workspace.document.experiences[0].lineageId, original.experiences[0].lineageId);
  const bullet = workspace.document.experiences[0].achievements[0];
  assert.equal(bullet.experienceLineageId, workspace.document.experiences[0].lineageId);
  assert.equal(bullet.evidence, 'repo/commit');
  assert.equal(bullet.authoredBy, 'human');
  assert.deepEqual(workspace.document.skills[0].aliases, ['Node']);
  assert.equal(
    (await resumes.workspaceForJob(owner.user.id, job, 'ignored-because-copy-exists')).id,
    workspace.id,
  );
  assert.deepEqual(await resumes.latestIdsForJobs(owner.user.id, [job.id]), { [job.id]: workspace.id });
  assert.deepEqual(await resumes.latestIdsForJobs(other.user.id, [job.id]), {});
  await resumes.storeProposal(owner.user.id, workspace.id, { basedOnSnapshot: 1, synthetic: true });
  assert.deepEqual(await resumes.pending(owner.user.id, workspace.id), {
    basedOnSnapshot: 1,
    synthetic: true,
  });
  await resumes.discardProposal(owner.user.id, workspace.id);
  assert.equal(await resumes.pending(owner.user.id, workspace.id), null);
  assert.deepEqual(await resumes.current(owner.user.id, workspace.id), workspace.document);
  assert.deepEqual(await resumes.current(owner.user.id, source.id), original);
  await prisma.job.delete({ where: { id: job.id } });
  assert.deepEqual(await resumes.current(owner.user.id, workspace.id), workspace.document);
  const retained = (await resumes.list(owner.user.id)).find((row) => row.id === workspace.id)!;
  assert.equal(retained.jobId, null);
  assert.equal(retained.sourceResumeId, source.id);
});

test('new save transaction rolls back a failed projection without closing live rows', async () => {
  const row = await resumes.create(owner.user.id, 'New rollback');
  const first = await resumes.save(owner.user.id, row.id, content());
  const failing = prisma.$extends({
    query: {
      resume: {
        update() {
          throw new Error('Synthetic projection failure');
        },
      },
    },
  });
  const service = createResumesApi(
    new PrismaResumeRepository(failing as unknown as PrismaService),
    directory,
    { next: randomUUID },
  );
  await assert.rejects(
    service.save(owner.user.id, row.id, { summaries: [{ variant: 'default', text: 'Must roll back.' }] }),
    /Synthetic projection failure/,
  );
  assert.deepEqual(await resumes.current(owner.user.id, row.id), first);
  assert.equal((await resumes.snapshots(owner.user.id, row.id)).length, 1);
  assert.equal(await prisma.summaryVariant.count({ where: { resumeId: row.id } }), 1);
  assert.equal(
    (await prisma.summaryVariant.findFirstOrThrow({ where: { resumeId: row.id } })).supersededInSnapshot,
    null,
  );
});
