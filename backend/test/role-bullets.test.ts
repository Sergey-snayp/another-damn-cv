import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkChoice,
  matchProfileRole,
  rolePool,
  type ProfileRole,
} from '../src/modules/resumes/domain/role-bullets';
import { ChooseRoleBullets } from '../src/modules/resumes/application/use-cases/choose-role-bullets';
import { PublicProfileRolesReader } from '../src/modules/resumes/adapters/outbound/modules/profile-roles.reader';
import type { PoolItem } from '../src/modules/resumes/domain/role-bullets';

const cv = {
  company: 'Ciklum',
  title: 'Senior Software Engineer',
  from: '2024-10',
  bullets: ['Developed Node.js microservices and REST APIs for card tokenization.', 'Fixed vulnerabilities.'],
};
const profile: ProfileRole = {
  company: 'Ciklum Ltd.',
  title: 'Senior software engineer',
  from: '2024-10',
  bullets: [
    'Developed Node.js microservices and REST APIs for card tokenization.',
    'Built a TLS certificate service with ACME and Route53, replacing manual renewals.',
    'Ran payment APIs handling ~20,000 transactions a day.',
    'Mentored two junior engineers through code review.',
  ],
  starred: ['Ran payment APIs handling ~20,000 transactions a day.'],
};

test('a CV job is found in the Profile by company, then title or start year', () => {
  assert.equal(
    matchProfileRole([profile], cv),
    profile,
    '"Ciklum Ltd." is Ciklum; the title matches ignoring case',
  );
  const other = { ...profile, title: 'Tech Lead', from: '2021-01' };
  assert.equal(
    matchProfileRole([other, { ...profile, title: 'Engineer II' }], cv)?.title,
    'Engineer II',
    'same start year',
  );
  assert.equal(
    matchProfileRole([other, { ...other, from: '2019' }], cv),
    null,
    'two other jobs there: not a guess',
  );
  assert.equal(matchProfileRole([{ ...profile, company: 'EPAM' }], cv), null);
});

test('the pool is the CV bullets, then the Profile ones the CV does not already say', () => {
  const pool = rolePool(cv, profile);
  assert.deepEqual(
    pool.map((item) => [item.id, item.source, item.starred]),
    [
      ['c1', 'cv', false],
      ['c2', 'cv', false],
      ['p2', 'profile', false],
      ['p3', 'profile', true],
      ['p4', 'profile', false],
    ],
  );
  assert.equal(pool[0].cvIndex, 0);
});

test('the choice is checked: real ids once, numbers kept, exactly the count', () => {
  const pool = rolePool(cv, profile);
  const result = checkChoice(
    {
      chosen: [
        { id: 'p3', text: 'Ran payment APIs handling ~25,000 transactions a day.' },
        { id: 'zz', text: 'Invented line.' },
        { id: 'p2', text: 'Automated TLS certificate renewals with ACME and Route53.' },
        { id: 'p2', text: 'Twice.' },
        { id: 'p4', text: 'Mentored two junior engineers through code review, supporting team growth.' },
      ],
      alternates: [{ id: 'p4', text: 'Mentored two junior engineers.' }],
    },
    pool,
    3,
  );
  assert.deepEqual(
    result.chosen.map((item) => [item.id, item.text]),
    [
      ['p3', 'Ran payment APIs handling ~20,000 transactions a day.'],
      ['p2', 'Automated TLS certificate renewals with ACME and Route53.'],
      ['p4', 'Mentored two junior engineers through code review.'],
    ],
    'a changed number or words tacked onto the end fall back to the achievement as written',
  );
  assert.equal(result.chosen[1].original, profile.bullets[1]);
  assert.deepEqual(
    result.alternates.map((item) => item.id),
    ['c1', 'c2'],
  );
});

test('chosen bullets and fallback alternatives have no sentence dashes while their source stays intact', () => {
  const pool = rolePool(
    {
      ...cv,
      bullets: ['Built Node.js APIs - for card tokenization.', 'Fixed vulnerabilities — in services.'],
    },
    null,
  );
  const original = structuredClone(pool);
  const result = checkChoice(
    { chosen: [{ id: 'c1', text: 'Built Node.js APIs — for card tokenization.' }], alternates: [] },
    pool,
    1,
  );
  assert.doesNotMatch(result.chosen[0].text, /[—–]| - /);
  assert.doesNotMatch(result.alternates[0].text, /[—–]| - /);
  assert.equal(result.alternates[0].original, 'Fixed vulnerabilities — in services.');
  assert.deepEqual(pool, original);
});

test("choosing a job's bullets: from the Profile when it has more, otherwise each line on its own", async () => {
  const asked: { count: number; items: { id: string; hint: string }[] }[] = [];
  const use = (roles: ProfileRole[]) =>
    new ChooseRoleBullets(
      { assertOwned: () => Promise.resolve() },
      {
        getForTailoring: () =>
          Promise.resolve({
            id: 'j',
            title: 'Backend Engineer',
            company: 'Ema',
            pageTitle: null,
            description: 'We need security best practices and reliable payment APIs.',
            extraction: '',
          }),
      },
      { roles: () => Promise.resolve(roles) },
      {
        choose: (input) => {
          asked.push(input);
          return Promise.resolve({
            chosen: [{ id: 'p3', text: 'Ran payment APIs at ~20,000 transactions a day.' }],
            alternates: [],
          });
        },
      },
    );
  const none = await use([]).execute('u', 'cv', { role: cv, job: { jobId: 'j' } });
  assert.equal(none.matched, false);
  const nothingNew = await use([{ ...profile, bullets: cv.bullets }]).execute('u', 'cv', {
    role: cv,
    job: { jobId: 'j' },
  });
  assert.equal(nothingNew.matched, false, 'the Profile has nothing more for this job');
  const result = await use([profile]).execute('u', 'cv', { role: cv, job: { jobId: 'j' } });
  assert.equal(result.matched, true);
  assert.deepEqual(result.profileRole, { title: 'Senior software engineer', company: 'Ciklum Ltd.' });
  assert.equal(asked[0].count, 2, 'as many bullets as the CV shows for the job');
  assert.match(asked[0].items.find((item) => item.id === 'c2')!.hint, /security/);
  assert.equal(result.chosen.length, 2);
  assert.equal(result.chosen[0].source, 'profile');
});

test('client and start date select SymphonyAI rather than another Ciklum role with the same title', () => {
  const payment = { ...profile, client: 'Paymorrow', from: '2024-10' };
  const mobile = { ...profile, client: 'SymphonyAI', from: '2023-11' };
  const requested = { ...cv, client: 'Symphony AI', from: '2023-11' };
  assert.equal(matchProfileRole([payment, mobile], requested), mobile);
  assert.equal(
    matchProfileRole([payment, mobile], { ...requested, client: undefined }),
    mobile,
    'date precedes a shared job title',
  );
  assert.equal(matchProfileRole([payment], requested), null, 'another client is never evidence');
  assert.equal(
    matchProfileRole([mobile], { ...requested, company: 'SymphonyAI', client: '' }),
    mobile,
    'a CV can list the client as the company',
  );
});

test('Profile notes and technology stacks, plus saved CV bullets, enter the same role pool without dropping distinctive technologies', () => {
  const old = 'Built cross-platform application features for customer workflows.';
  const fresh = 'Built cross-platform application features for customer workflows using React Native.';
  const pool = rolePool(
    { ...cv, bullets: [old] },
    {
      ...profile,
      bullets: [fresh],
      description: 'Client-facing mobile applications.',
      techStack: 'React Native | Expo SDK',
      notes: ['Built React Native screens with Expo Router.'],
    },
    [{ ...cv, bullets: ['Implemented AsyncStorage persistence.'] }],
  );
  assert.ok(pool.some((item) => item.text === old));
  assert.ok(
    pool.some((item) => item.text === fresh),
    'a similar bullet containing extra technology is not discarded as a duplicate',
  );
  assert.ok(pool.some((item) => item.kind === 'context' && item.text.includes('React Native | Expo SDK')));
  assert.ok(pool.some((item) => item.kind === 'context' && item.text.includes('Expo Router')));
  assert.ok(pool.some((item) => item.source === 'saved-cv' && item.text.includes('AsyncStorage')));
  assert.equal(
    rolePool({ ...cv, bullets: ['Built C++ services.'] }, { ...profile, bullets: ['Built C# services.'] })
      .length,
    2,
    'deduplication keeps distinct technology punctuation',
  );
});

test('context supports a generated bullet but cannot add technologies or leak an entire raw note', () => {
  const pool = rolePool(cv, {
    ...profile,
    bullets: [],
    notes: ['Built React Native screens with Expo Router.'],
  });
  const note = pool.find((item) => item.kind === 'context')!;
  const valid = checkChoice(
    {
      chosen: [{ id: note.id, text: 'Built mobile screens with React Native and Expo Router.' }],
      alternates: [],
    },
    pool,
    1,
  );
  assert.match(valid.chosen[0].text, /React Native/);
  const unsupported = checkChoice(
    {
      chosen: [{ id: note.id, text: 'Built React Native screens with Kubernetes and 10 million users.' }],
      alternates: [],
    },
    pool,
    1,
  );
  assert.doesNotMatch(unsupported.chosen[0].text, /Kubernetes|million/);
  const missing = checkChoice({ chosen: [], alternates: [] }, pool, 10);
  assert.ok(
    missing.chosen.every((item) => item.kind !== 'context'),
    'fallback never pastes raw notes into a CV',
  );
});

test('the Profile reader includes active role descriptions, tools and notes but not deleted achievements', async () => {
  const reader = new PublicProfileRolesReader({
    read: (userId) => {
      assert.equal(userId, 'owner');
      return Promise.resolve({
        revision: 1,
        data: {
          experiences: {
            source: { kind: 'profile' },
            importedAt: '',
            value: [
              {
                company: 'Ciklum',
                client: 'SymphonyAI',
                title: 'Engineer',
                location: '',
                from: '2023-11',
                to: '',
                current: false,
                description: 'Mobile development.',
                techStack: 'React Native',
                bullets: [],
                notes: [{ text: 'Built mobile screens with React Native.', at: '' }],
                removed: [{ text: 'Deleted achievement.', at: '' }],
              },
            ],
          },
        },
      });
    },
  });
  const [role] = await reader.roles('owner');
  assert.equal(role.client, 'SymphonyAI');
  assert.equal(role.techStack, 'React Native');
  assert.deepEqual(role.notes, ['Built mobile screens with React Native.']);
  assert.doesNotMatch(JSON.stringify(role), /Deleted achievement/);
});

test('single-bullet generation uses the matching client facts and the account’s saved CVs, leaving other clients out', async () => {
  const selected = {
    ...cv,
    client: 'SymphonyAI',
    from: '2023-11',
    bullets: ['Developed application features.'],
  };
  let seen: PoolItem[] = [];
  const service = new ChooseRoleBullets(
    { assertOwned: () => Promise.resolve() },
    { getForTailoring: () => Promise.reject(new Error('Inline job only')) },
    {
      roles: () =>
        Promise.resolve([
          { ...profile, client: 'Paymorrow' },
          {
            ...profile,
            client: 'SymphonyAI',
            from: '2023-11',
            bullets: [],
            techStack: 'React Native | Expo',
            notes: ['Built React Native screens with Expo Router.'],
          },
        ]),
    },
    {
      choose: (input) => {
        seen = input.items;
        assert.equal(input.count, 1);
        assert.match(input.job, /React Native Engineer/);
        const item = input.items.find((item) => item.text.includes('Built React Native screens'))!;
        return Promise.resolve({
          chosen: [{ id: item.id, text: 'Built React Native screens with Expo Router.' }],
          alternates: [],
        });
      },
    },
    {
      roles: () =>
        Promise.resolve([
          { ...selected, resumeId: 'saved-1', bullets: ['Implemented AsyncStorage persistence.'] },
          {
            ...selected,
            client: 'Paymorrow',
            resumeId: 'saved-1',
            bullets: ['Built payment reconciliation with Kafka.'],
          },
        ]),
    },
  );
  const result = await service.execute('owner', 'cv', {
    role: selected,
    job: { title: 'React Native Engineer', description: 'React Native mobile applications with Expo.' },
  });
  assert.match(result.chosen[0].text, /React Native/);
  assert.ok(seen.some((item) => item.text.includes('AsyncStorage')));
  assert.ok(!seen.some((item) => item.text.includes('reconciliation')));
  assert.ok(!seen.some((item) => item.text.includes('card tokenization')));
});
