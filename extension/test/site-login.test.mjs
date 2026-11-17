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

const SITE = 'ubc.wd10.myworkdayjobs.com';

test('the saved login again: nothing is offered or written', async (context) => {
  const calls = setup(context, { email: 'sam@example.com', password: 'Old-pass-123' });
  const { offerSiteLogin, offerFor } = await load(context);
  assert.equal(await offerSiteLogin(7, SITE, 'sam@example.com', 'Old-pass-123'), 'same');
  assert.equal(await offerFor(7), null);
  assert.deepEqual(calls, ['GET']);
});

test('a changed password that worked is offered, not saved, and the panel never sees it', async (context) => {
  const calls = setup(context, { email: 'sam@example.com', password: 'Old-pass-123' });
  const { offerSiteLogin, offerFor } = await load(context);
  assert.equal(await offerSiteLogin(7, SITE, 'sam@example.com', 'New-pass-456'), 'offered');
  assert.deepEqual(await offerFor(7), { host: SITE, email: 'sam@example.com', update: true });
  assert.deepEqual(calls, ['GET'], 'nothing written before the person answers');
});

test('"Update password" saves it on the account once; "Not now" drops it', async (context) => {
  const calls = setup(context, { email: 'sam@example.com', password: 'Old-pass-123' });
  const { offerSiteLogin, acceptOffer, dismissOffer, offerFor } = await load(context);
  await offerSiteLogin(7, SITE, 'sam@example.com', 'New-pass-456');
  assert.equal(await acceptOffer(7), 'saved');
  assert.deepEqual(calls, ['GET', 'PUT']);
  assert.equal(await acceptOffer(7), 'skipped', 'once');
  await offerSiteLogin(8, SITE, 'sam@example.com', 'Other-pass-789');
  await dismissOffer(8);
  assert.equal(await offerFor(8), null);
  assert.deepEqual(calls, ['GET', 'PUT', 'GET']);
});

test('no saved login yet: offered as a new login', async (context) => {
  setup(context, null);
  const { offerSiteLogin, offerFor } = await load(context);
  assert.equal(await offerSiteLogin(7, SITE, ' sam@example.com ', 'New-pass-456'), 'offered');
  assert.deepEqual(await offerFor(7), { host: SITE, email: 'sam@example.com', update: false });
});

test('not an email or too short a password: nothing is read or offered', async (context) => {
  const calls = setup(context, null);
  const { offerSiteLogin } = await load(context);
  assert.equal(await offerSiteLogin(7, SITE, 'sam', 'New-pass-456'), 'skipped');
  assert.equal(await offerSiteLogin(7, SITE, 'sam@example.com', 'short'), 'skipped');
  assert.deepEqual(calls, []);
});

test('a sign-in in flight: kept in memory, offered when the next page confirms it, then forgotten', async (context) => {
  const calls = setup(context, { email: 'sam@example.com', password: 'Old-pass-123' });
  const { noteAttempt, attemptFor, confirmAttempt, offerFor } = await load(context);
  await noteAttempt(7, SITE, 'sam@example.com', 'New-pass-456');
  assert.equal((await attemptFor(7, SITE)).password, 'New-pass-456');
  assert.equal(await attemptFor(7, 'accounts.example-mail.com'), null, 'only the same site can confirm it');
  await noteAttempt(7, SITE, 'sam@example.com', 'New-pass-456');
  assert.equal(await confirmAttempt(7, SITE), 'offered');
  assert.equal((await offerFor(7)).email, 'sam@example.com');
  assert.deepEqual(calls, ['GET']);
  assert.equal(await attemptFor(7, SITE), null, 'forgotten once used');
});

test('an attempt older than a minute, or an offer older than ten, is never used', async (context) => {
  const calls = setup(context, { email: 'sam@example.com', password: 'Old-pass-123' });
  const { noteAttempt, confirmAttempt, offerSiteLogin, acceptOffer } = await load(context);
  const now = Date.now();
  context.mock.method(Date, 'now', () => now - 61_000);
  await noteAttempt(7, SITE, 'sam@example.com', 'New-pass-456');
  context.mock.method(Date, 'now', () => now);
  assert.equal(await confirmAttempt(7, SITE), 'skipped');
  context.mock.method(Date, 'now', () => now - 11 * 60_000);
  await offerSiteLogin(9, SITE, 'sam@example.com', 'New-pass-456');
  context.mock.method(Date, 'now', () => now);
  assert.equal(await acceptOffer(9), 'skipped');
  assert.deepEqual(calls, ['GET']);
});
