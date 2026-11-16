import { prisma, migrateTestDatabase, createUser } from './setup';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { JOB_READ_SCHEDULER } from '../../src/modules/jobs/jobs.tokens';

// The extension's job-site login on a real database (cv_test): saved sealed,
// read back only with the owner's extension token, never cached.
let app: INestApplication;
let base: string;
let owner: Awaited<ReturnType<typeof createUser>>;
let ownerToken: string, otherToken: string;

const call = (method: string, token: string | null, body?: unknown) =>
  fetch(`${base}/api/extension/site-login`, {
    method,
    headers: { ...(token && { authorization: `Bearer ${token}` }), ...(body !== undefined && { 'content-type': 'application/json' }) },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

before(async () => {
  migrateTestDatabase();
  owner = await createUser('Login Owner');
  const other = await createUser('Login Other');
  [ownerToken, otherToken] = [`token-${randomUUID()}`, `token-${randomUUID()}`];
  await prisma.user.update({ where: { id: owner.user.id }, data: { syncToken: ownerToken } });
  await prisma.user.update({ where: { id: other.user.id }, data: { syncToken: otherToken } });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JOB_READ_SCHEDULER)
    .useValue({ enqueue: () => {} })
    .compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});

after(async () => {
  await app?.close();
  await prisma.$disconnect();
});

test('the login is saved sealed, read back by its owner only, and never cached', async () => {
  const empty = await call('GET', ownerToken);
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { login: null });

  const password = 'Wd7!kq#Pz2mR9xLa';
  const saved = await call('PUT', ownerToken, { email: 'owner@example.com', password });
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get('cache-control'), 'no-store');
  assert.equal((await saved.json()).login.password, password);

  const row = await prisma.siteLogin.findUnique({ where: { userId: owner.user.id } });
  assert.ok(row && !row.sealedPassword.includes(password) && row.sealedPassword.startsWith('v1.'), 'the database holds only the seal');

  const read = await call('GET', ownerToken);
  assert.equal(read.headers.get('cache-control'), 'no-store');
  assert.deepEqual(((await read.json()) as { login: { email: string; password: string } }).login, { email: 'owner@example.com', password, updatedAt: row!.updatedAt.toISOString() });

  assert.deepEqual(await (await call('GET', otherToken)).json(), { login: null }, "another user never sees it");
  assert.equal((await call('GET', null)).status, 401, 'not without the extension token');
  assert.equal((await call('PUT', ownerToken, { email: 'owner@example.com', password: 'short' })).status, 400);
});
