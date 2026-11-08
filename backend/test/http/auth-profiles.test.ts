import 'reflect-metadata';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import session from 'express-session';
import { AuthController } from '../../src/modules/auth/adapters/inbound/http/auth.controller';
import { AuthGuard } from '../../src/modules/auth/adapters/inbound/http/auth.guard';
import { AuthenticationError } from '../../src/modules/auth/application/errors';
import { EmbedSessions } from '../../src/modules/auth/application/use-cases/embed-sessions';
import { memoryEmbeds } from '../fixtures/memory-embeds';
import { AUTH_API, AUTH_SETTINGS } from '../../src/modules/auth/auth.tokens';
import type { AuthApi, PublicUser } from '../../src/modules/auth/contracts';
import { ProfilesController } from '../../src/modules/profiles/adapters/inbound/http/profiles.controller';
import type { ProfileApi } from '../../src/modules/profiles/contracts';
import { EMPTY_CONTACT, type ContactFields } from '../../src/modules/profiles/domain/contact';
import { PROFILE_API } from '../../src/modules/profiles/profiles.tokens';

const users = new Map<string, PublicUser>([
  ['owner', { id: 'owner', email: 'owner@example.com', name: 'Owner', avatarUrl: null }],
  [
    'other',
    { id: 'other', email: 'other@example.com', name: 'Other', avatarUrl: 'https://example.com/avatar' },
  ],
]);
const tokens = new Map<string, string>();
let sequence = 0;
const embeds = new EmbedSessions(memoryEmbeds(), { generate: () => `embed-${++sequence}` });
const auth: AuthApi = {
  issueEmbedTicket: (id) => embeds.issueTicket(id),
  openEmbedSession: (ticket) => embeds.open(ticket),
  resolveEmbedToken: (token) => embeds.resolve(token),
  signInWithGoogle(credential) {
    const user = users.get(credential);
    return user
      ? Promise.resolve({ ...user, syncToken: 'must-not-leak' })
      : Promise.reject(new AuthenticationError('Invalid Google token.'));
  },
  findById(id) {
    return Promise.resolve(users.get(id) ?? null);
  },
  issueSyncToken(id) {
    const token = `sync-${++sequence}`;
    tokens.set(id, token);
    return Promise.resolve(token);
  },
  currentSyncToken(id) {
    return Promise.resolve(tokens.get(id) ?? null);
  },
  resolveSyncToken(token) {
    const id = [...tokens].find(([, candidate]) => candidate === token)?.[0];
    return id ? Promise.resolve(id) : Promise.reject(new AuthenticationError('Invalid sync token.'));
  },
};
const contacts = new Map<string, ContactFields>();
const profiles: ProfileApi = {
  get(id) {
    return Promise.resolve(contacts.get(id) ?? { ...EMPTY_CONTACT, email: `${id}@example.com` });
  },
  async save(id, incoming) {
    const value = { ...(await this.get(id)), ...incoming };
    contacts.set(id, value);
    return value;
  },
  async bySyncToken(token) {
    return this.get(await auth.resolveSyncToken(token));
  },
  contactOnly(id) {
    return this.get(id);
  },
};

@Module({
  controllers: [AuthController, ProfilesController],
  providers: [
    AuthGuard,
    { provide: AUTH_API, useValue: auth },
    { provide: AUTH_SETTINGS, useValue: { googleClientId: 'fake-client-id' } },
    { provide: PROFILE_API, useValue: profiles },
  ],
})
class HttpFixtureModule {}

let app: INestApplication;
let base: string;
before(async () => {
  app = await NestFactory.create(HttpFixtureModule, { logger: false });
  app.setGlobalPrefix('api');
  app.use(
    session({
      secret: 'http-auth-profile-test-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 30 * 24 * 60 * 60 * 1000 },
    }),
  );
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
after(async () => {
  await app?.close();
});

async function request(
  path: string,
  options: { method?: string; cookie?: string; token?: string; body?: unknown } = {},
) {
  return fetch(`${base}/api/${path}`, {
    method: options.method,
    headers: {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.token ? { authorization: options.token } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}
async function login(id: string, previousCookie?: string) {
  const response = await request('auth/google', {
    method: 'POST',
    body: { credential: id },
    cookie: previousCookie,
  });
  assert.equal(response.status, 201);
  const cookie = response.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.deepEqual(await response.json(), users.get(id));
  return cookie.split(';')[0];
}

test('HTTP exposes client config and maps authentication failures to JSON 401 messages', async () => {
  const config = await request('auth/config');
  assert.equal(config.status, 200);
  assert.deepEqual(await config.json(), { googleClientId: 'fake-client-id', configured: true });
  const unauthorized = await request('auth/me');
  assert.equal(unauthorized.status, 401);
  assert.equal(((await unauthorized.json()) as { message: string }).message, 'Not signed in.');
  const invalid = await request('auth/google', { method: 'POST', body: { credential: 'invalid' } });
  assert.equal(invalid.status, 401);
  assert.equal(((await invalid.json()) as { message: string }).message, 'Invalid Google token.');
});

test('HTTP rotates the web session on login and destroys it on logout', async () => {
  const first = await login('owner');
  const second = await login('owner', first);
  assert.notEqual(first, second);
  assert.equal((await request('auth/me', { cookie: first })).status, 401);
  const current = await request('auth/me', { cookie: second });
  assert.deepEqual(await current.json(), users.get('owner'));
  const logout = await request('auth/logout', { method: 'POST', cookie: second });
  assert.equal(logout.status, 201);
  assert.deepEqual(await logout.json(), { ok: true });
  assert.equal((await request('auth/me', { cookie: second })).status, 401);
});

test('HTTP profile save/read remains session-scoped and sync exposes only credential owner', async () => {
  const ownerCookie = await login('owner');
  const otherCookie = await login('other');
  assert.equal((await request('profile')).status, 401);
  const saved = await request('profile', {
    method: 'PUT',
    cookie: ownerCookie,
    body: { phone: 'owner-phone' },
  });
  assert.equal(saved.status, 200);
  assert.equal(((await saved.json()) as ContactFields).phone, 'owner-phone');
  assert.equal(
    ((await (await request('profile', { cookie: otherCookie })).json()) as ContactFields).phone,
    '',
  );
  const missing = await request('profile/sync');
  assert.equal(missing.status, 401);
  assert.equal(((await missing.json()) as { message: string }).message, 'Missing sync token.');
  const before = await request('profile/sync-token', { cookie: ownerCookie });
  assert.deepEqual(await before.json(), { token: null });
  const rotated = await request('profile/sync-token', { method: 'POST', cookie: ownerCookie });
  assert.equal(rotated.status, 201);
  const { token } = (await rotated.json()) as { token: string };
  const synced = await request('profile/sync', { token: `bEaReR  ${token} ` });
  assert.equal(synced.status, 200);
  assert.equal(((await synced.json()) as ContactFields).phone, 'owner-phone');
  await request('profile/sync-token', { method: 'POST', cookie: ownerCookie });
  const oldToken = await request('profile/sync', { token: `Bearer ${token}` });
  assert.equal(oldToken.status, 401);
  assert.equal(((await oldToken.json()) as { message: string }).message, 'Invalid sync token.');
});

test('HTTP extension login retains user/syncToken result and no web session', async () => {
  const response = await request('auth/extension', { method: 'POST', body: { credential: 'other' } });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('set-cookie'), null);
  const result = (await response.json()) as { user: PublicUser; syncToken: string };
  assert.deepEqual(result.user, users.get('other'));
  assert.equal(typeof result.syncToken, 'string');
  const synced = await request('profile/sync', { token: `Bearer ${result.syncToken}` });
  assert.equal(synced.status, 200);
  assert.equal(((await synced.json()) as ContactFields).email, 'other@example.com');
});

test('HTTP Quick tailoring in a job page: the extension gets a ticket, the frame trades it for an embed session', async () => {
  assert.equal(
    (await request('auth/embed-ticket', { method: 'POST' })).status,
    401,
    'only the extension asks for tickets',
  );
  const cookie = await login('owner');
  assert.equal(
    (await request('auth/embed-ticket', { method: 'POST', cookie })).status,
    401,
    'a web session cannot mint tickets',
  );
  const sync = await auth.issueSyncToken('owner');
  const issued = await request('auth/embed-ticket', { method: 'POST', token: `Bearer ${sync}` });
  assert.equal(issued.status, 201);
  const { ticket } = (await issued.json()) as { ticket: string };

  assert.equal((await request('auth/embed-session', { method: 'POST', body: {} })).status, 400);
  const opened = await request('auth/embed-session', { method: 'POST', body: { ticket } });
  assert.equal(opened.status, 201);
  assert.equal(opened.headers.get('set-cookie'), null, 'no cookie: the frame sends its token itself');
  const { token } = (await opened.json()) as { token: string };
  const again = await request('auth/embed-session', { method: 'POST', body: { ticket } });
  assert.equal(again.status, 401, 'a ticket is used once');
  assert.match(((await again.json()) as { message: string }).message, /expired/);

  const me = await request('auth/me', { token: `Embed ${token}` });
  assert.equal(me.status, 200);
  assert.deepEqual(await me.json(), users.get('owner'));
  assert.equal(
    (await request('profile', { token: `Embed ${token}` })).status,
    200,
    "the app's own endpoints accept it",
  );
  for (const wrong of [`Embed ${ticket}`, `Embed nope`, `Bearer ${token}`, `Bearer ${sync}`]) {
    assert.equal((await request('auth/me', { token: wrong })).status, 401, wrong);
  }
});
