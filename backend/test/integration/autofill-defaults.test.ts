import { prisma, migrateTestDatabase, createUser } from './setup';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from '../../src/app.module';
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
  owner = await createUser('Defaults Owner');
  other = await createUser('Defaults Other');
  [ownerToken, otherToken] = [`token-${randomUUID()}`, `token-${randomUUID()}`];
  await prisma.user.update({ where: { id: owner.user.id }, data: { syncToken: ownerToken } });
  await prisma.user.update({ where: { id: other.user.id }, data: { syncToken: otherToken } });
  const module = await Test.createTestingModule({ imports: [AppModule] })
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

type Row = { id: string; kind: string; scope: string; value: string };

test('the extension saves per-country and per-company defaults and the app manages them', async () => {
  assert.equal((await call('/extension/defaults')).status, 401);

  const save = await call('/extension/defaults', {
    method: 'POST',
    token: ownerToken,
    body: {
      defaults: [
        { kind: 'requiresSponsorship', scope: 'Poland', value: 'Yes' },
        { kind: 'workAuthorization', scope: 'Poland', value: 'No' },
        { kind: 'workedHereBefore', scope: 'Box', value: 'No' },
      ],
    },
  });
  assert.equal(save.status, 201);
  assert.equal(((await save.json()) as Row[]).length, 3);

  // The same kind and country replaces the answer instead of adding a row.
  await call('/extension/defaults', {
    method: 'POST',
    token: ownerToken,
    body: { defaults: [{ kind: 'workAuthorization', scope: 'poland', value: 'Yes' }] },
  });
  const rows = (await (await call('/extension/defaults', { token: ownerToken })).json()) as Row[];
  assert.deepEqual(
    rows.map((row) => [row.kind, row.scope, row.value]),
    [
      ['requiresSponsorship', 'Poland', 'Yes'],
      ['workAuthorization', 'poland', 'Yes'],
      ['workedHereBefore', 'Box', 'No'],
    ],
  );
  assert.deepEqual(await (await call('/extension/defaults', { token: otherToken })).json(), []);

  const box = rows.find((row) => row.kind === 'workedHereBefore')!;
  assert.equal((await call(`/defaults/${box.id}`, { method: 'DELETE', user: other.user.id })).status, 404);
  const patch = await call(`/defaults/${box.id}`, {
    method: 'PATCH',
    user: owner.user.id,
    body: { value: 'Yes' },
  });
  assert.equal(((await patch.json()) as Row).value, 'Yes');
  assert.equal(
    (await call(`/extension/defaults/${box.id}`, { method: 'DELETE', token: ownerToken })).status,
    204,
  );
  assert.equal(((await (await call('/defaults', { user: owner.user.id })).json()) as Row[]).length, 2);
});

test('the extension fills a missing profile value but cannot change name or email', async () => {
  assert.equal((await call('/extension/profile', { method: 'PATCH', body: { phone: '1' } })).status, 401);
  const saved = await call('/extension/profile', {
    method: 'PATCH',
    token: ownerToken,
    body: { phone: '+48 600 100 200' },
  });
  assert.equal(saved.status, 200);
  assert.equal(((await saved.json()) as { phone: string }).phone, '+48 600 100 200');
  const before = (await (await call('/profile', { user: owner.user.id })).json()) as { email: string };
  const refused = await call('/extension/profile', {
    method: 'PATCH',
    token: ownerToken,
    body: { email: 'x@evil.test' },
  });
  assert.equal(refused.status, 400);
  const afterRefusal = (await (await call('/profile', { user: owner.user.id })).json()) as {
    email: string;
    phone: string;
  };
  assert.equal(afterRefusal.email, before.email);
  assert.equal(afterRefusal.phone, '+48 600 100 200');
});

test('the extension forgets a saved answer by its question', async () => {
  await call('/extension/answers', {
    method: 'POST',
    token: ownerToken,
    body: { answers: [{ question: 'Are you open to relocation?', answer: 'No' }] },
  });
  const forget = await call('/extension/answers/forget', {
    method: 'POST',
    token: ownerToken,
    body: { question: 'Are you open to relocation' },
  });
  assert.deepEqual(await forget.json(), { forgotten: true });
  const left = (await (await call('/answers', { user: owner.user.id })).json()) as { question: string }[];
  assert.ok(!left.some((row) => row.question === 'Are you open to relocation?'));
});

test('relocation answers are kept per country and work types on the profile', async () => {
  await call('/extension/defaults', {
    method: 'POST',
    token: ownerToken,
    body: { defaults: [{ kind: 'willingToRelocate', scope: 'Poland', value: 'Yes' }] },
  });
  const rows = (await (await call('/extension/defaults', { token: ownerToken })).json()) as Row[];
  assert.ok(
    rows.some((row) => row.kind === 'willingToRelocate' && row.scope === 'Poland' && row.value === 'Yes'),
  );
  const saved = await call('/extension/profile', {
    method: 'PATCH',
    token: ownerToken,
    body: { workArrangements: 'Hybrid, Remote' },
  });
  assert.equal(((await saved.json()) as { workArrangements: string }).workArrangements, 'remote,hybrid');
  const app = await call('/profile', {
    method: 'PUT',
    user: owner.user.id,
    body: { workArrangements: 'onsite' },
  });
  assert.equal(((await app.json()) as { workArrangements: string }).workArrangements, 'onsite');
});
