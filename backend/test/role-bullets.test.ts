import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkChoice,
  matchProfileRole,
  rolePool,
  type ProfileRole,
} from '../src/modules/resumes/domain/role-bullets';
import { ChooseRoleBullets } from '../src/modules/resumes/application/use-cases/choose-role-bullets';

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
