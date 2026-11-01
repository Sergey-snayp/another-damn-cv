import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalUrl } from '../src/jobs/canonical-url';

test('LinkedIn search page and job page are the same job', () => {
  const id = 'https://www.linkedin.com/jobs/view/4012345678';
  assert.equal(canonicalUrl('https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=node&geoId=101174742'), id);
  assert.equal(canonicalUrl('https://www.linkedin.com/jobs/view/4012345678/?trk=public_jobs&refId=abc'), id);
  assert.equal(canonicalUrl('https://ca.linkedin.com/jobs/view/senior-backend-engineer-at-acme-4012345678'), id);
  assert.equal(canonicalUrl('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345678'), id);
});

test('Indeed: vjk beside a search and jk on the job page agree', () => {
  assert.equal(canonicalUrl('https://ca.indeed.com/jobs?q=node&l=Toronto&vjk=8f3a1b2c3d4e5f60'), 'https://ca.indeed.com/viewjob?jk=8f3a1b2c3d4e5f60');
  assert.equal(canonicalUrl('https://ca.indeed.com/viewjob?jk=8f3a1b2c3d4e5f60&from=serp&tk=xyz'), 'https://ca.indeed.com/viewjob?jk=8f3a1b2c3d4e5f60');
});

test('tracking noise, fragments and trailing slashes go', () => {
  assert.equal(
    canonicalUrl('https://Boards.Greenhouse.io/acme/jobs/123/?gh_src=abc&utm_source=linkedin&utm_medium=x#app'),
    'https://boards.greenhouse.io/acme/jobs/123',
  );
});

test('parameters that identify the job are kept, in a stable order', () => {
  assert.equal(
    canonicalUrl('https://acme.com/careers?gh_jid=4567&utm_campaign=x&dept=eng'),
    'https://acme.com/careers?dept=eng&gh_jid=4567',
  );
});

test('apply forms are the posting', () => {
  assert.equal(canonicalUrl('https://jobs.lever.co/acme/1b2c-3d4e/apply'), 'https://jobs.lever.co/acme/1b2c-3d4e');
  assert.equal(canonicalUrl('https://jobs.ashbyhq.com/acme/9f8e-7d6c/application'), 'https://jobs.ashbyhq.com/acme/9f8e-7d6c');
});

test('non-web addresses are refused', () => {
  assert.equal(canonicalUrl('chrome://extensions'), null);
  assert.equal(canonicalUrl('file:///Users/me/job.html'), null);
  assert.equal(canonicalUrl('not a url'), null);
});
