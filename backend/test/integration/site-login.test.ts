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
  assert.deepEqual(await empty.json(), { login: null, sites: [], ownLogins: [] });

  const password = 'Wd7!kq#Pz2mR9xLa';
  const saved = await call('PUT', ownerToken, { email: 'owner@example.com', password });
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get('cache-control'), 'no-store');
  assert.equal(((await saved.json()) as { login: { password: string } }).login.password, password);

  const row = await prisma.siteLogin.findUnique({ where: { userId: owner.user.id } });
  assert.ok(row && !row.sealedPassword.includes(password) && row.sealedPassword.startsWith('v1.'), 'the database holds only the seal');

  const read = await call('GET', ownerToken);
  assert.equal(read.headers.get('cache-control'), 'no-store');
  assert.deepEqual(((await read.json()) as { login: { email: string; password: string } }).login, { email: 'owner@example.com', password, updatedAt: row!.updatedAt.toISOString() });

  assert.deepEqual(await (await call('GET', otherToken)).json(), { login: null, sites: [], ownLogins: [] }, "another user never sees it");
  assert.equal((await call('GET', null)).status, 401, 'not without the extension token');
  assert.equal((await call('PUT', ownerToken, { email: 'owner@example.com', password: 'short' })).status, 400);
});

test('the sites the person has an account on: added once, read with the login, never another person\'s', async () => {
  const add = (token: string, host: string) => fetch(`${base}/api/extension/site-login/sites`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ host }),
  });
  assert.deepEqual(await (await add(ownerToken, 'UBC.wd10.myworkdayjobs.com')).json(), { sites: ['ubc.wd10.myworkdayjobs.com'] });
  assert.deepEqual(await (await add(ownerToken, 'ubc.wd10.myworkdayjobs.com')).json(), { sites: ['ubc.wd10.myworkdayjobs.com'] }, 'once');
  assert.deepEqual(((await (await call('GET', ownerToken)).json()) as { sites: string[] }).sites, ['ubc.wd10.myworkdayjobs.com']);
  assert.deepEqual(((await (await call('GET', otherToken)).json()) as { sites: string[] }).sites, []);
  assert.equal((await add(ownerToken, 'https://ubc.wd10.myworkdayjobs.com/x')).status, 400);
});

test('a site with its own login: read for that site only, sealed, and given back to the main login', async () => {
  const site = (method: string, token: string, host: string, body?: unknown) => fetch(`${base}/api/extension/site-login/sites/${host}/login`, {
    method, headers: { authorization: `Bearer ${token}`, ...(body !== undefined && { 'content-type': 'application/json' }) }, ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const read = async (token: string, host?: string) => (await (await fetch(`${base}/api/extension/site-login${host ? `?host=${host}` : ''}`, { headers: { authorization: `Bearer ${token}` } })).json()) as { login: { password: string; site?: string } | null; ownLogins: string[] };
  const own = 'Ubc-only-456!';
  const saved = await site('PUT', ownerToken, 'workday.wd5.myworkdayjobs.com', { email: 'owner@example.com', password: own });
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get('cache-control'), 'no-store');
  const row = await prisma.siteAccount.findUnique({ where: { userId_host: { userId: owner.user.id, host: 'workday.wd5.myworkdayjobs.com' } } });
  assert.ok(row?.sealedPassword?.startsWith('v1.') && !row.sealedPassword.includes(own), 'the database holds only the seal');

  const there = await read(ownerToken, 'workday.wd5.myworkdayjobs.com');
  assert.equal(there.login!.password, own);
  assert.equal(there.login!.site, 'workday.wd5.myworkdayjobs.com');
  assert.deepEqual(there.ownLogins, ['workday.wd5.myworkdayjobs.com']);
  assert.notEqual((await read(ownerToken, 'ubc.wd10.myworkdayjobs.com')).login!.password, own, 'another site: the main login');
  assert.notEqual((await read(ownerToken)).login!.password, own);
  assert.equal((await read(otherToken, 'workday.wd5.myworkdayjobs.com')).login, null, "never another person's");
  assert.equal((await site('PUT', ownerToken, 'workday.wd5.myworkdayjobs.com', { email: 'owner@example.com', password: 'short' })).status, 400);
  assert.equal((await fetch(`${base}/api/extension/site-login?host=https://x.com`, { headers: { authorization: `Bearer ${ownerToken}` } })).status, 400);

  assert.deepEqual(await (await site('DELETE', ownerToken, 'workday.wd5.myworkdayjobs.com')).json(), { ownLogins: [] });
  assert.notEqual((await read(ownerToken, 'workday.wd5.myworkdayjobs.com')).login!.password, own, 'back to the main login');
});
