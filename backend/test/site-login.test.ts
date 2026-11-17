import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AesGcmSecretBox } from '../src/modules/answers/adapters/outbound/crypto/aes-gcm-secret-box';
import {
  ForgetSiteOwnLogin,
  ListSiteAccounts,
  ListSitesWithOwnLogin,
  ReadSiteLogin,
  RememberSiteAccount,
  SaveSiteLogin,
  SaveSiteOwnLogin,
} from '../src/modules/answers/application/use-cases/site-login';
import type { SiteLoginRepository, StoredSiteLogin } from '../src/modules/answers/application/ports/site-login';
import { SiteLoginUnreadableError } from '../src/modules/answers/domain/site-login';
import { siteAccountSchema, siteLoginQuerySchema, siteLoginSchema } from '../src/modules/answers/adapters/inbound/http/site-login.controller';

const box = new AesGcmSecretBox('server-secret', 'site-login');

test('a sealed password opens again, and never shows in its seal', () => {
  const sealed = box.seal('Wd7!kq#Pz2mR9xLa');
  assert.match(sealed, /^v1\./);
  assert.ok(!sealed.includes('Wd7!kq#Pz2mR9xLa'));
  assert.equal(box.open(sealed), 'Wd7!kq#Pz2mR9xLa');
  assert.notEqual(box.seal('same'), box.seal('same'), 'each seal has its own nonce');
});

test('a changed seal, another key or another purpose does not open it', () => {
  const sealed = box.seal('Wd7!kq#Pz2mR9xLa');
  const raw = Buffer.from(sealed.slice(3), 'base64');
  raw[raw.length - 1] ^= 1;
  assert.throws(() => box.open(`v1.${raw.toString('base64')}`));
  assert.throws(() => new AesGcmSecretBox('another-secret', 'site-login').open(sealed));
  assert.throws(() => new AesGcmSecretBox('server-secret', 'something-else').open(sealed));
  assert.throws(() => box.open('plain text'));
});

function memory(): SiteLoginRepository & { rows: Map<string, StoredSiteLogin> } {
  const rows = new Map<string, StoredSiteLogin>();
  const hosts = new Map<string, string[]>();
  const own = new Map<string, StoredSiteLogin>();
  return {
    rows,
    findForSite: async (userId, host) => own.get(`${userId} ${host}`) ?? null,
    saveForSite: async (userId, host, login) => {
      const list = hosts.get(userId) ?? [];
      if (!list.includes(host)) hosts.set(userId, [...list, host]);
      if (!login) { own.delete(`${userId} ${host}`); return null; }
      const row = { ...login, updatedAt: new Date('2026-11-17T10:00:00Z') };
      own.set(`${userId} ${host}`, row);
      return row;
    },
    sitesWithOwnLogin: async (userId) => (hosts.get(userId) ?? []).filter((host) => own.has(`${userId} ${host}`)),
    sites: async (userId) => hosts.get(userId) ?? [],
    addSite: async (userId, host) => { const list = hosts.get(userId) ?? []; if (!list.includes(host)) hosts.set(userId, [...list, host]); },
    find: async (userId) => rows.get(userId) ?? null,
    save: async (userId, login) => {
      const row = { ...login, updatedAt: new Date('2026-11-16T10:00:00Z') };
      rows.set(userId, row);
      return row;
    },
  };
}

test('the login is saved sealed and read back whole; none before the first', async () => {
  const logins = memory();
  assert.equal(await new ReadSiteLogin(logins, box).execute('u1'), null);
  const saved = await new SaveSiteLogin(logins, box).execute('u1', { email: ' sam@example.com ', password: 'Wd7!kq#Pz2mR9xLa' });
  assert.deepEqual(saved, { email: 'sam@example.com', password: 'Wd7!kq#Pz2mR9xLa', updatedAt: '2026-11-16T10:00:00.000Z' });
  assert.ok(!logins.rows.get('u1')!.sealedPassword.includes('Wd7!kq#Pz2mR9xLa'), 'stored sealed');
  assert.deepEqual(await new ReadSiteLogin(logins, box).execute('u1'), saved);
});

test('a login sealed with an old key says so instead of a wrong password', async () => {
  const logins = memory();
  await new SaveSiteLogin(logins, new AesGcmSecretBox('old-secret', 'site-login')).execute('u1', { email: 'sam@example.com', password: 'Wd7!kq#Pz2mR9xLa' });
  await assert.rejects(new ReadSiteLogin(logins, box).execute('u1'), SiteLoginUnreadableError);
});

test('only an email and a password of 8 to 128 characters are accepted', () => {
  assert.ok(siteLoginSchema.safeParse({ email: 'sam@example.com', password: 'Wd7!kq#Pz2mR9xLa' }).success);
  assert.ok(!siteLoginSchema.safeParse({ email: 'not an email', password: 'Wd7!kq#Pz2mR9xLa' }).success);
  assert.ok(!siteLoginSchema.safeParse({ email: 'sam@example.com', password: 'short' }).success);
  assert.ok(!siteLoginSchema.safeParse({ email: 'sam@example.com', password: 'Wd7!kq#Pz2mR9xLa', userId: 'x' }).success);
});

test('a site is remembered once, by its host in lower case', async () => {
  const logins = memory();
  const remember = new RememberSiteAccount(logins);
  await remember.execute('u1', 'UBC.wd10.myworkdayjobs.com');
  assert.deepEqual(await remember.execute('u1', 'ubc.wd10.myworkdayjobs.com'), ['ubc.wd10.myworkdayjobs.com']);
  assert.deepEqual(await new ListSiteAccounts(logins).execute('u2'), [], 'per person');
});

test('only a host name is accepted as a site', () => {
  assert.equal(siteAccountSchema.parse({ host: 'UBC.wd10.myworkdayjobs.com' }).host, 'ubc.wd10.myworkdayjobs.com');
  for (const host of ['https://ubc.wd10.myworkdayjobs.com', 'ubc.wd10.myworkdayjobs.com/path', 'localhost', 'a b.com', ''])
    assert.ok(!siteAccountSchema.safeParse({ host }).success, host);
});

test('a site with its own login gets it; every other site keeps the one saved login', async () => {
  const logins = memory();
  await new SaveSiteLogin(logins, box).execute('u1', { email: 'sam@example.com', password: 'Main-pass-123' });
  const own = await new SaveSiteOwnLogin(logins, box).execute('u1', 'UBC.wd10.myworkdayjobs.com', { email: 'sam@example.com', password: 'Ubc-only-456' });
  assert.deepEqual(own, { email: 'sam@example.com', password: 'Ubc-only-456', updatedAt: '2026-11-17T10:00:00.000Z', site: 'ubc.wd10.myworkdayjobs.com' });
  const read = new ReadSiteLogin(logins, box);
  assert.equal((await read.execute('u1', 'ubc.wd10.myworkdayjobs.com'))!.password, 'Ubc-only-456', 'that site: its own');
  assert.equal((await read.execute('u1', 'workday.wd5.myworkdayjobs.com'))!.password, 'Main-pass-123', 'another site: the main one');
  assert.equal((await read.execute('u1'))!.password, 'Main-pass-123', 'no site: the main one');
  assert.equal((await read.execute('u2', 'ubc.wd10.myworkdayjobs.com')), null, 'per person');
  assert.deepEqual(await new ListSitesWithOwnLogin(logins).execute('u1'), ['ubc.wd10.myworkdayjobs.com']);
  assert.deepEqual(await new ListSiteAccounts(logins).execute('u1'), ['ubc.wd10.myworkdayjobs.com'], 'the site is one with an account');
  assert.deepEqual(await new ForgetSiteOwnLogin(logins).execute('u1', 'ubc.wd10.myworkdayjobs.com'), [], 'back to the main one');
  assert.equal((await read.execute('u1', 'ubc.wd10.myworkdayjobs.com'))!.password, 'Main-pass-123');
});

test('a site\'s login is asked for by its host only', () => {
  assert.equal(siteLoginQuerySchema.parse({ host: 'UBC.wd10.myworkdayjobs.com' }).host, 'ubc.wd10.myworkdayjobs.com');
  assert.deepEqual(siteLoginQuerySchema.parse({}), {});
  assert.ok(!siteLoginQuerySchema.safeParse({ host: 'https://ubc.wd10.myworkdayjobs.com' }).success);
  assert.ok(!siteLoginQuerySchema.safeParse({ host: 'ubc.wd10.myworkdayjobs.com', userId: 'x' }).success);
});
