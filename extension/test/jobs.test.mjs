import assert from 'node:assert/strict';
import { test } from 'node:test';

async function fixture(context) {
  const store = { auth: { syncToken: 'owner-token' } };
  const previous = globalThis.chrome;
  context.after(() => { if (previous === undefined) delete globalThis.chrome; else globalThis.chrome = previous; });
  globalThis.chrome = { storage: { local: {
    get: async () => structuredClone(store),
    remove: async key => { delete store[key]; },
  } } };
  context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ id: 'job-1', status: 'interview', notes: 'Saved note' })));
  return { store, api: await import(`../src/jobs.js?test=${encodeURIComponent(context.name)}`) };
}

test('saved job forms read the backend and patch the same ID with the current bearer token', async context => {
  const { api } = await fixture(context);
  const requests = [];
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({ id: 'job-1', status: 'interview', notes: 'Saved note' }));
  });
  assert.equal((await api.getSavedJob('job-1')).notes, 'Saved note');
  await api.updateSavedJob('job-1', { notes: 'Edited note' });
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.url.endsWith('/api/extension/jobs/job-1') && request.options.headers.Authorization === 'Bearer owner-token' && request.options.cache === 'no-store'));
  assert.equal(requests[1].options.method, 'PATCH');
  assert.deepEqual(JSON.parse(requests[1].options.body), { notes: 'Edited note' });
});

test('an old account response cannot populate a saved job form or sign out a newer account', async context => {
  const { store, api } = await fixture(context);
  let finish;
  context.mock.method(globalThis, 'fetch', () => new Promise(resolve => { finish = resolve; }));
  const request = api.getSavedJob('job-1');
  await new Promise(resolve => setImmediate(resolve));
  store.auth = { syncToken: 'new-token' };
  finish(new Response('{}', { status: 401 }));
  await assert.rejects(request, api.NotSignedInError);
  assert.equal(store.auth.syncToken, 'new-token');
});

test('missing or malformed saved jobs fail instead of becoming a new capture', async context => {
  const { api } = await fixture(context);
  context.mock.method(globalThis, 'fetch', async () => new Response('{"message":"No such job."}', { status: 404 }));
  await assert.rejects(api.getSavedJob('job-1'), error => error.status === 404 && error.message === 'No such job.');
  context.mock.method(globalThis, 'fetch', async () => new Response('{"id":"different-job"}'));
  await assert.rejects(api.getSavedJob('job-1'), /unexpected job details/);
});
