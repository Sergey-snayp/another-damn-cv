import assert from 'node:assert/strict';
import { test } from 'node:test';

// A login that worked on a job site is kept only when it is not the saved one.
function setup(context, saved) {
  const calls = [];
  context.mock.method(globalThis, 'fetch', async (_url, options = {}) => {
    calls.push(options.method ?? 'GET');
    const login = options.method === 'PUT' ? JSON.parse(options.body) : saved;
    return new Response(JSON.stringify({ login }), { headers: { 'Content-Type': 'application/json' } });
  });
  const previous = globalThis.chrome;
  context.after(() => { if (previous === undefined) delete globalThis.chrome; else globalThis.chrome = previous; });
  const session = {};
  globalThis.chrome = { storage: {
    local: { get: async () => ({ auth: { syncToken: 'token' } }), set: async () => {}, remove: async () => {} },
    session: { get: async (key) => ({ [key]: session[key] }), set: async (values) => Object.assign(session, values), remove: async (key) => { delete session[key]; } },
  } };
  return calls;
}
const load = (context) => import(`../src/site-login.js?test=${encodeURIComponent(context.name)}`);

test('the saved login again: nothing is written', async (context) => {
  const calls = setup(context, { email: 'sam@example.com', password: 'Old-pass-123' });
  assert.equal(await (await load(context)).rememberSiteLogin('sam@example.com', 'Old-pass-123'), 'same');
  assert.deepEqual(calls, ['GET']);
});

test('a changed password that worked is saved on the account', async (context) => {
  const calls = setup(context, { email: 'sam@example.com', password: 'Old-pass-123' });
  assert.equal(await (await load(context)).rememberSiteLogin('sam@example.com', 'New-pass-456'), 'saved');
  assert.deepEqual(calls, ['GET', 'PUT']);
});

test('no saved login yet: the one that worked becomes it', async (context) => {
  const calls = setup(context, null);
  assert.equal(await (await load(context)).rememberSiteLogin(' sam@example.com ', 'New-pass-456'), 'saved');
  assert.deepEqual(calls, ['GET', 'PUT']);
});

test('not an email or too short a password: nothing is read or written', async (context) => {
  const calls = setup(context, null);
  const { rememberSiteLogin } = await load(context);
  assert.equal(await rememberSiteLogin('sam', 'New-pass-456'), 'skipped');
  assert.equal(await rememberSiteLogin('sam@example.com', 'short'), 'skipped');
  assert.deepEqual(calls, []);
});

test('a sign-in in flight: kept in memory, saved when the next page confirms it, then forgotten', async (context) => {
  const calls = setup(context, { email: 'sam@example.com', password: 'Old-pass-123' });
  const { noteAttempt, attemptFor, confirmAttempt } = await load(context);
  await noteAttempt(7, 'ubc.wd10.myworkdayjobs.com', 'sam@example.com', 'New-pass-456');
  assert.equal((await attemptFor(7, 'ubc.wd10.myworkdayjobs.com')).password, 'New-pass-456');
  assert.equal(await attemptFor(7, 'accounts.example-mail.com'), null, 'only the same site can confirm it');
  await noteAttempt(7, 'ubc.wd10.myworkdayjobs.com', 'sam@example.com', 'New-pass-456');
  assert.equal(await confirmAttempt(7, 'ubc.wd10.myworkdayjobs.com'), 'saved');
  assert.deepEqual(calls, ['GET', 'PUT']);
  assert.equal(await attemptFor(7, 'ubc.wd10.myworkdayjobs.com'), null, 'forgotten once used');
});

test('an attempt older than a minute is never used', async (context) => {
  const calls = setup(context, null);
  const { noteAttempt, confirmAttempt } = await load(context);
  const now = Date.now;
  context.mock.method(Date, 'now', () => now() - 61_000);
  await noteAttempt(7, 'ubc.wd10.myworkdayjobs.com', 'sam@example.com', 'New-pass-456');
  context.mock.restoreAll();
  assert.equal(await confirmAttempt(7, 'ubc.wd10.myworkdayjobs.com'), 'skipped');
  assert.deepEqual(calls, []);
});
