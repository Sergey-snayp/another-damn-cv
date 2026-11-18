import assert from 'node:assert/strict';
import { test } from 'node:test';

const DESCRIPTION = `Requirements:\nStrong TypeScript and PostgreSQL experience.\nYou will build services with Docker. ${'We ship every day with a small team. '.repeat(6)}`;
function setup(context, { signedIn = true, hidden = false, job = null, resumes = [{ id: 'cv1', name: 'CV', isPrimary: true, updatedAt: '1' }], cvText = 'TypeScript and Docker' } = {}) {
  const store = { ...(signedIn && { auth: { syncToken: 'token' } }), ...(hidden && { matchCardHidden: true }) };
  globalThis.chrome = { storage: { local: {
    get: async (keys) => Object.fromEntries([].concat(keys).filter((key) => key in store).map((key) => [key, store[key]])),
    set: async (values) => { Object.assign(store, values); },
    remove: async (keys) => { for (const key of [].concat(keys)) delete store[key]; },
  } } };
  context.after(() => { delete globalThis.chrome; });
  context.mock.method(globalThis, 'fetch', async (url) => {
    const { pathname } = new URL(url);
    const body = pathname === '/api/jobs/lookup' ? { job } : pathname.endsWith('/text') ? { text: cvText } : resumes;
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  });
}
const card = async (context, input) => {
  const { matchCardData } = await import(`../src/match-card-data.js?test=${encodeURIComponent(context.name)}`);
  return matchCardData({ url: 'https://jobs.lever.co/acme/1', title: 'Engineer', description: DESCRIPTION, ...input });
};

test('the chosen CV is scored against the job', async (context) => {
  setup(context);
  const reply = await card(context);
  assert.deepEqual([reply.show, reply.matched, reply.total], [true, 2, 3]);
  assert.ok(reply.score > 0 && reply.score < 100);
});
test('signed out, no CV or hidden: no card', async (context) => {
  setup(context, { signedIn: false });
  assert.deepEqual(await card(context), { show: false });
});
test('no CV: no card', async (context) => {
  setup(context, { resumes: [] });
  assert.deepEqual(await card(context), { show: false });
});
test('hidden in Settings: no card', async (context) => {
  setup(context, { hidden: true });
  assert.deepEqual(await card(context), { show: false });
});
test('a job already applied to says so, even when hidden', async (context) => {
  setup(context, { hidden: true, job: { id: 'job1', status: 'applied', appliedAt: '2026-11-01T00:00:00Z' } });
  assert.deepEqual(await card(context), { show: true, applied: { jobId: 'job1', at: '2026-11-01T00:00:00Z' } });
});
test('without a description or keywords it says why', async (context) => {
  setup(context);
  assert.match((await card(context, { description: 'short' })).message, /No job description/);
  assert.match((await card(context, { title: 'Cook', description: 'Prepare food for our guests every day. '.repeat(8) })).message, /No keywords/);
});
