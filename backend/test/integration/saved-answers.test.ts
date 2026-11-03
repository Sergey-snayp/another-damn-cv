import { prisma, migrateTestDatabase, createUser } from './setup';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from '../../src/app.module';
import { ClaudeProcessRunner } from '../../src/shared/ai/claude-process.runner';
import { JOB_READ_SCHEDULER } from '../../src/modules/jobs/jobs.tokens';

let app: INestApplication;
let base: string;
let owner: Awaited<ReturnType<typeof createUser>>, other: Awaited<ReturnType<typeof createUser>>;
let ownerToken: string, otherToken: string;

function call(
  path: string,
  options: { method?: string; body?: unknown; user?: string; token?: string } = {},
) {
  return fetch(`${base}/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.user && { 'x-test-user': options.user }),
      ...(options.token && { authorization: `Bearer ${options.token}` }),
      ...(options.body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  });
}

before(async () => {
  migrateTestDatabase();
  owner = await createUser('Answers Owner');
  other = await createUser('Answers Other');
  [ownerToken, otherToken] = [`token-${randomUUID()}`, `token-${randomUUID()}`];
  await prisma.user.update({ where: { id: owner.user.id }, data: { syncToken: ownerToken } });
  await prisma.user.update({ where: { id: other.user.id }, data: { syncToken: otherToken } });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ClaudeProcessRunner)
    .useValue({ complete: () => Promise.reject(new Error('Answer tests must not call AI.')) })
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

test('the extension saves answers, finds them on the next form and the app manages them', async () => {
  assert.equal((await call('/extension/answers', { method: 'POST', body: { answers: [] } })).status, 401);

  const save = await call('/extension/answers', {
    method: 'POST',
    token: ownerToken,
    body: {
      company: 'Zexter',
      answers: [
        { question: 'Telegram account *', answer: '@ada' },
        { question: 'Why Zexter?', answer: 'Zexter ships iGaming products I use.' },
        { question: 'Referral', answer: ' ' },
      ],
    },
  });
  assert.equal(save.status, 201);
  assert.deepEqual(await save.json(), { saved: 2 });

  // Saving the same question again replaces the answer instead of adding a row.
  await call('/extension/answers', {
    method: 'POST',
    token: ownerToken,
    body: { company: 'Zexter', answers: [{ question: 'telegram account', answer: '@ada_l' }] },
  });

  const match = await call('/extension/answers/match', {
    method: 'POST',
    token: ownerToken,
    body: {
      company: 'Acme',
      questions: [
        { id: '1', question: 'Your Telegram', kind: 'text' },
        { id: '2', question: 'Why Zexter?', kind: 'textarea' },
        { id: '3', question: 'Fintech Experience', kind: 'textarea' },
      ],
    },
  });
  assert.equal(match.status, 200);
  const result = (await match.json()) as {
    matches: { id: string; value: string; match: string }[];
    skipped: { id: string; reason: string }[];
  };
  assert.deepEqual(
    result.matches.map((m) => [m.id, m.value, m.match]),
    [['1', '@ada_l', 'similar']],
  );
  assert.deepEqual(
    result.skipped.map((s) => [s.id, s.reason]),
    [['2', 'names-another-company']],
  );

  const list = (await (await call('/answers', { user: owner.user.id })).json()) as {
    id: string;
    question: string;
    answer: string;
    usedCount: number;
  }[];
  assert.equal(list.length, 2);
  const telegram = list.find((row) => row.answer === '@ada_l');
  assert.equal(telegram?.usedCount, 1, 'a filled answer counts as used');

  // Another user sees nothing, cannot match, edit or delete the owner's answers.
  assert.deepEqual(await (await call('/answers', { user: other.user.id })).json(), []);
  const foreign = await call('/extension/answers/match', {
    method: 'POST',
    token: otherToken,
    body: { questions: [{ id: '1', question: 'Telegram account', kind: 'text' }] },
  });
  assert.deepEqual(((await foreign.json()) as { matches: unknown[] }).matches, []);
  assert.equal(
    (await call(`/answers/${telegram.id}`, { method: 'PATCH', user: other.user.id, body: { answer: 'x' } }))
      .status,
    404,
  );
  assert.equal(
    (await call(`/answers/${telegram.id}`, { method: 'DELETE', user: other.user.id })).status,
    404,
  );

  const edited = await call(`/answers/${telegram.id}`, {
    method: 'PATCH',
    user: owner.user.id,
    body: { answer: '@ada.l' },
  });
  assert.equal(((await edited.json()) as { answer: string }).answer, '@ada.l');
  assert.equal(
    (await call(`/answers/${telegram.id}`, { method: 'PATCH', user: owner.user.id, body: { answer: '  ' } }))
      .status,
    400,
  );
  assert.equal(
    (await call(`/answers/${telegram.id}`, { method: 'DELETE', user: owner.user.id })).status,
    204,
  );
  assert.equal(((await (await call('/answers', { user: owner.user.id })).json()) as unknown[]).length, 1);
  assert.equal((await call('/answers')).status, 401);
});

test('a profile stores a Telegram handle like any other contact field', async () => {
  const saved = await call('/profile', { method: 'PUT', user: owner.user.id, body: { telegram: '@ada' } });
  assert.equal(saved.status, 200);
  assert.equal(((await saved.json()) as { telegram: string }).telegram, '@ada');
  const synced = (await (await call('/profile/sync', { token: ownerToken })).json()) as { telegram: string };
  assert.equal(synced.telegram, '@ada');
});
