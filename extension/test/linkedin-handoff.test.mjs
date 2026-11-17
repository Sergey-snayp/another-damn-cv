import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tabOpenedBy, handoffTarget, linkedInJobForTab, postingOf } from '../src/linkedin-handoff.js';

test('Apply on LinkedIn: the job goes to the tab that click opened, whichever arrives first', () => {
  const clicked = { tabId: 7, at: 1_000_000 };
  assert.equal(tabOpenedBy(clicked, [{ tabId: 9, opener: 7, at: 1_000_400 }], 1_000_500)?.tabId, 9, 'the new tab after the click');
  assert.equal(tabOpenedBy(clicked, [{ tabId: 9, opener: 7, at: 999_800 }], 1_000_100)?.tabId, 9, 'the new tab reported before the click');
  assert.equal(tabOpenedBy(clicked, [{ tabId: 9, opener: 3, at: 1_000_400 }], 1_000_500), null, 'a tab opened from another tab');
  assert.equal(tabOpenedBy(clicked, [{ tabId: 9, opener: 7, at: 1_030_000 }], 1_030_000), null, 'a tab opened long after the click');
  assert.equal(tabOpenedBy(null, [{ tabId: 9, opener: 7, at: 1 }], 2), null, 'no click');
});

test('a handoff stays with its posting, not another job or company on the same ATS host', async context => {
  const previous = globalThis.chrome;
  context.after(() => { if (previous === undefined) delete globalThis.chrome; else globalThis.chrome = previous; });
  const job = {title: 'Python Engineer', description: 'Actual LinkedIn requirements.'};
  const store = {'fromLinkedIn:9': {job, at: Date.now(), host: null}};
  globalThis.chrome = {storage: {session: {get: async key => ({[key]: store[key]}), set: async values => Object.assign(store, values)}}};
  const url = 'https://jobs.jobvite.com/careers/varonis/job/one/apply?jvs=LinkedIn';
  assert.deepEqual(await linkedInJobForTab({id: 9, url}), job);
  assert.deepEqual(await linkedInJobForTab({id: 9, url: 'https://jobs.jobvite.com/careers/varonis/job/one'}), job);
  assert.equal(await linkedInJobForTab({id: 9, url: url.replace('/one/', '/two/')}), null);
  assert.equal(await linkedInJobForTab({id: 9, url: url.replace('/varonis/', '/other/')}), null);
  assert.equal(await linkedInJobForTab({id: 10, url}), null);
  store['fromLinkedIn:9'].at = Date.now() - 13 * 3600_000;
  assert.equal(await linkedInJobForTab({id: 9, url}), null);
  assert.notEqual(handoffTarget('https://example.com/apply?jobId=one'), handoffTarget('https://example.com/apply?jobId=two'));
  assert.notEqual(handoffTarget('https://jobs.jobvite.com/apply?jobId=one'), handoffTarget('https://jobs.jobvite.com/apply?jobId=two'));
});

test('the LinkedIn job stays on every page of its application, as Simplify tracks a posting by its number', async context => {
  const previous = globalThis.chrome;
  context.after(() => { if (previous === undefined) delete globalThis.chrome; else globalThis.chrome = previous; });
  const job = {title: 'Staff Software Engineer, Digital Engineering', description: 'From LinkedIn.'};
  const store = {'fromLinkedIn:5': {job, at: Date.now(), host: null}, 'fromLinkedIn:6': {job, at: Date.now(), host: null}};
  globalThis.chrome = {storage: {session: {get: async key => ({[key]: store[key]}), set: async values => Object.assign(store, values)}}};
  // Avature (Lululemon): the job page, then how to apply, then the form, all job 65847.
  const lulu = 'https://careers.lululemon.com/en_US/careers';
  assert.deepEqual(await linkedInJobForTab({id: 5, url: `${lulu}/JobDetail/Staff-Software-Engineer-Digital-Engineering/65847?source=LinkedIn`}), job);
  assert.deepEqual(await linkedInJobForTab({id: 5, url: `${lulu}/ApplicationMethods?jobId=65847&source=LinkedIn`}), job);
  assert.deepEqual(await linkedInJobForTab({id: 5, url: `${lulu}/ApplicationForm?jobId=65847`}), job);
  assert.equal(await linkedInJobForTab({id: 5, url: `${lulu}/ApplicationMethods?jobId=70000`}), null, 'another posting on the same site');
  assert.equal(await linkedInJobForTab({id: 5, url: 'https://careers.example.com/ApplicationMethods?jobId=65847'}), null, 'another site');
  // Workday (UBC): the job, then its apply pages, by the requisition.
  const ubc = 'https://ubc.wd10.myworkdayjobs.com/en-US/ubcstaffjobs/job/UBC-Vancouver-Campus/Programmer-Analyst-I-2_JR26638';
  assert.deepEqual(await linkedInJobForTab({id: 6, url: `${ubc}?source=LinkedIn`}), job);
  assert.deepEqual(await linkedInJobForTab({id: 6, url: `${ubc}/apply/applyManually?source=LinkedIn`}), job);
  assert.equal(await linkedInJobForTab({id: 6, url: ubc.replace('JR26638', 'JR99999')}), null);
  assert.deepEqual(postingOf('https://boards.greenhouse.io/acme/jobs/4567890?gh_src=x'), {host: 'boards.greenhouse.io', id: '4567890'});
  assert.deepEqual(postingOf('https://www.example.com/careers/apply?gh_jid=4567890'), {host: 'www.example.com', id: '4567890'});
});
