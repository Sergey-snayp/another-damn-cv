import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthApplication } from '../src/modules/auth/application/auth-api';
import { AuthenticationError } from '../src/modules/auth/application/errors';
import { EmbedSessions } from '../src/modules/auth/application/use-cases/embed-sessions';
import { memoryEmbeds } from './fixtures/memory-embeds';
import type {
  AccountRepository,
  GoogleAccount,
} from '../src/modules/auth/application/ports/account-repository';
import type {
  IdentityVerifier,
  VerifiedIdentity,
} from '../src/modules/auth/application/ports/identity-verifier';
import { SignInWithGoogle } from '../src/modules/auth/application/use-cases/sign-in-with-google';
import { SyncTokens } from '../src/modules/auth/application/use-cases/sync-tokens';
import { GoogleIdentityVerifier } from '../src/modules/auth/adapters/outbound/google-identity.verifier';
import { RandomSyncTokenGenerator } from '../src/modules/auth/adapters/outbound/random-sync-token.generator';
import { syncToken } from '../src/modules/auth/adapters/inbound/http/sync-token';
import type { PublicUser } from '../src/modules/auth/contracts';
import { ProfilesApplication } from '../src/modules/profiles/application/profile-api';
import type { ProfileRepository } from '../src/modules/profiles/application/ports/profile-repository';
import { EnsureProfile } from '../src/modules/profiles/application/use-cases/ensure-profile';
import { GetProfile } from '../src/modules/profiles/application/use-cases/get-profile';
import { UpdateProfile } from '../src/modules/profiles/application/use-cases/update-profile';
import {
  EMPTY_CONTACT,
  type StoredContactKey,
  type StoredProfile,
} from '../src/modules/profiles/domain/contact';

class Accounts implements AccountRepository {
  users = new Map<string, PublicUser>();
  subjects = new Map<string, string>();
  tokens = new Map<string, string>();
  lastAccount?: GoogleAccount;
  upsertGoogleAccount(account: GoogleAccount): Promise<PublicUser> {
    this.lastAccount = account;
    const id = this.subjects.get(account.googleId) ?? `user-${this.users.size + 1}`;
    const previous = this.users.get(id);
    const user = {
      id,
      email: account.email,
      name: account.name ?? previous?.name ?? account.email.split('@')[0],
      avatarUrl: account.avatarUrl,
    };
    this.users.set(id, user);
    this.subjects.set(account.googleId, id);
    return Promise.resolve(user);
  }
  findById(id: string) {
    return Promise.resolve(this.users.get(id) ?? null);
  }
  replaceSyncToken(id: string, token: string) {
    this.tokens.set(id, token);
    return Promise.resolve();
  }
  currentSyncToken(id: string) {
    return Promise.resolve(this.tokens.get(id) ?? null);
  }
  findIdBySyncToken(token: string) {
    return Promise.resolve([...this.tokens].find(([, value]) => value === token)?.[0] ?? null);
  }
}

class Profiles implements ProfileRepository {
  values = new Map<string, StoredProfile>();
  writes: { userId: string; values: Partial<Record<StoredContactKey, string>> }[] = [];
  findByUserId(id: string) {
    return Promise.resolve(this.values.get(id) ?? null);
  }
  create(userId: string, seed: { firstName: string; lastName: string; email: string }) {
    const contact = { ...EMPTY_CONTACT } as Record<string, unknown>;
    for (const key of ['fullName', 'currentCompany', 'currentTitle', 'yearsExperience']) delete contact[key];
    const row = {
      ...contact,
      ...seed,
      id: `profile-${userId}`,
      userId,
      pronouns: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    } as unknown as StoredProfile;
    this.values.set(userId, row);
    return Promise.resolve(row);
  }
  update(userId: string, values: Partial<Record<StoredContactKey, string>>) {
    this.writes.push({ userId, values });
    Object.assign(this.values.get(userId)!, values);
    return Promise.resolve();
  }
}

function setup() {
  const accounts = new Accounts();
  const identities: IdentityVerifier = {
    verify: () =>
      Promise.resolve({ subject: 'google-subject', email: 'ada@example.com', name: 'Ada Lovelace' }),
  };
  let sequence = 0;
  const tokens = new SyncTokens(accounts, { generate: () => `token-${++sequence}` });
  const auth = new AuthApplication(
    new SignInWithGoogle(identities, accounts),
    accounts,
    tokens,
    new EmbedSessions(memoryEmbeds(), { generate: () => `embed-${++sequence}` }),
  );
  const repository = new Profiles();
  const directory = new EnsureProfile(repository, {
    find: (userId) =>
      Promise.resolve({
        name: userId === 'owner' ? 'Ada  Lovelace' : 'Other User',
        email: `${userId}@example.com`,
      }),
  });
  const career = {
    read: () =>
      Promise.resolve({ currentCompany: 'Current company', currentTitle: 'Engineer', yearsExperience: '8' }),
  };
  const get = new GetProfile(directory, career);
  const profiles = new ProfilesApplication(get, new UpdateProfile(directory, repository, get), auth);
  return { accounts, auth, profiles, repository, directory };
}

test('Google sign-in uses verified stable subject and permits an absent verified-email flag', async () => {
  const { auth, accounts } = setup();
  const first = await auth.signInWithGoogle('credential');
  assert.deepEqual(first, { id: 'user-1', email: 'ada@example.com', name: 'Ada Lovelace', avatarUrl: null });
  assert.equal(accounts.lastAccount?.googleId, 'google-subject');
  assert.equal(await auth.findById('missing'), null);
});

test('sign-in rejects missing/unverified email before creating an account', async () => {
  for (const identity of [
    { subject: 'subject' },
    { subject: 'subject', email: 'ada@example.com', emailVerified: false },
  ] satisfies VerifiedIdentity[]) {
    const accounts = new Accounts();
    const signIn = new SignInWithGoogle({ verify: () => Promise.resolve(identity) }, accounts);
    await assert.rejects(
      signIn.execute('credential'),
      (error: unknown) =>
        error instanceof AuthenticationError && error.message === 'Google account has no verified email.',
    );
    assert.equal(accounts.users.size, 0);
  }
});

test('with a list of allowed emails, only those people sign in (any letter case)', async () => {
  const accounts = new Accounts();
  const as = (email: string) => ({ verify: () => Promise.resolve({ subject: email, email, name: 'A' }) });
  const allowed = ['Owner@Example.com'];
  await assert.rejects(
    new SignInWithGoogle(as('friend@example.com'), accounts, allowed).execute('credential'),
    (error: unknown) =>
      error instanceof AuthenticationError &&
      /invite-only for now\. Ask its owner to add friend@example\.com/.test(error.message),
  );
  assert.equal(accounts.users.size, 0, 'no account is made for someone not on the list');
  const owner = await new SignInWithGoogle(as('owner@example.COM'), accounts, allowed).execute('credential');
  assert.equal(owner.email, 'owner@example.COM');
  assert.ok(
    await new SignInWithGoogle(as('anyone@example.com'), accounts).execute('credential'),
    'no list: anyone',
  );
});

test('verification failure reaches the caller without account mutation', async () => {
  const accounts = new Accounts();
  const signIn = new SignInWithGoogle(
    { verify: () => Promise.reject(new AuthenticationError('Invalid Google token.')) },
    accounts,
  );
  await assert.rejects(signIn.execute('invalid'), /Invalid Google token/);
  assert.equal(accounts.users.size, 0);
  await assert.rejects(
    new GoogleIdentityVerifier('').verify('anything'),
    /GOOGLE_CLIENT_ID is not configured/,
  );
});

test('token rotation invalidates only that user and keeps missing tokens null', async () => {
  const { auth } = setup();
  assert.equal(await auth.currentSyncToken('owner'), null);
  const first = await auth.issueSyncToken('owner');
  const other = await auth.issueSyncToken('other');
  assert.equal(await auth.resolveSyncToken(first), 'owner');
  const next = await auth.issueSyncToken('owner');
  await assert.rejects(auth.resolveSyncToken(first), /Invalid sync token/);
  assert.equal(await auth.resolveSyncToken(next), 'owner');
  assert.equal(await auth.resolveSyncToken(other), 'other');
});

test('real token generator retains 32-byte URL-safe credentials', () => {
  const generator = new RandomSyncTokenGenerator();
  const value = generator.generate();
  assert.match(value, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(value, 'base64url').length, 32);
  assert.notEqual(generator.generate(), value);
});

test('sync header parser retains case-insensitive prefix, whitespace and bare-token behavior', () => {
  assert.equal(syncToken('bEaReR  abc '), 'abc');
  assert.equal(syncToken(' abc '), 'abc');
  assert.throws(() => syncToken('Bearer   '), /Missing sync token/);
  assert.throws(() => syncToken(), /Missing sync token/);
});

test('stored directory seeds names lazily and does not depend on career queries', async () => {
  const { directory, repository } = setup();
  const first = await directory.ensureProfile('owner');
  assert.equal(first.firstName, 'Ada');
  assert.equal(first.lastName, ' Lovelace');
  assert.equal(first.email, 'owner@example.com');
  assert.equal(await directory.ensureProfile('owner'), first);
  assert.equal(repository.values.size, 1);
});

test('profile returns exactly flat contact fields and an updated combined view', async () => {
  const { profiles, repository } = setup();
  const before = await profiles.get('owner');
  assert.deepEqual(Object.keys(before).sort(), Object.keys(EMPTY_CONTACT).sort());
  assert.equal(before.fullName, 'Ada  Lovelace');
  repository.values.get('owner')!.phone = null;
  assert.equal((await profiles.get('owner')).phone, '');
  const input = {
    fullName: 'Grace  Hopper',
    phone: null,
    currentCompany: 'ignored',
    yearsExperience: '99',
    unknown: 'ignored',
  };
  const after = await profiles.save('owner', input as unknown as Parameters<typeof profiles.save>[1]);
  assert.deepEqual(repository.writes, [
    { userId: 'owner', values: { phone: 'null', firstName: 'Grace', lastName: ' Hopper' } },
  ]);
  assert.equal(after.fullName, 'Grace  Hopper');
  assert.equal(after.currentCompany, 'Current company');
  assert.equal(after.yearsExperience, '8');
});

test('explicit names beat fullName and omitted fields keep their existing values', async () => {
  const { profiles } = setup();
  await profiles.save('owner', { phone: '123' });
  const saved = await profiles.save('owner', { fullName: 'Ignored Name', firstName: 'New' });
  assert.equal(saved.firstName, 'New');
  assert.equal(saved.lastName, ' Lovelace');
  assert.equal(saved.phone, '123');
});

test('bearer profile lookup stays scoped to credential owner across rotation', async () => {
  const { auth, profiles } = setup();
  await profiles.save('owner', { phone: 'owner-phone' });
  await profiles.save('other', { phone: 'other-phone' });
  const token = await auth.issueSyncToken('owner');
  const otherToken = await auth.issueSyncToken('other');
  assert.equal((await profiles.bySyncToken(token)).phone, 'owner-phone');
  assert.equal((await profiles.bySyncToken(otherToken)).phone, 'other-phone');
  await auth.issueSyncToken('owner');
  await assert.rejects(profiles.bySyncToken(token), /Invalid sync token/);
  assert.equal((await profiles.contactOnly('other')).phone, 'other-phone');
});

test('an embed ticket opens one short session and nothing else', async () => {
  let clock = 1_000_000;
  let sequence = 0;
  const embeds = new EmbedSessions(
    memoryEmbeds(() => clock),
    { generate: () => `t-${++sequence}` },
    () => clock,
  );
  const ticket = await embeds.issueTicket('owner');
  const token = await embeds.open(ticket);
  assert.equal(await embeds.resolve(token), 'owner');
  await assert.rejects(embeds.open(ticket), AuthenticationError, 'a ticket opens one session only');
  await assert.rejects(embeds.resolve(ticket), AuthenticationError, 'a ticket is not a session');
  const late = await embeds.issueTicket('owner');
  clock += 61_000;
  await assert.rejects(embeds.open(late), /expired/, 'a ticket lasts a minute');
  assert.equal(await embeds.resolve(token), 'owner');
  clock += 8 * 60 * 60_000;
  await assert.rejects(embeds.resolve(token), /signed out/, 'a session lasts eight hours');
});
