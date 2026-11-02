/* eslint-disable @typescript-eslint/require-await -- The fake model returns fixed content without network calls. */
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
import { PRACTICE_GENERATOR } from '../../src/modules/interviews/interviews.tokens';
import type { PracticeGenerator } from '../../src/modules/interviews/application/ports/practice';
import {
  PracticeError,
  type PracticeContext,
  type PracticeView,
} from '../../src/modules/interviews/domain/practice';

let app: INestApplication, base: string;
let owner: Awaited<ReturnType<typeof createUser>>, other: Awaited<ReturnType<typeof createUser>>;
let cvId: string;
let fail = false;
const inputs: PracticeContext[] = [];
const generator: PracticeGenerator = {
  identity: { provider: 'fake', model: 'test-model' },
  generate: async (kind, context) => {
    inputs.push(structuredClone(context));
    if (fail) throw new PracticeError('unavailable', 'Synthetic model failure');
    return {
      questions: Array.from({ length: 6 }, (_, i) => ({
        question: `${kind} ${i + 1}`,
        why: 'The role needs payment reliability.',
        answerKind: kind === 'technical' && i > 1 ? 'conceptual' : 'personal',
        answer: 'Explain payment retries; [add a measured result].',
        talkingPoints: ['Keep requests idempotent.'],
        followUps: [],
        evidenceIds: ['cv-summary-0'],
        needsInput: ['What result did you measure?'],
      })),
    };
  },
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
  const result = await request(path, method, body);
  assert.ok(result.ok, `${result.status} ${await result.clone().text()}`);
  return result.json() as Promise<T>;
}
async function job(cv = true, description = 'Build payment APIs with Node.js.') {
  const result = await json<{ id: string }>('/jobs/applications', 'POST', {
    title: 'Engineer',
    company: 'Example',
    status: 'interview',
    description,
  });
  if (cv) await json(`/jobs/applications/${result.id}/resume`, 'PATCH', { resumeId: cvId });
  return result.id;
}
const path = (id: string) => `/jobs/${id}/preparation/practice`;
before(async () => {
  migrateTestDatabase();
  owner = await createUser('Practice Owner');
  other = await createUser('Practice Other');
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PRACTICE_GENERATOR)
    .useValue(generator)
    .overrideProvider(ClaudeProcessRunner)
    .useValue({ complete: () => Promise.reject(new Error('No live AI calls in tests.')) })
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
  cvId = (await json<{ id: string }>('/resumes', 'POST', { name: 'Practice CV' })).id;
  await json(`/resumes/${cvId}/save`, 'POST', {
    contact: { firstName: 'Private', lastName: 'Candidate', email: 'private-source@example.com' },
    summaries: [{ variant: 'default', text: 'I built payment retries at Employer A.' }],
  });
});
after(async () => {
  await app?.close();
  await prisma.$disconnect();
});

test('practice is manual, saves independently, reuses output and survives a fresh HTTP read', async () => {
  const id = await job(),
    before = inputs.length;
  assert.deepEqual(await json(path(id)), { results: [], problems: [], running: [] });
  assert.equal(inputs.length, before);
  const hr = await json<PracticeView>(`${path(id)}/hr`, 'POST', {});
  assert.equal(hr.stale, false);
  assert.equal(hr.kind, 'hr');
  assert.deepEqual(await json(`${path(id)}/hr`, 'POST', {}), hr);
  assert.equal(inputs.length, before + 1);
  await json(`${path(id)}/technical`, 'POST', {});
  const saved = await json<{ results: PracticeView[] }>(path(id));
  assert.equal(saved.results.length, 2);
  assert.equal(await prisma.interviewPractice.count({ where: { jobId: id } }), 2);
  assert.ok(!JSON.stringify(inputs.at(-1)).includes('private-source@example.com'));
  assert.equal(await prisma.interviewPreparation.count({ where: { jobId: id } }), 0);
});

test('authentication, job ownership, kinds and body fields are enforced before AI', async () => {
  const id = await job(),
    before = inputs.length;
  for (const method of ['GET', 'POST']) {
    const route = path(id) + (method === 'POST' ? '/hr' : '');
    const body = method === 'POST' ? {} : undefined;
    assert.equal((await request(route, method, body, null)).status, 401);
    assert.equal((await request(route, method, body, other.user.id)).status, 404);
    assert.equal(
      (await request(path('missing') + (method === 'POST' ? '/hr' : ''), method, body)).status,
      404,
    );
  }
  for (const [kind, body] of [
    ['other', {}],
    ['hr', { userId: other.user.id }],
    ['hr', { regenerate: 'yes' }],
    ['hr', { cvId }],
  ] as const)
    assert.equal((await request(`${path(id)}/${kind}`, 'POST', body)).status, 400);
  assert.equal(inputs.length, before);
});

test('missing inputs block generation, while GET still opens the preparation', async () => {
  const before = inputs.length;
  for (const id of [await job(false), await job(true, '')]) {
    const state = await json<{ problems: string[] }>(path(id));
    assert.ok(state.problems.length);
    assert.equal((await request(`${path(id)}/hr`, 'POST', {})).status, 400);
  }
  assert.equal(inputs.length, before);
});

test('CV edits keep the attached snapshot; saved notes invalidate answers and failed generation preserves them', async () => {
  const id = await job();
  const saved = await json<PracticeView>(`${path(id)}/hr`, 'POST', {});
  const source = inputs.at(-1)!;
  await json(`/resumes/${cvId}/save`, 'POST', {
    summaries: [{ variant: 'default', text: 'New unrelated CV version.' }],
  });
  assert.equal((await json<{ results: PracticeView[] }>(path(id))).results[0].stale, false);
  await json(`/jobs/${id}/preparation`, 'PUT', {
    interviewType: 'technical_screen',
    interviewer: '',
    instructions: 'Explain retries.',
    notes: 'I owned the retry policy.',
    questions: '',
  });
  assert.equal((await json<{ results: PracticeView[] }>(path(id))).results[0].stale, true);
  fail = true;
  try {
    assert.equal((await request(`${path(id)}/hr`, 'POST', { regenerate: true })).status, 503);
  } finally {
    fail = false;
  }
  assert.equal((await json<{ results: PracticeView[] }>(path(id))).results[0].generatedAt, saved.generatedAt);
  const updated = await json<PracticeView>(`${path(id)}/hr`, 'POST', { regenerate: true });
  assert.equal(updated.stale, false);
  assert.equal(inputs.at(-1)!.cv?.snapshot, source.cv?.snapshot);
  assert.ok(inputs.at(-1)!.evidence.some((row) => row.text === 'I owned the retry policy.'));
  assert.ok(inputs.at(-1)!.evidence.some((row) => row.text === 'I built payment retries at Employer A.'));
  assert.ok(!inputs.at(-1)!.evidence.some((row) => row.text === 'New unrelated CV version.'));
});

test('deleting a job removes its generated practice and closes all practice endpoints', async () => {
  const id = await job();
  await json(`${path(id)}/hr`, 'POST', {});
  assert.equal((await request(`/jobs/${id}`, 'DELETE')).status, 204);
  assert.equal(await prisma.interviewPractice.count({ where: { jobId: id } }), 0);
  assert.equal((await request(path(id))).status, 404);
});
