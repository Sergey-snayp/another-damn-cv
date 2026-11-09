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
