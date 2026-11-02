import { prisma, migrateTestDatabase, createUser } from './setup';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from '../../src/app.module';
import { ClaudeProcessRunner } from '../../src/shared/ai/claude-process.runner';
import { JOB_READ_SCHEDULER } from '../../src/modules/jobs/jobs.tokens';
import { PrismaJobRepository } from '../../src/modules/jobs/adapters/outbound/persistence/prisma-job.repository';
import {
  AddApplication,
  ImportApplications,
} from '../../src/modules/jobs/application/use-cases/manage-applications';
import type { Job as DomainJob } from '../../src/modules/jobs/domain/job';

let app: INestApplication;
let base: string;
let owner: Awaited<ReturnType<typeof createUser>>, other: Awaited<ReturnType<typeof createUser>>;
let resumeId: string, foreignResumeId: string;
interface PublicJob extends Omit<DomainJob, 'appliedAt' | 'archivedAt'> {
  appliedAt: string | null;
  archivedAt: string | null;
  history?: { id: string; to: string; at: string }[];
}
async function request(
  path: string,
  options: { method?: string; body?: unknown; userId?: string | null } = {},
) {
  return fetch(`${base}/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.userId !== null ? { 'x-test-user': options.userId ?? owner.user.id } : {}),
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}
async function json<T>(path: string, options: Parameters<typeof request>[1] = {}): Promise<T> {
  const response = await request(path, options);
  assert.ok(response.ok, `${response.status} ${await response.clone().text()}`);
  return response.json() as Promise<T>;
}
async function add(title = 'Backend Engineer', extra: Record<string, unknown> = {}) {
  return json<PublicJob>('/jobs/applications', {
    method: 'POST',
    body: { title, company: 'Example', ...extra },
  });
}
before(async () => {
  migrateTestDatabase();
  owner = await createUser('Dashboard Owner');
  other = await createUser('Dashboard Other');
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ClaudeProcessRunner)
    .useValue({ complete: () => Promise.reject(new Error('Dashboard tests must never call AI.')) })
    .overrideProvider(JOB_READ_SCHEDULER)
    .useValue({ enqueue: () => {} })
    .compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.use((req: Request, _response: Response, next: NextFunction) => {
    const id = req.headers['x-test-user'];
    Object.assign(req, { session: typeof id === 'string' ? { userId: id } : {} });
    next();
  });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  const createResume = async (userId: string) => {
    const row = await json<{ id: string }>('/resumes', {
      method: 'POST',
      userId,
      body: { name: 'Application CV' },
    });
    await json(`/resumes/${row.id}/save`, {
      method: 'POST',
      userId,
      body: { summaries: [{ variant: 'default', text: 'A saved candidate summary.' }] },
    });
    return row.id;
  };
  resumeId = await createResume(owner.user.id);
  foreignResumeId = await createResume(other.user.id);
});
after(async () => {
  await app?.close();
  await prisma.$disconnect();
});

test('Add Application accepts structured fields without requiring AI or a description, records status and freezes the selected resume version', async () => {
  assert.equal(
    (
      await request('/jobs/applications', {
        method: 'POST',
        userId: null,
        body: { title: 'Engineer', company: 'Example' },
      })
    ).status,
    401,
  );
  assert.equal(
    (await request('/jobs/applications', { method: 'POST', body: { company: 'Example' } })).status,
    400,
  );
  const job = await add('Application with resume', {
    employmentType: 'Full-Time',
    location: 'Vancouver',
    resumeId,
    status: 'interview',
  });
  assert.equal(job.extraction, 'manual');
  assert.equal(job.status, 'interview');
  assert.equal(job.employmentType, 'Full-Time');
  assert.equal(job.applicationResumeId, resumeId);
  assert.equal(job.applicationSnapshot, 1);
  assert.ok(job.appliedAt);
  const detail = await json<PublicJob>(`/jobs/${job.id}`);
  assert.equal(detail.history?.length, 1);
  assert.equal(detail.history?.[0]?.to, 'interview');
  assert.equal(detail.history?.[0]?.at, detail.appliedAt);
  await json(`/resumes/${resumeId}/save`, {
    method: 'POST',
    body: { summaries: [{ variant: 'default', text: 'An updated candidate summary.' }] },
  });
  assert.equal((await json<PublicJob>(`/jobs/${job.id}`)).applicationSnapshot, 1);
  const count = await prisma.job.count({ where: { userId: owner.user.id } });
  assert.equal(
    (
      await request('/jobs/applications', {
        method: 'POST',
        body: { title: 'Foreign resume', company: 'Example', resumeId: foreignResumeId },
      })
    ).status,
    400,
  );
  assert.equal(await prisma.job.count({ where: { userId: owner.user.id } }), count);
});

test('favorite/archive changes persist independently of status, restore cleanly, and reject a mixed-owner batch atomically', async () => {
  const job = await add('Favorite candidate');
  const changed = await json<PublicJob[]>('/jobs/applications/preferences', {
    method: 'PATCH',
    body: { ids: [job.id], favorite: true, archived: true },
  });
  assert.equal(changed[0].isFavorite, true);
  assert.ok(changed[0].archivedAt);
  assert.equal(changed[0].status, 'applied');
  const listed = (await json<PublicJob[]>('/jobs')).find((row) => row.id === job.id)!;
  assert.equal(listed.isFavorite, true);
  assert.equal(listed.archivedAt, changed[0].archivedAt);
  await json('/jobs/applications/preferences', { method: 'PATCH', body: { ids: [job.id], archived: false } });
  assert.equal((await json<PublicJob>(`/jobs/${job.id}`)).archivedAt, null);
  const foreign = await json<PublicJob>('/jobs/applications', {
    method: 'POST',
    userId: other.user.id,
    body: { title: 'Other owner job', company: 'Other' },
  });
  assert.equal(
    (
      await request('/jobs/applications/preferences', {
        method: 'PATCH',
        body: { ids: [job.id, foreign.id], favorite: false },
      })
    ).status,
    404,
  );
  assert.equal((await json<PublicJob>(`/jobs/${job.id}`)).isFavorite, true);
  assert.equal(
    (await request('/jobs/applications/preferences', { method: 'PATCH', body: { ids: [job.id] } })).status,
    400,
  );
});

test('application dates survive later moves and undo clears the first application date correctly', async () => {
  const job = await add('Status dates', { status: 'saved' });
  assert.equal(job.appliedAt, null);
  const applied = await json<PublicJob>(`/jobs/${job.id}`, { method: 'PATCH', body: { status: 'applied' } });
  assert.ok(applied.appliedAt);
  const interview = await json<PublicJob>(`/jobs/${job.id}`, {
    method: 'PATCH',
    body: { status: 'interview' },
  });
  assert.equal(interview.appliedAt, applied.appliedAt);
  const unchanged = await json<PublicJob>(`/jobs/${job.id}`, {
    method: 'PATCH',
    body: { status: 'interview' },
  });
  assert.equal(unchanged.history?.length, 2);
  const undo = await json<PublicJob>(`/jobs/${job.id}/status/undo`, {
    method: 'POST',
    body: { eventId: interview.history![0].id },
  });
  assert.equal(undo.status, 'applied');
  assert.equal(undo.appliedAt, applied.appliedAt);
  const saved = await json<PublicJob>(`/jobs/${job.id}/status/undo`, {
    method: 'POST',
    body: { eventId: applied.history![0].id },
  });
  assert.equal(saved.status, 'saved');
  assert.equal(saved.appliedAt, null);
});

test('CSV import skips canonical duplicates, preserves metadata and supports a saved historical resume version', async () => {
  const tag = randomUUID();
  const url = `https://jobs.example.com/${tag}`;
  await add('Already saved', { url });
  const importedUrl = `https://jobs.example.com/${tag}/imported`;
  const result = await json<{ imported: number; skipped: number }>('/jobs/applications/import', {
    method: 'POST',
    body: {
      rows: [
        { title: 'Duplicate', company: 'Example', url: `${url}?utm_source=csv` },
        {
          title: 'Imported',
          company: 'CSV Co',
          url: importedUrl,
          status: 'offer',
          employmentType: 'Contract',
          favorite: true,
          archived: true,
          addedAt: '2026-08-01T00:00:00Z',
          appliedAt: '2026-08-02T00:00:00Z',
          resumeId,
          resumeSnapshot: 1,
        },
        { title: 'Duplicate within file', company: 'CSV Co', url: `${importedUrl}#ref` },
      ],
    },
  });
  assert.deepEqual(result, { imported: 1, skipped: 2 });
  const row = (await json<PublicJob[]>('/jobs')).find((job) => job.url === importedUrl)!;
  assert.equal(row.appliedAt, '2026-08-02T00:00:00.000Z');
  assert.equal(row.isFavorite, true);
  assert.ok(row.archivedAt);
  assert.equal(row.applicationSnapshot, 1);
  assert.equal(row.employmentType, 'Contract');
  assert.equal(
    (
      await request('/jobs/applications/import', {
        method: 'POST',
        body: { rows: [{ title: 'Bad version', company: 'Example', resumeId, resumeSnapshot: 999 }] },
      })
    ).status,
    400,
  );
});

test('export is user-scoped, retains descriptions, and excludes captured private data', async () => {
  const job = await add('CSV export', {
    description: 'Description with a comma, and\na second line.',
    status: 'saved',
  });
  const exported = await json<PublicJob[]>('/jobs/applications/export');
  const found = exported.find((row) => row.id === job.id)!;
  assert.equal(found.description, 'Description with a comma, and\na second line.');
  assert.ok(
    exported.every(
      (row) => !('userId' in row) && !('html' in row) && !('pageText' in row) && !('structuredData' in row),
    ),
  );
  const otherRows = await json<PublicJob[]>('/jobs/applications/export', { userId: other.user.id });
  assert.ok(!otherRows.some((row) => row.id === job.id));
});

test('application resume can be changed or removed without losing status or accepting foreign resumes', async () => {
  const job = await add('Change resume', { status: 'offer' });
  const attached = await json<PublicJob>(`/jobs/applications/${job.id}/resume`, {
    method: 'PATCH',
    body: { resumeId },
  });
  assert.equal(attached.applicationSnapshot, 2);
  assert.equal(attached.status, 'offer');
  assert.equal(
    (
      await request(`/jobs/applications/${job.id}/resume`, {
        method: 'PATCH',
        userId: other.user.id,
        body: { resumeId: foreignResumeId },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/jobs/applications/${job.id}/resume`, {
        method: 'PATCH',
        body: { resumeId: foreignResumeId },
      })
    ).status,
    400,
  );
  const removed = await json<PublicJob>(`/jobs/applications/${job.id}/resume`, {
    method: 'PATCH',
    body: { resumeId: null },
  });
  assert.equal(removed.applicationResumeId, null);
  assert.equal(removed.applicationSnapshot, null);
  assert.equal(removed.status, 'offer');
});

test('application creation and multi-row imports roll back if a status event cannot be recorded', async () => {
  const failure = prisma.$extends({
    query: {
      jobStatusEvent: {
        create() {
          throw new Error('Injected application event failure');
        },
      },
    },
  });
  const repository = new PrismaJobRepository(failure as unknown as typeof prisma);
  const resumes = { savedSnapshot: () => Promise.resolve(1) };
  const count = await prisma.job.count({ where: { userId: owner.user.id } });
  await assert.rejects(
    new AddApplication(repository, resumes).execute(owner.user.id, {
      title: 'Rollback app',
      company: 'Example',
    }),
    /Injected application event failure/,
  );
  assert.equal(await prisma.job.count({ where: { userId: owner.user.id } }), count);
  await assert.rejects(
    new ImportApplications(repository, resumes).execute(owner.user.id, [
      { title: 'Rollback first', company: 'Example', status: 'saved' },
      { title: 'Rollback second', company: 'Example', status: 'applied' },
    ]),
    /Injected application event failure/,
  );
  assert.equal(await prisma.job.count({ where: { userId: owner.user.id } }), count);
});
