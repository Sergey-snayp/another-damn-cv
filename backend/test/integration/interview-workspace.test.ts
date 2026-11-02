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
import type { Preparation } from '../../src/modules/interviews/domain/preparation';

let app: INestApplication;
let base: string;
let owner: Awaited<ReturnType<typeof createUser>>, other: Awaited<ReturnType<typeof createUser>>;
const input = {
  interviewType: 'recruiter_screen',
  interviewer: 'Recruiter',
  instructions: 'Discuss the product and team.',
  notes: 'Explain my own contribution to payment retries.\nAsk about the architecture.',
  questions: 'How does the team measure reliability?',
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
async function json<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await request(path, method, body);
  assert.ok(response.ok, `${response.status} ${await response.clone().text()}`);
  return response.json() as Promise<T>;
}
async function job() {
  return json<{ id: string }>('/jobs/applications', 'POST', {
    title: 'Product Engineer',
    company: 'Example',
    status: 'interview',
    description: 'Build payment APIs.',
  });
}
before(async () => {
  migrateTestDatabase();
  owner = await createUser('Preparation Owner');
  other = await createUser('Preparation Other');
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ClaudeProcessRunner)
    .useValue({ complete: () => Promise.reject(new Error('Workspace tests must not call AI.')) })
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
});
after(async () => {
  await app?.close();
  await prisma.$disconnect();
});

test('opening preparation returns an empty form without guessing an interview type or creating a row', async () => {
  const created = await job();
  const result = await json<Preparation>(`/jobs/${created.id}/preparation`);
  assert.deepEqual(result, {
    jobId: created.id,
    interviewType: null,
    interviewer: '',
    instructions: '',
    notes: '',
    questions: '',
    updatedAt: null,
  });
  assert.equal(await prisma.interviewPreparation.count({ where: { jobId: created.id } }), 0);
});

test('preparation saves and updates one account record while leaving the posting, schedule, and application status alone', async () => {
  const created = await job();
  const interview = { date: '2026-11-02', time: null, timeZone: 'America/Vancouver' };
  await json(`/jobs/${created.id}`, 'PATCH', { interview });
  const path = `/jobs/${created.id}/preparation`;
  const saved = await json<Preparation>(path, 'PUT', input);
  assert.ok(saved.updatedAt);
  assert.equal(saved.notes, input.notes);
  assert.deepEqual(await json<Preparation>(path), saved);
  assert.ok(!('userId' in saved) && !('id' in saved));
  await json(path, 'PUT', { ...input, interviewType: 'system_design', notes: 'Discuss trade-offs.' });
  assert.equal((await json<Preparation>(path)).interviewType, 'system_design');
  assert.equal(await prisma.interviewPreparation.count({ where: { jobId: created.id } }), 1);
  const unchanged = await json<{ title: string; status: string; description: string; interview: unknown }>(
    `/jobs/${created.id}`,
  );
  assert.equal(unchanged.title, 'Product Engineer');
  assert.equal(unchanged.status, 'interview');
  assert.equal(unchanged.description, 'Build payment APIs.');
  assert.deepEqual(unchanged.interview, interview);
});

test('preparation reads and writes reject missing sign-in, foreign jobs, and unknown jobs', async () => {
  const created = await job();
  const path = `/jobs/${created.id}/preparation`;
  await json(path, 'PUT', input);
  for (const method of ['GET', 'PUT']) {
    const body = method === 'PUT' ? input : undefined;
    assert.equal((await request(path, method, body, null)).status, 401);
    assert.equal((await request(path, method, body, other.user.id)).status, 404);
    assert.equal((await request('/jobs/missing/preparation', method, body)).status, 404);
  }
  assert.equal((await json<Preparation>(path)).notes, input.notes);
});

test('invalid preparation does not replace saved notes; clearing fields is explicit and supported', async () => {
  const created = await job();
  const path = `/jobs/${created.id}/preparation`;
  await json(path, 'PUT', input);
  for (const body of [
    { ...input, interviewType: 'invented' },
    { ...input, notes: 'x'.repeat(12001) },
    { ...input, userId: other.user.id },
    { notes: 'Partial payload' },
  ]) {
    assert.equal((await request(path, 'PUT', body)).status, 400);
  }
  assert.equal((await json<Preparation>(path)).notes, input.notes);
  const cleared = await json<Preparation>(path, 'PUT', {
    interviewType: null,
    interviewer: '',
    instructions: '',
    notes: '',
    questions: '',
  });
  assert.equal(cleared.interviewType, null);
  assert.equal(cleared.notes, '');
});

test('saved preparation survives status and archive changes and is removed with its deleted job', async () => {
  const created = await job();
  const path = `/jobs/${created.id}/preparation`;
  await json(path, 'PUT', input);
  await json(`/jobs/${created.id}`, 'PATCH', { status: 'rejected' });
  await json('/jobs/applications/preferences', 'PATCH', { ids: [created.id], archived: true });
  assert.equal((await json<Preparation>(path)).notes, input.notes);
  assert.equal((await request(`/jobs/${created.id}`, 'DELETE')).status, 204);
  assert.equal(await prisma.interviewPreparation.count({ where: { jobId: created.id } }), 0);
  assert.equal((await request(path)).status, 404);
});
