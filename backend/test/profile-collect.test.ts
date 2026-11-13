import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectFromCvs, matchJob, type CvJob } from '../src/modules/profiles/domain/collect';
import { CollectFromCvs } from '../src/modules/profiles/application/use-cases/collect-from-cvs';
import type { CareerExperience } from '../src/modules/profiles/domain/career-profile';

const role = (patch: Partial<CareerExperience>): CareerExperience => ({
  company: 'Ciklum',
  title: 'Senior Software Engineer',
  client: '',
  location: '',
  from: '2024-10',
  to: '',
  current: true,
  description: '',
  bullets: [],
  techStack: 'Node.js, TypeScript',
  ...patch,
});
const job = (patch: Partial<CvJob>): CvJob => ({
  cv: 'Main CV',
  company: 'Ciklum',
  client: '',
  title: 'Senior Software Engineer',
  location: '',
  from: '2024-10',
  to: '',
  current: true,
  description: '',
  techStack: '',
  bullets: [],
  ...patch,
});

test('a CV job is found in the Profile by company, then title or start year', () => {
  const roles = [role({}), role({ company: 'EPAM Systems Inc.', title: 'Engineer', from: '2021-02' })];
  assert.equal(matchJob(roles, job({ company: 'ciklum' })), 0);
  assert.equal(matchJob(roles, job({ company: 'EPAM Systems', title: 'Middle Engineer', from: '2021' })), 1);
  assert.equal(matchJob(roles, job({ company: 'Waivio' })), null);
});

test('two projects at one company: the client, then the dates, decide which job a CV job is', () => {
  const roles = [
    role({ client: 'Paymorrow', from: '2024-10', current: true, bullets: ['Built the TLS certificate service with ACME and Route53.'] }),
    role({ client: 'Verifone', from: '2022-01', to: '2024-09', current: false, bullets: ['Built the terminal fleet dashboard.'] }),
  ];
  assert.equal(matchJob(roles, job({ client: 'Verifone' })), 1, 'by client, though the title and the dates say the other');
  assert.equal(matchJob(roles, job({ client: '', from: '2023-03', to: '2024-01', current: false })), 1, 'no client: by dates');
  assert.equal(matchJob(roles, job({ client: 'Paymorrow' })), 0);
  assert.equal(matchJob(roles, job({ client: 'Adyen' })), null, 'another client is another job');
  assert.equal(matchJob(roles, job({ client: '', from: '', to: '', current: false })), null, 'nothing to tell them apart: not guessed');

  const found = collectFromCvs(roles, [
    job({ cv: 'Main CV', client: 'Verifone', from: '2022-01', to: '2024-09', current: false,
      bullets: ['Built the terminal fleet dashboard.', 'Built the TLS certificate service with ACME and Route 53.', 'Cut terminal update failures by 40%.'] }),
    job({ cv: 'Main CV', client: 'Paymorrow', bullets: ['Wrote the merchant onboarding runbook.'] }),
  ]);
  const verifone = found.find((entry) => entry.index === 1)!;
  const paymorrow = found.find((entry) => entry.index === 0)!;
  assert.deepEqual(verifone.bullets, ['Cut terminal update failures by 40%.'], "each job gets its own CV lines; one already under the other job isn't offered");
  assert.deepEqual(paymorrow.bullets, ['Wrote the merchant onboarding runbook.']);
});

test('only what the Profile lacks is offered: no repeats, from every CV, new jobs separately', () => {
  const roles = [role({ bullets: ['Built the TLS certificate service with ACME and Route53.'] })];
  const found = collectFromCvs(roles, [
    job({
      cv: 'Main CV',
      techStack: 'Node.js | DynamoDB',
      bullets: ['Built the TLS certificate service with ACME and Route 53.', 'Completed 2 PCI DSS audits.'],
    }),
    job({
      cv: 'Fintech CV',
      bullets: ['Completed 2 PCI DSS audits.', 'Wrote the troubleshooting guide for new engineers.'],
    }),
    job({
      cv: 'Fintech CV',
      company: 'EPAM',
      title: 'Middle Engineer',
      from: '2021',
      bullets: ['Built Lambda services.'],
    }),
    job({
      cv: 'Old CV',
      company: 'EPAM',
      title: 'Middle Engineer',
      from: '2021',
      bullets: ['Built Lambda services.'],
    }),
  ]);
  assert.equal(found.length, 2);
  const ciklum = found[0];
  assert.equal(ciklum.index, 0);
  assert.deepEqual(ciklum.bullets, [
    'Completed 2 PCI DSS audits.',
    'Wrote the troubleshooting guide for new engineers.',
  ]);
  assert.deepEqual(ciklum.tools, ['DynamoDB'], 'Node.js is already listed');
  assert.deepEqual(ciklum.from, ['Main CV', 'Fintech CV']);
  const epam = found[1];
  assert.equal(epam.index, null, 'a job the Profile does not have');
  assert.equal(epam.job?.company, 'EPAM');
  assert.deepEqual(epam.bullets, ['Built Lambda services.'], 'the same line from two CVs once');
});

test('a CV line like one the Profile has is offered to compare, with that line; the same line is not', () => {
  const mine = 'Built a TLS certificate service with ACME and Route53, replacing manual renewals.';
  const roles = [role({ bullets: [mine] })];
  const [found] = collectFromCvs(roles, [
    job({
      cv: 'Main CV',
      bullets: [
        'Built a TLS certificate service with ACME and Route 53, replacing manual renewals.',
        'Built a TLS certificate service on AWS Step Functions with ACME and Route53 for 300 merchants.',
        'Cut CI time from 40 to 12 minutes by caching dependencies.',
      ],
    }),
    job({ cv: 'Fintech CV', bullets: ['Built a TLS certificate service on AWS Step Functions with ACME and Route53 for 300 merchants.'] }),
  ]);
  assert.deepEqual(found.bullets, ['Cut CI time from 40 to 12 minutes by caching dependencies.'], 'new lines, ticked');
  assert.deepEqual(found.similar, [
    { line: 'Built a TLS certificate service on AWS Step Functions with ACME and Route53 for 300 merchants.', mine },
  ], 'a close line comes with the Profile line it is like, once, and the same line (but for a space) not at all');
  assert.deepEqual(found.from, ['Main CV']);
});

test('collect reads the Profile and every CV, and returns the revision to save on', async () => {
  const collect = new CollectFromCvs(
    {
      read: () =>
        Promise.resolve({
          revision: 7,
          data: { experiences: { value: [role({})], source: { kind: 'profile' as const }, importedAt: 'x' } },
        }),
    },
    { jobs: () => Promise.resolve([job({ bullets: ['Led the certificate service team of 3.'] })]) },
  );
  const result = await collect.execute('u');
  assert.equal(result.revision, 7);
  assert.deepEqual(result.jobs[0]?.bullets, ['Led the certificate service team of 3.']);
  const nothing = await new CollectFromCvs(
    { read: () => Promise.resolve({ revision: 1, data: {} }) },
    { jobs: () => Promise.resolve([]) },
  ).execute('u');
  assert.deepEqual(nothing.jobs, []);
});
