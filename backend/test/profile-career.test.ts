import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ImportProfileCareer } from '../src/modules/profiles/application/use-cases/import-profile-career';
import { GetCareerFields } from '../src/modules/profiles/application/use-cases/get-career-fields';
import { ResumeImportSourceReader } from '../src/modules/profiles/adapters/outbound/resume-import-source.reader';
import { ResumeError } from '../src/modules/resumes/contracts';
import {
  CareerImportError,
  type CareerImport,
  type CareerState,
} from '../src/modules/profiles/domain/career-profile';

const input: CareerImport = {
  expectedRevision: 0,
  contact: {},
  expectedContact: {},
  sections: { summary: 'Payment engineer.' },
  source: { kind: 'resume', id: 'source', snapshot: 3 },
};
test('an owned saved CV version is required before a profile import can create or write anything', async () => {
  let writes = 0,
    creates = 0;
  const useCase = new ImportProfileCareer(
    {
      ensureProfile: () => {
        creates++;
        return Promise.reject(new Error('Must not create'));
      },
    },
    {
      read: () => Promise.resolve({ revision: 0, data: {} }),
      import: () => {
        writes++;
        return Promise.reject(new Error('Must not write'));
      },
    },
    new ResumeImportSourceReader({
      atSnapshot: (user, id, version) => {
        assert.deepEqual([user, id, version], ['other-user', 'source', 3]);
        return Promise.reject(new ResumeError('not-found', 'Private source not found'));
      },
    }),
  );
  await assert.rejects(
    useCase.execute('other-user', input),
    (error: unknown) => error instanceof CareerImportError && error.code === 'not-found',
  );
  assert.equal(writes, 0);
  assert.equal(creates, 0);
});
test('empty selections and mismatched expected fields fail before checking source or writing', async () => {
  const never = () => Promise.reject(new Error('Must not access storage'));
  const useCase = new ImportProfileCareer(
    { ensureProfile: never },
    { read: never, import: never },
    { assertOwned: never },
  );
  for (const invalid of [
    { ...input, sections: {} },
    { ...input, contact: { email: 'new@example.com' }, expectedContact: {} },
    { ...input, expectedContact: { email: 'old@example.com' } },
  ])
    await assert.rejects(
      useCase.execute('owner', invalid),
      (error: unknown) => error instanceof CareerImportError && error.code === 'invalid',
    );
});
test('imported profile roles drive autofill independently; accounts without imported experience keep the primary CV fallback', async () => {
  const state: CareerState = {
    revision: 1,
    data: {
      experiences: {
        value: [
          {
            company: 'Profile Employer',
            title: 'Lead Engineer',
            client: '',
            location: '',
            from: '2019-03',
            to: '',
            current: true,
            description: '',
            bullets: [],
          },
        ],
        source: { kind: 'file', name: 'source.pdf' },
        importedAt: '2026-11-02T12:00:00Z',
      },
    },
  };
  let fallbackCalls = 0;
  const repository = { read: () => Promise.resolve(state), import: () => Promise.resolve(state) };
  const reader = new GetCareerFields(
    repository,
    {
      read: () => {
        fallbackCalls++;
        return Promise.resolve({
          currentCompany: 'CV Employer',
          currentTitle: 'Developer',
          yearsExperience: '2',
        });
      },
    },
    () => 2026,
  );
  assert.deepEqual(await reader.read('owner'), {
    currentCompany: 'Profile Employer',
    currentTitle: 'Lead Engineer',
    yearsExperience: '7',
  });
  assert.equal(fallbackCalls, 0);
  delete state.data.experiences;
  assert.equal((await reader.read('owner')).currentCompany, 'CV Employer');
  assert.equal(fallbackCalls, 1);
  state.data.experiences = { value: [], source: input.source, importedAt: '' };
  assert.deepEqual(await reader.read('owner'), { currentCompany: '', currentTitle: '', yearsExperience: '' });
  assert.equal(fallbackCalls, 1);
});
