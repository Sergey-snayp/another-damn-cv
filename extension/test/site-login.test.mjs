import assert from 'node:assert/strict';
import { test } from 'node:test';

// A login that worked on a job site is kept only when it is not the saved one.
// The server: one saved login, plus `own` logins for single sites (host → { email, password }).
function setup(context, saved, own = {}) {
  const calls = [];
  context.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const method = options.method ?? 'GET';
    const { pathname, searchParams } = new URL(url);
    const path = pathname.replace(/^.*\/site-login/, '');
    calls.push(path ? `${method} ${path}` : method);
    const site = path.match(/^\/sites\/([^/]+)\/login$/)?.[1];
    let reply;
    if (site && method === 'PUT') { own[site] = JSON.parse(options.body); reply = { login: { ...own[site], site } }; }
    else if (site && method === 'DELETE') { delete own[site]; reply = { ownLogins: Object.keys(own) }; }
    else if (method === 'PUT') { saved = JSON.parse(options.body); reply = { login: saved }; }
    else { const host = searchParams.get('host'); reply = { login: host && own[host] ? { ...own[host], site: host } : saved, ownLogins: Object.keys(own) }; }
    return new Response(JSON.stringify(reply), { headers: { 'Content-Type': 'application/json' } });
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
  assert.deepEqual(await offerFor(7), { host: SITE, email: 'sam@example.com', update: true, own: false });
  assert.deepEqual(calls, ['GET'], 'nothing written before the person answers');
});

test('"Save for this site only" keeps it for that site, and every other site keeps the saved password; "Not now" drops it', async (context) => {
  const own = {};
  const calls = setup(context, { email: 'sam@example.com', password: 'Old-pass-123' }, own);
  const { offerSiteLogin, acceptOffer, dismissOffer, offerFor, readSiteLogin } = await load(context);
  await offerSiteLogin(7, SITE, 'sam@example.com', 'New-pass-456');
  assert.equal(await acceptOffer(7, 'site'), 'saved');
  assert.deepEqual(calls, ['GET', `PUT /sites/${SITE}/login`], 'only this site is written, not the saved login');
  assert.equal((await readSiteLogin(SITE)).password, 'New-pass-456', 'this site: its own');
  assert.equal((await readSiteLogin('workday.wd5.myworkdayjobs.com')).password, 'Old-pass-123', 'another company: the saved one');
  assert.equal(await acceptOffer(7, 'site'), 'skipped', 'once');
  calls.length = 0;
  await offerSiteLogin(8, SITE, 'sam@example.com', 'Other-pass-789');
  await dismissOffer(8);
  assert.equal(await offerFor(8), null);
  assert.deepEqual(calls, ['GET'], 'nothing written');
});

test('signing in again with that site\'s own password: nothing offered', async (context) => {
  setup(context, { email: 'sam@example.com', password: 'Old-pass-123' }, { [SITE]: { email: 'sam@example.com', password: 'Ubc-only-456' } });
  const { offerSiteLogin } = await load(context);
  assert.equal(await offerSiteLogin(7, SITE, 'sam@example.com', 'Ubc-only-456'), 'same');
  assert.equal(await offerSiteLogin(7, 'workday.wd5.myworkdayjobs.com', 'sam@example.com', 'Old-pass-123'), 'same');
});

test('"Use for all sites" makes it the saved password, and the site\'s own one goes', async (context) => {
  const own = { [SITE]: { email: 'sam@example.com', password: 'Ubc-only-456' } };
  const calls = setup(context, { email: 'sam@example.com', password: 'Old-pass-123' }, own);
  const { offerSiteLogin, offerFor, acceptOffer, readSiteLogin } = await load(context);
  await offerSiteLogin(7, SITE, 'sam@example.com', 'New-pass-789');
  assert.equal((await offerFor(7)).own, true, 'the panel can say this site had its own');
  assert.equal(await acceptOffer(7, 'all'), 'saved');
  assert.deepEqual(calls, ['GET', 'PUT', `DELETE /sites/${SITE}/login`]);
  assert.equal((await readSiteLogin('workday.wd5.myworkdayjobs.com')).password, 'New-pass-789');
  assert.equal((await readSiteLogin(SITE)).password, 'New-pass-789');
});

test('no saved login yet: offered as a new login', async (context) => {
  setup(context, null);
  const { offerSiteLogin, offerFor } = await load(context);
  assert.equal(await offerSiteLogin(7, SITE, ' sam@example.com ', 'New-pass-456'), 'offered');
  assert.deepEqual(await offerFor(7), { host: SITE, email: 'sam@example.com', update: false, own: false });
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
