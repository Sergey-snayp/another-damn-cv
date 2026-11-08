import { createUser, migrateTestDatabase, prisma } from './setup';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { PrismaAccountRepository } from '../../src/modules/auth/adapters/outbound/prisma-account.repository';
import { RandomSyncTokenGenerator } from '../../src/modules/auth/adapters/outbound/random-sync-token.generator';
import { AuthApplication } from '../../src/modules/auth/application/auth-api';
import { AuthenticationError } from '../../src/modules/auth/application/errors';
import { SignInWithGoogle } from '../../src/modules/auth/application/use-cases/sign-in-with-google';
import { SyncTokens } from '../../src/modules/auth/application/use-cases/sync-tokens';
import { EmbedSessions } from '../../src/modules/auth/application/use-cases/embed-sessions';
import { PrismaEmbedSessionStore } from '../../src/modules/auth/adapters/outbound/prisma-embed-session.store';
import { AuthIdentityReader } from '../../src/modules/profiles/adapters/outbound/auth-identity.reader';
import { PrismaProfileRepository } from '../../src/modules/profiles/adapters/outbound/prisma-profile.repository';
import { ProfilesApplication } from '../../src/modules/profiles/application/profile-api';
import { EnsureProfile } from '../../src/modules/profiles/application/use-cases/ensure-profile';
import { GetProfile } from '../../src/modules/profiles/application/use-cases/get-profile';
import { UpdateProfile } from '../../src/modules/profiles/application/use-cases/update-profile';
import { EMPTY_CONTACT } from '../../src/modules/profiles/domain/contact';

const accounts = new PrismaAccountRepository(prisma);
const auth = new AuthApplication(
  new SignInWithGoogle(
    { verify: () => Promise.reject(new Error('Live Google is disabled in database tests.')) },
    accounts,
  ),
  accounts,
  new SyncTokens(accounts, new RandomSyncTokenGenerator()),
  new EmbedSessions(new PrismaEmbedSessionStore(prisma), new RandomSyncTokenGenerator()),
);
const repository = new PrismaProfileRepository(prisma);
const directory = new EnsureProfile(repository, new AuthIdentityReader(auth));
const get = new GetProfile(directory, {
  read: () => Promise.resolve({ currentCompany: '', currentTitle: '', yearsExperience: '' }),
});
const profiles = new ProfilesApplication(get, new UpdateProfile(directory, repository, get), auth);

before(() => migrateTestDatabase());
after(() => prisma.$disconnect());

test('auth persistence matches Google subject while updating email and retaining an omitted name', async () => {
  const tag = randomUUID();
  const subject = `google-auth-${tag}`;
  const first = await accounts.upsertGoogleAccount({
    googleId: subject,
    email: `${tag}@example.com`,
    name: 'Original Name',
    avatarUrl: 'https://example.com/avatar',
  });
  const next = await accounts.upsertGoogleAccount({
    googleId: subject,
    email: `updated-${tag}@example.com`,
    avatarUrl: null,
  });
  assert.equal(next.id, first.id);
  assert.equal(next.email, `updated-${tag}@example.com`);
  assert.equal(next.name, 'Original Name');
  assert.equal(next.avatarUrl, null);
  assert.deepEqual(Object.keys(next).sort(), ['avatarUrl', 'email', 'id', 'name']);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: first.id } })).googleId, subject);
  assert.equal(await accounts.findById(randomUUID()), null);
});

test('account without a Google display name uses the email prefix on first creation', async () => {
  const tag = randomUUID();
  const user = await accounts.upsertGoogleAccount({
    googleId: `fallback-${tag}`,
    email: `${tag}@example.com`,
    avatarUrl: null,
  });
  assert.equal(user.name, tag);
  assert.equal(await auth.currentSyncToken(user.id), null);
});

test('database token rotation preserves the other user and rejects the revoked credential', async () => {
  const owner = await createUser('Token owner');
  const other = await createUser('Token other');
  const first = await auth.issueSyncToken(owner.user.id);
  const otherToken = await auth.issueSyncToken(other.user.id);
  assert.equal(await auth.resolveSyncToken(first), owner.user.id);
  const next = await auth.issueSyncToken(owner.user.id);
  assert.equal(await auth.currentSyncToken(owner.user.id), next);
  assert.equal(await auth.resolveSyncToken(next), owner.user.id);
  assert.equal(await auth.resolveSyncToken(otherToken), other.user.id);
  await assert.rejects(auth.resolveSyncToken(first), AuthenticationError);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: owner.user.id } })).syncToken, next);
});

test('embed tickets and sessions are stored as hashed, expiring session rows', async () => {
  const owner = await createUser('Embed owner');
  const ticket = await auth.issueEmbedTicket(owner.user.id);
  const rows = await prisma.userSession.findMany({ where: { sid: { startsWith: 'embed-ticket:' } } });
  assert.ok(rows.length > 0 && rows.every((row) => !row.sid.includes(ticket)), 'only a hash is stored');
  const token = await auth.openEmbedSession(ticket);
  await assert.rejects(auth.openEmbedSession(ticket), AuthenticationError, 'a ticket opens one session');
  assert.equal(await auth.resolveEmbedToken(token), owner.user.id);
  await assert.rejects(auth.resolveEmbedToken(ticket), AuthenticationError);
  const row = await prisma.userSession.findFirstOrThrow({
    where: { sid: { startsWith: 'embed-session:' }, sess: { path: ['embedUserId'], equals: owner.user.id } },
  });
  assert.equal((row.sess as { userId?: unknown }).userId, undefined, 'never usable as a cookie session');
  assert.ok(
    row.expire.getTime() > Date.now() + 7 * 60 * 60_000 &&
      row.expire.getTime() <= Date.now() + 8 * 60 * 60_000 + 1000,
  );
  await prisma.userSession.update({ where: { sid: row.sid }, data: { expire: new Date(Date.now() - 1000) } });
  await assert.rejects(auth.resolveEmbedToken(token), AuthenticationError, 'an expired session is refused');
});

test('profile directory lazily creates exactly one row and retains nullable stored fields', async () => {
  const tag = randomUUID();
  const user = await prisma.user.create({
    data: { googleId: `profile-${tag}`, email: `${tag}@example.com`, name: 'Ada  Lovelace' },
  });
  assert.equal(await repository.findByUserId(user.id), null);
  const first = await directory.ensureProfile(user.id);
  const again = await directory.ensureProfile(user.id);
  assert.equal(first.id, again.id);
  assert.equal(first.firstName, 'Ada');
  assert.equal(first.lastName, ' Lovelace');
  assert.equal(first.phone, null);
  assert.equal(first.pronouns, null);
  assert.ok(first.createdAt instanceof Date);
  assert.equal(await prisma.profile.count({ where: { userId: user.id } }), 1);
  const contact = await profiles.get(user.id);
  assert.equal(contact.fullName, 'Ada  Lovelace');
  assert.equal(contact.phone, '');
  assert.equal(contact.email, user.email);
  assert.deepEqual(Object.keys(contact).sort(), Object.keys(EMPTY_CONTACT).sort());
});

test('profile database updates keep omitted fields, preserve coercion and stay owner-scoped', async () => {
  const owner = await createUser('Profile owner');
  const other = await createUser('Profile other');
  await profiles.save(owner.user.id, { phone: '123', github: 'https://github.com/owner' });
  await profiles.save(other.user.id, { phone: 'other-phone' });
  const incoming = {
    fullName: 'Grace Hopper',
    phone: null,
    currentCompany: 'Ignore company',
    currentTitle: 'Ignore title',
    yearsExperience: '99',
    pronouns: 'ignored',
    userId: other.user.id,
    unknown: 'ignored',
  };
  const result = await profiles.save(
    owner.user.id,
    incoming as unknown as Parameters<typeof profiles.save>[1],
  );
  assert.equal(result.fullName, 'Grace Hopper');
  assert.equal(result.phone, 'null');
  assert.equal(result.github, 'https://github.com/owner');
  assert.equal(result.currentCompany, '');
  assert.equal(result.currentTitle, '');
  assert.equal(result.yearsExperience, '');
  const stored = await prisma.profile.findUniqueOrThrow({ where: { userId: owner.user.id } });
  assert.equal(stored.pronouns, null);
  assert.equal(stored.userId, owner.user.id);
  assert.equal(stored.phone, 'null');
  assert.equal((await profiles.get(other.user.id)).phone, 'other-phone');
  const ownerToken = await auth.issueSyncToken(owner.user.id);
  const otherToken = await auth.issueSyncToken(other.user.id);
  assert.equal((await profiles.bySyncToken(ownerToken)).phone, 'null');
  assert.equal((await profiles.bySyncToken(otherToken)).phone, 'other-phone');
  await assert.rejects(profiles.bySyncToken('invalid-token'), AuthenticationError);
});
