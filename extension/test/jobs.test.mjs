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

test('injected capture errors are returned explicitly and a later read can succeed', async context => {
  const { api } = await fixture(context);
  const previous = globalThis.__cvCapture;
  context.after(() => { if (previous === undefined) delete globalThis.__cvCapture; else globalThis.__cvCapture = previous; });
  globalThis.chrome.scripting = { executeScript: async options => options.func ? [{ result: await options.func() }] : [] };
  globalThis.__cvCapture = async () => { throw new Error('The selected description is still loading.'); };
  await assert.rejects(api.captureTab(1), /selected description is still loading/);
  const capture = { url: 'https://www.linkedin.com/jobs/view/111', text: 'Node.js TypeScript PostgreSQL' };
  globalThis.__cvCapture = async () => capture;
  assert.deepEqual(await api.captureTab(1), capture);
});

test('a submitted application moves its saved job to Applied, never back from a later stage', async context => {
  const { api } = await fixture(context);
  let status = 'saved';
  const requests = [];
  context.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method ?? 'GET', body: options.body });
    if (String(url).includes('/api/jobs/lookup')) return new Response(JSON.stringify({ job: status ? { id: 'job-1', status } : null }));
    return new Response(JSON.stringify({ id: 'job-1', status: 'applied' }));
  });
  const answers = [{ question: 'Website', answer: 'https://serhii.dev' }];
  assert.equal(await api.markApplied('https://www.linkedin.com/jobs/view/111', answers), true);
  assert.ok(requests[0].url.endsWith(`/api/jobs/lookup?url=${encodeURIComponent('https://www.linkedin.com/jobs/view/111')}`));
  assert.ok(requests[1].url.endsWith('/api/jobs/job-1/application'), 'the form\'s answers are kept on the job');
  assert.deepEqual(JSON.parse(requests[1].body), { answers });
  assert.deepEqual([requests[2].method, JSON.parse(requests[2].body)], ['PATCH', { status: 'applied' }]);

  for (const later of ['applied', 'interview', 'rejected']) {
    status = later;
    requests.length = 0;
    assert.equal(await api.markApplied('https://www.linkedin.com/jobs/view/111'), false, `${later} stays ${later}`);
    assert.ok(!requests.some(request => request.method === 'PATCH'), 'never moved back');
  }
  status = null;
  assert.equal(await api.markApplied('https://example.com/careers/1'), false, 'a page that is not a saved job changes nothing');
  assert.equal(await api.markApplied('chrome://extensions'), false);
});

test('a drafted answer is asked for with the saved job description, else with what the page shows', async context => {
  const { api } = await fixture(context);
  const requests = [];
  let saved = true;
  context.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    requests.push({ url: String(url), method: options.method ?? 'GET', body: options.body });
    if (String(url).includes('/api/jobs/lookup')) return new Response(JSON.stringify({ job: saved ? { id: 'job-1', status: 'saved' } : null }));
    if (String(url).endsWith('/api/extension/jobs/job-1')) return new Response(JSON.stringify({ id: 'job-1', title: 'Senior Backend Engineer', company: 'Quo', description: 'Build the phone system.' }));
    return new Response(JSON.stringify({ answer: 'Because of the product.', needsInput: ['start date'] }));
  });
  const page = { title: 'Apply', company: 'Quo', text: 'The form text' };
  assert.deepEqual(await api.jobForDraft('https://jobs.ashbyhq.com/quo/1/application', page), { title: 'Senior Backend Engineer', company: 'Quo', text: 'Build the phone system.' });
  saved = false;
  assert.deepEqual(await api.jobForDraft('https://jobs.ashbyhq.com/quo/1/application', page), page, 'not saved: the page');

  const draft = await api.draftAnswer({ question: 'Why Quo?', kind: 'textarea', job: page, resumeId: 'cv-1' });
  assert.deepEqual(draft, { answer: 'Because of the product.', needsInput: ['start date'] });
  const last = requests.at(-1);
  assert.ok(last.url.endsWith('/api/extension/answers/draft') && last.method === 'POST');
  assert.deepEqual(JSON.parse(last.body), { question: 'Why Quo?', kind: 'textarea', job: page, resumeId: 'cv-1' });
});
