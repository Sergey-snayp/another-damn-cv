import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EnsureProfile } from '../src/modules/profiles/application/use-cases/ensure-profile';
import { GetProfile } from '../src/modules/profiles/application/use-cases/get-profile';
import { UpdateProfile } from '../src/modules/profiles/application/use-cases/update-profile';
import type { ProfileRepository } from '../src/modules/profiles/application/ports/profile-repository';
import { EMPTY_CONTACT, type StoredProfile } from '../src/modules/profiles/domain/contact';
import { careerFrom } from '../src/modules/resumes/domain/career';
import type { Experience } from '../src/modules/resumes/domain/resume';

function storedProfile(): StoredProfile {
  const {
    fullName: _fullName,
    currentCompany: _currentCompany,
    currentTitle: _currentTitle,
    yearsExperience: _yearsExperience,
    ...contact
  } = EMPTY_CONTACT;
  return {
    ...contact,
    id: 'profile',
    userId: 'owner',
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    phone: null,
    pronouns: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function role(company: string, title: string, from: string, current: boolean): Experience {
  return {
    id: company,
    lineageId: company,
    resumeId: 'resume',
    createdInSnapshot: 1,
    supersededInSnapshot: null,
    company,
    title,
    from,
    current,
    client: null,
    location: null,
    to: null,
    blurb: null,
    position: 0,
  };
}

test('recorded profile behavior keeps empty defaults, full-name split, string coercion and derived fields', async () => {
  const row = storedProfile();
  const writes: Record<string, unknown>[] = [];
  const repository: ProfileRepository = {
    findByUserId: () => Promise.resolve(row),
    create: () => Promise.reject(new Error('The existing profile must be reused.')),
    update: (_userId, data) => {
      writes.push(data);
      Object.assign(row, data);
      return Promise.resolve();
    },
  };
  const directory = new EnsureProfile(repository, {
    find: () => Promise.reject(new Error('The existing profile must not be reseeded.')),
  });
  const get = new GetProfile(directory, {
    read: () =>
      Promise.resolve(
        careerFrom(
          [role('Present', 'Engineer', '2022-01', true), role('Old', 'Junior', '2018-02', false)],
          new Date().getFullYear(),
        ),
      ),
  });
  const update = new UpdateProfile(directory, repository, get);
  const before = await get.execute('owner');
  assert.equal(before.phone, '');
  assert.equal(before.fullName, 'Ada Lovelace');
  assert.equal(before.currentCompany, 'Present');
  assert.equal(before.yearsExperience, String(new Date().getFullYear() - 2018));
  const incoming = { fullName: 'Grace  Hopper', phone: null, currentCompany: 'Ignored', unknown: 'ignored' };
  const after = await update.execute('owner', incoming as unknown as Parameters<UpdateProfile['execute']>[1]);
  assert.deepEqual(writes, [{ phone: 'null', firstName: 'Grace', lastName: ' Hopper' }]);
  assert.equal(after.phone, 'null');
  assert.equal(after.currentCompany, 'Present');
});

test('recorded profile seeding keeps account email and repeated spaces in the surname', async () => {
  let created: unknown;
  const repository: ProfileRepository = {
    findByUserId: () => Promise.resolve(null),
    create: (userId, seed) => {
      created = { userId, ...seed };
      return Promise.resolve({ ...storedProfile(), userId, ...seed });
    },
    update: () => Promise.reject(new Error('Seeding must create a profile.')),
  };
  await new EnsureProfile(repository, {
    find: () => Promise.resolve({ name: 'Ada  Lovelace', email: 'ada@example.com' }),
  }).ensureProfile('owner');
  assert.deepEqual(created, {
    userId: 'owner',
    firstName: 'Ada',
    lastName: ' Lovelace',
    email: 'ada@example.com',
  });
});
