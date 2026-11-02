import { prisma, migrateTestDatabase, createUser } from './setup';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from '../../src/app.module';
import { ClaudeProcessRunner } from '../../src/shared/ai/claude-process.runner';
import { JOB_READ_SCHEDULER } from '../../src/modules/jobs/jobs.tokens';
import type { CareerImport, CareerState } from '../../src/modules/profiles/domain/career-profile';

let app: INestApplication, base: string;
let owner: Awaited<ReturnType<typeof createUser>>, other: Awaited<ReturnType<typeof createUser>>;
let resumeId: string, foreignId: string, snapshot: number;
let modelCalls = 0;
const role = {
  company: 'Imported Employer',
  title: 'Lead Engineer',
  client: 'Payment Client',
  location: 'Remote',
  from: '2019-03',
  to: '',
  current: true,
  description: 'Payment delivery.',
  bullets: ['Implemented idempotent retries with the team.'],
};
async function request(path: string, method = 'GET', body?: unknown, userId: string | null = owner.user.id) {
  return fetch(`${base}/api${path}`, {
    method,
    headers: {
      ...(userId ? { 'x-test-user': userId } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function json<T>(path: string, method = 'GET', body?: unknown, userId?: string): Promise<T> {
  const response = await request(path, method, body, userId);
  assert.ok(response.ok, `${response.status} ${await response.clone().text()}`);
  return response.json() as Promise<T>;
}
const read = () => json<CareerState>('/profile/career');
function input(revision: number): CareerImport {
  return {
    expectedRevision: revision,
    source: { kind: 'resume', id: resumeId, snapshot },
    contact: {},
    expectedContact: {},
    sections: {},
  };
}
before(async () => {
  migrateTestDatabase();
  owner = await createUser('Career Owner');
  other = await createUser('Career Other');
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ClaudeProcessRunner)
    .useValue({
      complete: () => {
        modelCalls++;
        return Promise.reject(new Error('No AI expected.'));
      },
    })
    .overrideProvider(JOB_READ_SCHEDULER)
    .useValue({ enqueue: () => {} })
    .compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const id = req.headers['x-test-user'];
    Object.assign(req, { session: typeof id === 'string' ? { userId: id } : {} });
    next();
  });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  resumeId = (await json<{ id: string }>('/resumes', 'POST', { name: 'Original CV' })).id;
  const saved = await json<{ snapshot: number }>(`/resumes/${resumeId}/save`, 'POST', {
    summaries: [{ variant: 'default', text: 'Original CV text.' }],
  });
  snapshot = saved.snapshot;
  foreignId = (await json<{ id: string }>('/resumes', 'POST', { name: 'Foreign CV' }, other.user.id)).id;
  await json(
    `/resumes/${foreignId}/save`,
    'POST',
    { summaries: [{ variant: 'default', text: 'Other user source.' }] },
    other.user.id,
  );
});
after(async () => {
  await app?.close();
  await prisma.$disconnect();
});

test('a first file import fills a profile without creating or requiring a CV in Documents', async () => {
  const fresh = await createUser('First File Import');
  const source = { kind: 'file', name: 'first-cv.txt' };
  const saved = await json<CareerState>(
    '/profile/career/import',
    'POST',
    {
      expectedRevision: 0,
      source,
      contact: { phone: '+1 555 0400' },
      expectedContact: { phone: '' },
      sections: { experiences: [role], skills: ['Node.js'] },
    },
    fresh.user.id,
  );
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.data.experiences?.source, source);
  const profile = await json<{ currentCompany: string; phone: string }>(
    '/profile',
    'GET',
    undefined,
    fresh.user.id,
  );
  assert.equal(profile.currentCompany, role.company);
  assert.equal(profile.phone, '+1 555 0400');
  assert.equal(await prisma.resume.count({ where: { profileId: fresh.profile.id } }), 0);
  assert.equal(modelCalls, 0);
});

test('reading import data never parses, copies CV history or changes the profile', async () => {
  const before = await prisma.profile.findUniqueOrThrow({ where: { userId: owner.user.id } });
  assert.deepEqual(await read(), { revision: 0, data: {} });
  const after = await prisma.profile.findUniqueOrThrow({ where: { userId: owner.user.id } });
  assert.equal(after.updatedAt.toISOString(), before.updatedAt.toISOString());
  assert.equal(modelCalls, 0);
});
test('a reviewed import atomically fills selected contacts and career sections without changing the CV', async () => {
  const original = await json(`/resumes/${resumeId}`);
  const oldProfile = await json<{ firstName: string; phone: string }>('/profile');
  const saved = await json<CareerState>('/profile/career/import', 'POST', {
    ...input(0),
    contact: { phone: '+1 555 0100' },
    expectedContact: { phone: oldProfile.phone },
    sections: {
      summary: 'A reviewed summary.',
      experiences: [role],
      skills: ['Node.js', 'PostgreSQL'],
      educations: [
        {
          institution: 'Example University',
          degree: 'Bachelor',
          field: 'Computer Science',
          from: '2013',
          to: '2016',
        },
      ],
    },
  });
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.data.experiences?.value, [role]);
  assert.deepEqual(saved.data.experiences?.source, { kind: 'resume', id: resumeId, snapshot });
  assert.ok(saved.data.experiences?.importedAt);
  assert.deepEqual(await read(), saved);
  const profile = await json<{
    firstName: string;
    phone: string;
    currentCompany: string;
    currentTitle: string;
  }>('/profile');
  assert.equal(profile.firstName, oldProfile.firstName);
  assert.equal(profile.phone, '+1 555 0100');
  assert.equal(profile.currentCompany, role.company);
  assert.equal(profile.currentTitle, role.title);
  assert.deepEqual(await json(`/resumes/${resumeId}`), original);
  assert.equal(modelCalls, 0);
});
test('CV edits cannot change imported profile history or source snapshots', async () => {
  const before = await read();
  await json(`/resumes/${resumeId}/save`, 'POST', {
    summaries: [{ variant: 'default', text: 'A tailored CV summary.' }],
  });
  assert.deepEqual(await read(), before);
  assert.equal((await json<{ currentCompany: string }>('/profile')).currentCompany, role.company);
});
test('partial re-import changes only the chosen section and keeps other provenance and contacts', async () => {
  const before = await read();
  const saved = await json<CareerState>('/profile/career/import', 'POST', {
    ...input(before.revision),
    source: { kind: 'file', name: 'updated-cv.pdf' },
    sections: { summary: 'A new reviewed summary.' },
  });
  assert.equal(saved.data.summary?.source.kind, 'file');
  assert.equal(saved.data.summary?.value, 'A new reviewed summary.');
  assert.deepEqual(saved.data.experiences, before.data.experiences);
  assert.deepEqual(saved.data.educations, before.data.educations);
  assert.deepEqual(saved.data.skills, before.data.skills);
  assert.equal((await json<{ phone: string }>('/profile')).phone, '+1 555 0100');
});
test('authentication, ownership, unknown fields and malformed imports fail without changing saved data', async () => {
  const before = await read(),
    valid = { ...input(before.revision), sections: { skills: ['Redis'] } };
  assert.equal((await request('/profile/career', 'GET', undefined, null)).status, 401);
  assert.equal((await request('/profile/career/import', 'POST', valid, null)).status, 401);
  assert.equal(
    (
      await request('/profile/career/import', 'POST', {
        ...valid,
        source: { kind: 'resume', id: foreignId, snapshot: 1 },
      })
    ).status,
    404,
  );
  for (const invalid of [
    { ...valid, userId: other.user.id },
    { ...valid, contact: { workAuthorization: 'yes' } },
    { ...valid, sections: { experiences: [{ ...role, verified: true }] } },
    { ...valid, sections: { summary: 'x'.repeat(10001) } },
    { ...valid, sections: {} },
    { ...valid, contact: { email: 'new@example.com' }, expectedContact: {} },
  ])
    assert.equal((await request('/profile/career/import', 'POST', invalid)).status, 400);
  assert.deepEqual(await read(), before);
  assert.deepEqual(await json('/profile/career', 'GET', undefined, other.user.id), { revision: 0, data: {} });
});
test('outdated review and concurrently edited selected contacts produce 409 with no partial career writes', async () => {
  const before = await read();
  assert.equal(
    (
      await request('/profile/career/import', 'POST', {
        ...input(before.revision - 1),
        sections: { skills: ['Must not save'] },
        contact: { phone: 'Must not save' },
        expectedContact: { phone: '+1 555 0100' },
      })
    ).status,
    409,
  );
  assert.deepEqual(await read(), before);
  await json('/profile', 'PUT', { phone: '+1 555 0200' });
  assert.equal(
    (
      await request('/profile/career/import', 'POST', {
        ...input(before.revision),
        sections: { skills: ['Must not save'] },
        contact: { phone: '+1 555 0300' },
        expectedContact: { phone: '+1 555 0100' },
      })
    ).status,
    409,
  );
  assert.equal((await json<{ phone: string }>('/profile')).phone, '+1 555 0200');
  assert.deepEqual(await read(), before);
});
test('simultaneous imports against one revision save exactly one result and preserve unrelated sections', async () => {
  const before = await read();
  const responses = await Promise.all(
    ['Redis', 'Kafka'].map((skill) =>
      request('/profile/career/import', 'POST', { ...input(before.revision), sections: { skills: [skill] } }),
    ),
  );
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  const saved = await read();
  assert.equal(saved.revision, before.revision + 1);
  assert.equal(saved.data.skills?.value.length, 1);
  assert.deepEqual(saved.data.experiences, before.data.experiences);
});
