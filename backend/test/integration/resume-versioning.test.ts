import { prisma, migrateTestDatabase, createUser } from './setup';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createResumesApi } from '../../src/modules/resumes/application/resumes-api';
import { PrismaResumeRepository } from '../../src/modules/resumes/adapters/outbound/persistence/prisma-resume.repository';
import { toChanges, copyOf } from '../../src/modules/resumes/domain/document';
import type { PrismaService } from '../../src/shared/database/prisma.service';
import type { ResumeChanges } from '../../src/modules/resumes/contracts';

const directory = {
  ensureProfile: (id: string) => prisma.profile.findUniqueOrThrow({ where: { userId: id } }),
};
const resumes = createResumesApi(new PrismaResumeRepository(prisma), directory, { next: randomUUID });
let userId: string;

before(async () => {
  migrateTestDatabase();
  userId = (await createUser('Versioning Applicant')).user.id;
});
after(() => prisma.$disconnect());

function content(): ResumeChanges {
  const roleLineageId = randomUUID();
  return {
    contact: {
      lineageId: randomUUID(),
      firstName: 'Sam',
      lastName: 'Lee',
      email: 'sam@example.com',
      phone: null,
    },
    experiences: [
      {
        lineageId: roleLineageId,
        company: 'Acme',
        title: 'Engineer',
        from: '2020',
        client: 'Client',
        current: true,
      },
    ],
    achievements: [
      {
        lineageId: randomUUID(),
        experienceLineageId: roleLineageId,
        bullet: 'Built a service.',
        problem: 'Slow',
        action: 'Rebuilt',
        result: 'Faster',
        verified: true,
        evidence: 'repo/commit',
        weight: 5,
        authoredBy: 'human',
      },
    ],
    educations: [
      {
        lineageId: randomUUID(),
        institution: 'UT',
        fullName: 'University of Testing',
        degree: 'BSc',
        field: 'Computing',
        from: '2016',
        to: '2020',
      },
    ],
    skills: [
      {
        lineageId: randomUUID(),
        name: 'Node.js',
        category: 'Backend',
        aliases: ['Node', 'JavaScript'],
        level: 'advanced',
        years: 4,
        verified: true,
        evidence: 'repo/package.json',
        weight: 4,
      },
    ],
    summaries: [{ lineageId: randomUUID(), variant: 'default', text: 'Backend engineer.' }],
  };
}

test('a full round trip is a no-op and partial saves preserve omitted sections and metadata', async () => {
  const row = await resumes.create(userId, 'Round trip');
  const first = await resumes.save(userId, row.id, content(), 'Initial');
  const unchanged = await resumes.save(userId, row.id, toChanges(first), 'No change');
  assert.deepEqual(unchanged, first);
  assert.equal((await resumes.snapshots(userId, row.id)).length, 1);

  const second = await resumes.save(userId, row.id, {
    summaries: [{ variant: 'default', text: 'Updated summary.' }],
  });
  assert.equal(second.snapshot, 2);
  assert.deepEqual(second.contact, first.contact);
  assert.deepEqual(second.experiences, first.experiences);
  assert.deepEqual(second.educations, first.educations);
  assert.deepEqual(second.skills, first.skills);
  assert.equal(second.experiences[0].achievements[0].evidence, 'repo/commit');
  assert.equal(second.experiences[0].achievements[0].authoredBy, 'human');
  assert.deepEqual(second.skills[0].aliases, ['Node', 'JavaScript']);
  assert.equal(second.educations[0].fullName, 'University of Testing');
  assert.deepEqual(await resumes.rebuild(userId, row.id), second);
});

test('history, diff and revert preserve lineage and append versions after removals', async () => {
  const row = await resumes.create(userId, 'History');
  const first = await resumes.save(userId, row.id, content(), 'Initial');
  const bullet = first.experiences[0].achievements[0];
  const changed = toChanges(first);
  changed.achievements![0].bullet = 'Built a reliable service.';
  changed.skills = [];
  await resumes.save(userId, row.id, changed, 'Edit and remove');

  const diff = await resumes.diff(userId, row.id, 2);
  assert.deepEqual(diff.counts, { added: 0, changed: 1, removed: 1 });
  const edit = diff.changes.find((item) => item.table === 'achievement')!;
  assert.equal(edit.label, 'Built a service.');
  assert.equal(edit.before?.lineageId, bullet.lineageId);
  assert.deepEqual(edit.fields, [
    { field: 'bullet', before: 'Built a service.', after: 'Built a reliable service.' },
  ]);
  const history = await resumes.history(userId, row.id, 'achievement', bullet.lineageId);
  assert.deepEqual(
    history.map((entry) => entry.createdInSnapshot),
    [2, 1],
  );
  assert.equal(history[1].supersededInSnapshot, 2);
  const old = await resumes.atSnapshot(userId, row.id, 1);
  assert.equal(old.experiences[0].achievements[0].bullet, bullet.bullet);
  assert.equal(old.skills.length, 1);

  const reverted = await resumes.revertTo(userId, row.id, 1);
  assert.equal(reverted.snapshot, 3);
  assert.equal(reverted.experiences[0].achievements[0].lineageId, bullet.lineageId);
  assert.equal(reverted.experiences[0].achievements[0].bullet, bullet.bullet);
  assert.equal(reverted.skills[0].lineageId, first.skills[0].lineageId);
  assert.deepEqual(
    (await resumes.snapshots(userId, row.id)).map((snapshot) => snapshot.number),
    [3, 2, 1],
  );
});

test('copies use new lineages, relink bullets and retain all content metadata', async () => {
  const source = await resumes.create(userId, 'Source');
  const original = await resumes.save(userId, source.id, content());
  const copy = await resumes.create(userId, 'Copy');
  const copied = await resumes.save(userId, copy.id, copyOf(original, randomUUID));
  assert.notEqual(copied.contact?.lineageId, original.contact?.lineageId);
  assert.notEqual(copied.experiences[0].lineageId, original.experiences[0].lineageId);
  assert.notEqual(
    copied.experiences[0].achievements[0].lineageId,
    original.experiences[0].achievements[0].lineageId,
  );
  assert.equal(copied.experiences[0].achievements[0].experienceLineageId, copied.experiences[0].lineageId);
  assert.equal(copied.experiences[0].achievements[0].weight, 5);
  assert.deepEqual(copied.skills[0].aliases, original.skills[0].aliases);
  assert.deepEqual(
    await resumes.history(userId, source.id, 'achievement', copied.experiences[0].achievements[0].lineageId),
    [],
  );
  assert.deepEqual(await resumes.current(userId, source.id), original);
});

test('projection failure rolls back rows, snapshot and materialised content together', async () => {
  const row = await resumes.create(userId, 'Rollback');
  const first = await resumes.save(userId, row.id, content(), 'Initial');
  const failing = prisma.$extends({
    query: {
      resume: {
        update() {
          throw new Error('Synthetic projection failure');
        },
      },
    },
  });
  const failingResumes = createResumesApi(
    new PrismaResumeRepository(failing as unknown as PrismaService),
    directory,
    { next: randomUUID },
  );
  await assert.rejects(
    failingResumes.save(userId, row.id, { summaries: [{ variant: 'default', text: 'Must roll back.' }] }),
    /Synthetic projection failure/,
  );
  assert.deepEqual(await resumes.current(userId, row.id), first);
  assert.equal((await resumes.snapshots(userId, row.id)).length, 1);
  assert.equal(await prisma.summaryVariant.count({ where: { resumeId: row.id } }), 1);
  assert.equal(
    (await prisma.summaryVariant.findFirstOrThrow({ where: { resumeId: row.id } })).supersededInSnapshot,
    null,
  );
});
