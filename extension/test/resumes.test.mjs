import assert from 'node:assert/strict';
import { test } from 'node:test';

const cv = (id, extra = {}) => ({ id, name: `CV ${id}`, updatedAt: '2026-11-05', ...extra });
const reply = (items) => new Response(JSON.stringify(items), { headers: { 'content-type': 'application/json' } });
const empty = { items: [], chosen: null };

async function fixture(context, seed = {}) {
  const store = { auth: { syncToken: 'owner-token' }, ...seed };
  context.mock.method(globalThis, 'fetch', async () => reply([]));
  const previousChrome = globalThis.chrome;
  context.after(() => { if (previousChrome === undefined) delete globalThis.chrome; else globalThis.chrome = previousChrome; });
  globalThis.chrome = {
    storage: { local: {
      get: async (keys) => structuredClone(Object.fromEntries([].concat(keys).filter(key => key in store).map(key => [key, store[key]]))),
      set: async (values) => Object.assign(store, structuredClone(values)),
      remove: async (keys) => { for (const key of [].concat(keys)) delete store[key]; },
    } },
  };
  const api = await import(`../src/resumes.js?test=${encodeURIComponent(context.name)}`);
  return { store, api };
}

test('a new panel never displays a persisted library before the backend answers', async (context) => {
  const { store, api } = await fixture(context, { appResumes: [cv('deleted')], chosenResumeId: 'deleted' });
  assert.deepEqual(await api.cachedResumes(), empty);
  assert.deepEqual(await api.fetchResumes(), empty);
  assert.deepEqual(await api.cachedResumes(), empty);
  assert.equal(store.chosenResumeId, undefined);
  assert.equal(store.appResumes, undefined);
});

test('the backend replaces the complete collection, including renames, job copies and deletion of the last CV', async (context) => {
  const { store, api } = await fixture(context);
  let items = [cv('mine'), cv('tailored', { tailoredForJob: true })];
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    assert.equal(options.cache, 'no-store');
    return reply(items);
  });
  assert.deepEqual((await api.fetchResumes()).items, items);
  await api.chooseResume('tailored');
  items = [cv('tailored', { name: 'Renamed', tailoredForJob: true })];
  assert.equal((await api.fetchResumes()).chosen.name, 'Renamed');
  items = [];
  assert.deepEqual(await api.fetchResumes(), empty);
  assert.deepEqual(await api.cachedResumes(), empty);
  assert.equal(store.chosenResumeId, undefined);
});

test('network and server failures drop the previous list even for callers outside the panel loader', async (context) => {
  const { api } = await fixture(context);
  for (const fail of [() => { throw new TypeError('offline'); }, () => new Response('{}', { status: 503 })]) {
    context.mock.method(globalThis, 'fetch', async () => reply([cv('old')]));
    await api.fetchResumes();
    context.mock.method(globalThis, 'fetch', async () => fail());
    await assert.rejects(api.fetchResumes());
    assert.deepEqual(await api.cachedResumes(), empty);
  }
});

test('a slow response after sign-out cannot restore the old documents', async (context) => {
  const { store, api } = await fixture(context);
  let finish;
  context.mock.method(globalThis, 'fetch', () => new Promise(resolve => { finish = resolve; }));
  const request = api.fetchResumes();
  await new Promise(resolve => setImmediate(resolve));
  delete store.auth;
  finish(reply([cv('old')]));
  await assert.rejects(request);
  assert.deepEqual(await api.cachedResumes(), empty);
  assert.equal(store.appResumes, undefined);
});

test('an earlier account response cannot replace the new account library or sign it out', async (context) => {
  const { store, api } = await fixture(context);
  for (const staleReply of [() => reply([cv('old')]), () => new Response('{}', { status: 401 })]) {
    await api.forgetResumes();
    store.auth = { syncToken: 'old-token' };
    let finish;
    context.mock.method(globalThis, 'fetch', (_url, options) => options.headers.Authorization === 'Bearer old-token'
      ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(reply([cv('new')])));
    const old = api.fetchResumes();
    await new Promise(resolve => setImmediate(resolve));
    store.auth = { syncToken: 'new-token' };
    assert.deepEqual(await api.cachedResumes(), empty);
    await api.fetchResumes();
    finish(staleReply());
    await assert.rejects(old);
    assert.equal(store.auth.syncToken, 'new-token');
    assert.deepEqual((await api.cachedResumes()).items, [cv('new')]);
  }
});

test('concurrent readers share one request, and a later refresh asks the backend again', async (context) => {
  const { api } = await fixture(context);
  let calls = 0, finish;
  context.mock.method(globalThis, 'fetch', () => { calls++; return new Promise(resolve => { finish = resolve; }); });
  const first = api.fetchResumes(), second = api.fetchResumes();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  finish(reply([cv('current')]));
  assert.deepEqual(await first, await second);
  const refresh = api.fetchResumes();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2);
  finish(reply([]));
  assert.deepEqual(await refresh, empty);
});

test('PDF uploads use the full backend CV name, including international names', async (context) => {
  const { api } = await fixture(context);
  for (const name of ['Sergey_Proniuk_CV_Box_Software_Engineer_III.pdf', 'José_Коваль_CV_Box_Engineer.pdf']) {
    context.mock.method(globalThis, 'fetch', async () => new Response('%PDF-1.4 test', {
      headers: { 'content-disposition': `attachment; filename="fallback.pdf"; filename*=UTF-8''${encodeURIComponent(name)}` },
    }));
    const file = await api.pdfFor(cv('application'));
    assert.equal(file.fileName, name);
  }
});

test('a job page starts with: the CV picked on that page, else the copy tailored for its job, else the default', async (context) => {
  const items = [cv('newest'), cv('tailored', { jobId: 'job-1', tailoredForJob: true }), cv('master', { isPrimary: true })];
  const { store, api } = await fixture(context);
  context.mock.method(globalThis, 'fetch', async () => reply(items));

  api.setResumeContext('https://jobs.example.com/new', null);
  assert.equal((await api.fetchResumes()).chosen.id, 'master', 'a new job: the default, not the newest CV');

  api.setResumeContext('https://jobs.example.com/acme', 'job-1');
  assert.equal((await api.cachedResumes()).chosen.id, 'tailored', "a saved job with its own copy: that copy");

  await api.chooseResume('newest');
  assert.equal((await api.cachedResumes()).chosen.id, 'newest', 'a pick on this page wins');
  api.setResumeContext('https://jobs.example.com/other', null);
  assert.equal((await api.cachedResumes()).chosen.id, 'master', 'and stays on its page: the next job starts from the default');
  api.setResumeContext('https://jobs.example.com/acme', 'job-1');
  assert.equal((await api.cachedResumes()).chosen.id, 'newest', 'back on that page, the pick is still there');
  assert.equal(store.chosenResumeId, 'newest', "the background's drafts use the page's CV");
});
