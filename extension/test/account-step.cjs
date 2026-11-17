const assert = require('node:assert/strict');
const path = require('node:path');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(__dirname, '../../backend')] }));
const { panelFixture, pageWithScripts } = require('./panel-fixture.cjs');

// Workday's account step, done as Simplify does it, with the login kept on the
// account (the server) instead of the browser. Synthetic pages in Workday's markup.
const JOB = 'https://ubc.wd10.myworkdayjobs.com/ubcstaffjobs/job/UBC-Vancouver-Campus---Vancouver-BC-Canada/Programmer-Analyst-I-2_JR26638';
const POSTING = '<script type="application/ld+json">{"@type":"JobPosting","title":"Programmer Analyst I","hiringOrganization":{"name":"University of British Columbia"}}</script>';
const field = (id, label, type = 'text') => `<div data-automation-id="formField-${id}"><label for="${id}">${label}</label><input id="${id}" type="${type}" data-automation-id="${id}"></div>`;
const pages = {
  [`${JOB}/apply/applyManually`]: `<!doctype html><title>Create Account</title>${POSTING}<main><h1>Create Account</h1>
    ${field('email', 'Email Address')}${field('password', 'Password', 'password')}${field('verifyPassword', 'Verify New Password', 'password')}
    <div data-automation-id="createAccountCheckbox"><input type="checkbox" id="agree"><label for="agree">Yes, I have read and consent to the terms and conditions.</label></div>
    <button data-automation-id="createAccountSubmitButton" onclick="window.submitted = true">Create Account</button>
    <p>Already have an account? <button data-automation-id="signInLink" onclick="window.switched = true; document.querySelector('main').innerHTML = document.getElementById('sign-in').innerHTML">Sign In</button></p></main>
    <template id="sign-in"><h1>Sign In</h1>${field('email', 'Email Address')}${field('password', 'Password', 'password')}<button data-automation-id="signInSubmitButton" onclick="window.submitted = true">Sign In</button></template>`,
  // Workday keeps headings like "Errors Found" on its pages: they are not this sign-in's error.
  [`${JOB}/login`]: `<!doctype html><title>Sign In</title>${POSTING}<div class="errorSummary">Errors Found</div><main><h1>Sign In</h1>
    ${field('email', 'Email Address')}${field('password', 'Password', 'password')}
    <button data-automation-id="signInSubmitButton" onclick="window.submitted = true; signIn()">Sign In</button></main>
    <script>
      // Workday signs in with the changed password and moves on; a wrong one says so and stays.
      function signIn() {
        if (document.getElementById('password').value === 'Changed-pass-789') setTimeout(() => { document.querySelector('main').innerHTML = '<h1>My Information</h1>${field('firstName', 'First Name')}${field('lastName', 'Last Name')}'; }, 300);
        else document.querySelector('main').insertAdjacentHTML('afterbegin', '<div role="alert" data-automation-id="errorMessage">Wrong email address or password.</div>');
      }
    </script>`,
};
// Signing in loads a new page, as Workday often does: the next page says whether it worked.
pages[`${JOB}/login-reload`] = `<!doctype html><title>Sign In</title>${POSTING}<main><h1>Sign In</h1>
  ${field('email', 'Email Address')}${field('password', 'Password', 'password')}
  <button data-automation-id="signInSubmitButton" onclick="setTimeout(() => { location.href = '${JOB}/home'; }, 1500)">Sign In</button></main>`;
pages[`${JOB}/home`] = `<!doctype html><title>Candidate Home</title>${POSTING}<main><h1>My Information</h1><div class="errorSummary">Errors Found</div>${field('firstName', 'First Name')}</main>`;
pages[`${JOB}/login-again`] = `<!doctype html><title>Sign In</title>${POSTING}<main><div role="alert">Wrong email address or password.</div><h1>Sign In</h1>${field('email', 'Email Address')}${field('password', 'Password', 'password')}<button>Sign In</button></main>`;
const profile = { email: 'sam@example.com', firstName: 'Sam', lastName: 'Lee' };
// Not a job site: a mail provider's sign-in, which must never be watched.
const MAIL = 'https://accounts.example-mail.com/signin';
pages[MAIL] = `<!doctype html><title>Sign in</title><main>${field('email', 'Email')}${field('password', 'Password', 'password')}<button onclick="setTimeout(() => { document.querySelector('main').innerHTML = '<h1>Inbox</h1>'; }, 300)">Sign in</button></main>`;
const value = (page, id) => page.$eval(`#${id}`, input => input.value);

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, timeout: 90_000 });
  try {
    const page = await pageWithScripts(browser, pages);

    // 1) Create Account, the first time: a new password, saved on the account, then filled.
    await page.open(`${JOB}/apply/applyManually`);
    assert.equal((await page.evaluate(() => window.__ask({ type: 'scan' }))).account, 'create', 'two password boxes: Create Account');
    const server = { login: null, saves: [] };
    let panel = await panelFixture(browser, page, { profile, server });
    await panel.waitForSelector('#account-fill', { timeout: 10000 });
    assert.equal(await panel.$eval('#account-fill', button => button.textContent.trim()), 'Create Account & Autofill');
    assert.equal(await panel.$eval('.account-other', button => button.textContent.trim()), 'I already have an account: Sign In', 'a new site: Create Account first, Sign In second');
    assert.match(await panel.$eval('#job-card', card => card.textContent), /Programmer Analyst I/, 'the card is the job, not "Create Account"');
    await panel.click('#account-fill');
    await panel.waitForFunction(() => /Done\. Check the page, then press Create Account\./.test(document.getElementById('panel-autofill').textContent), { timeout: 10000, polling: 100 });
    assert.equal(server.saves.length, 1, 'the new login is saved on the account once, before it is used');
    const made = server.saves[0];
    assert.equal(made.email, 'sam@example.com');
    assert.match(made.password, /^(?=.*[A-Z])(?=.*[a-z])(?=.*[2-9])(?=.*[!@#$%^&*])[A-HJ-NP-Za-km-z2-9!@#$%^&*]{16}$/, 'a strong 16-character password, no look-alikes');
    assert.deepEqual([await value(page, 'email'), await value(page, 'password'), await value(page, 'verifyPassword')], ['sam@example.com', made.password, made.password]);
    assert.equal(await page.$eval('#agree', box => box.checked), true, 'the agreement is ticked');
    assert.equal(await page.$eval('[data-automation-id="createAccountSubmitButton"]', button => button.style.outline.includes('solid')), true, 'its button is shown');
    assert.equal(await page.evaluate(() => Boolean(window.submitted)), false, 'and never pressed');
    assert.deepEqual(await panel.$$eval('.account-rows li', rows => rows.map(row => row.textContent)), ['Email Address', 'Password', 'Verify New Password', 'Agree to Privacy Notice']);
    await panel.screenshot({ path: '/private/tmp/account-step-panel.png' });
    // Settings → Job-site login: from the account, hidden until Show.
    await panel.click('#settings');
    await panel.waitForSelector('#site-login dl', { timeout: 10000 });
    assert.deepEqual(await panel.$$eval('#site-login dd', cells => cells.map(cell => cell.textContent)), ['sam@example.com', '•'.repeat(12)]);
    await panel.click('#site-login-show');
    assert.equal(await panel.$eval('#site-login-secret', node => node.textContent), made.password);
    await panel.$eval('#site-login', node => node.scrollIntoView());
    await panel.screenshot({ path: '/private/tmp/account-step-settings.png' });
    await panel.close();
    console.log('PASS Create Account: a new strong password saved on the account, filled in both boxes, agreement ticked, button shown, not pressed');

    // 2) Sign In with the saved login: filled, nothing new saved.
    await page.open(`${JOB}/login`);
    assert.equal((await page.evaluate(() => window.__ask({ type: 'scan' }))).account, 'signin');
    panel = await panelFixture(browser, page, { profile, server });
    await panel.waitForSelector('#account-fill', { timeout: 10000 });
    assert.equal(await panel.$eval('#account-fill', button => button.textContent.trim()), 'Sign In & Autofill');
    await panel.click('#account-fill');
    await panel.waitForFunction(() => /press Sign In\./.test(document.getElementById('panel-autofill').textContent), { timeout: 10000, polling: 100 });
    assert.deepEqual([await value(page, 'email'), await value(page, 'password')], ['sam@example.com', made.password]);
    assert.equal(server.saves.length, 1, 'signing in saves nothing');
    assert.equal(await page.evaluate(() => Boolean(window.submitted)), false);
    await panel.close();
    console.log('PASS Sign In: the saved login is filled, nothing saved, not pressed');

    // 3) Sign In with no saved login: it says to type the password; nothing made up.
    await page.open(`${JOB}/login`);
    const empty = { login: null, saves: [] };
    panel = await panelFixture(browser, page, { profile, server: empty });
    await panel.waitForSelector('#account-fill', { timeout: 10000 });
    await panel.click('#account-fill');
    await panel.waitForFunction(() => /Type your password on the page/.test(document.getElementById('panel-autofill').textContent), { timeout: 10000, polling: 100 });
    assert.deepEqual([await value(page, 'email'), await value(page, 'password'), empty.saves.length], ['sam@example.com', '', 0]);
    await panel.close();
    console.log('PASS Sign In without a saved login: email filled, asks for the password, saves nothing');

    // 4) A password changed on the site: once signing in works, the login that worked is passed on to be kept.
    const sentLogins = () => page.evaluate(() => (window.__sent ?? []).filter(message => message.type === 'site-login-used'));
    await page.open(`${JOB}/login`);
    await page.type('#email', 'sam@example.com');
    await page.type('#password', 'Wrong-pass-000');
    await page.click('[data-automation-id="signInSubmitButton"]');
    await new Promise(resolve => setTimeout(resolve, 1500));
    assert.deepEqual(await sentLogins(), [], 'a wrong password shows an error and is never kept');
    assert.deepEqual(await page.evaluate(() => window.__sent.filter(message => /^site-login-(attempt|failed)$/.test(message.type)).map(message => message.type)), ['site-login-attempt', 'site-login-failed'],
      'the attempt is handed over as it is sent, and dropped on the error ("Errors Found" from before does not count)');
    await page.$eval('[role="alert"]', alert => alert.remove());
    await page.$eval('#password', input => { input.value = ''; });
    await page.type('#password', 'Changed-pass-789');
    await page.click('[data-automation-id="signInSubmitButton"]');
    await page.waitForFunction(() => (window.__sent ?? []).some(message => message.type === 'site-login-used'), { timeout: 5000, polling: 100 });
    assert.deepEqual(await sentLogins(), [{ type: 'site-login-used', email: 'sam@example.com', password: 'Changed-pass-789', kind: 'signin' }]);
    console.log('PASS a changed password: kept once signing in works, never a wrong one');

    // 4b) Signing in loads a new page: the attempt went to the background, and the next page confirms it.
    await page.open(`${JOB}/login-reload`);
    await page.type('#email', 'sam@example.com');
    await page.type('#password', 'Changed-pass-789');
    // Waiting for the new page from before the click: under load it may come before the next line.
    const navigated = page.waitForNavigation({ timeout: 15000 });
    await page.click('[data-automation-id="signInSubmitButton"]');
    const handed = await page.evaluate(() => window.__sent.filter(message => message.type === 'site-login-attempt'));
    assert.deepEqual(handed, [{ type: 'site-login-attempt', email: 'sam@example.com', password: 'Changed-pass-789', kind: 'signin' }]);
    await navigated;
    await page.open(`${JOB}/home`, () => { window.__loginPending = true; });
    await page.waitForFunction(() => (window.__sent ?? []).some(message => message.type === 'site-login-confirmed'), { timeout: 8000, polling: 200 });
    assert.ok(!(await page.evaluate(() => window.__sent.some(message => message.type === 'site-login-failed'))));
    // …and a sign-in that comes back to its form with an error is dropped.
    await page.open(`${JOB}/login-again`, () => { window.__loginPending = true; });
    await page.waitForFunction(() => (window.__sent ?? []).some(message => message.type === 'site-login-failed'), { timeout: 15000, polling: 200 });
    assert.ok(!(await page.evaluate(() => window.__sent.some(message => message.type === 'site-login-confirmed'))));
    console.log('PASS a sign-in that loads a new page: handed over as it is sent, confirmed by the next page, dropped when the form comes back');

    // 5) Anywhere else (a mail provider's sign-in): nothing is watched or passed on.
    await page.open(MAIL);
    await page.type('#email', 'sam@example.com');
    await page.type('#password', 'Mail-pass-123');
    await page.click('button');
    await new Promise(resolve => setTimeout(resolve, 1500));
    assert.equal(await page.$('h1') && await page.$eval('h1', h => h.textContent), 'Inbox');
    assert.deepEqual(await sentLogins(), [], 'never on a site that is not a job site');
    console.log('PASS other sites: a sign-in is never watched');

    // 6) The panel asks before a changed password is kept: "Update password", or "Not now".
    await page.open(`${JOB}/home`);
    let asking = await panelFixture(browser, page, { profile, offer: { host: 'ubc.wd10.myworkdayjobs.com', email: 'sam@example.com', update: true } });
    await asking.waitForSelector('#login-offer-accept', { timeout: 10000 });
    assert.match(await asking.$eval('#login-offer', box => box.textContent), /Update your job-site password\?.*ubc\.wd10\.myworkdayjobs\.com.*sam@example\.com/s);
    assert.doesNotMatch(await asking.$eval('#login-offer', box => box.textContent), /pass-/, 'never the password');
    await asking.screenshot({ path: '/private/tmp/login-offer.png' });
    await asking.click('#login-offer-accept');
    await asking.waitForFunction(() => document.getElementById('login-offer').hidden && !document.getElementById('panel-toast').hidden, { timeout: 5000, polling: 100 });
    assert.equal(await asking.$eval('#panel-toast', toast => toast.textContent), 'Saved your new job-site password to your account.');
    assert.deepEqual(await asking.evaluate(() => window.__answers), ['accept']);
    await asking.close();
    asking = await panelFixture(browser, page, { profile, offer: { host: 'ubc.wd10.myworkdayjobs.com', email: 'sam@example.com', update: true } });
    await asking.waitForSelector('#login-offer-dismiss', { timeout: 10000 });
    await asking.click('#login-offer-dismiss');
    await asking.waitForFunction(() => document.getElementById('login-offer').hidden, { timeout: 5000, polling: 100 });
    assert.deepEqual(await asking.evaluate(() => window.__answers), ['dismiss']);
    await asking.close();
    console.log('PASS the panel asks "Update your job-site password?": Update saves it, Not now drops it, the password never shown');

    // 7) A site you have an account on: its Create Account page offers Sign In first, opens it, and fills the saved login.
    const known = { login: { email: 'sam@example.com', password: 'Saved-pass-123', updatedAt: '2026-11-16T10:00:00.000Z' }, saves: [], sites: ['ubc.wd10.myworkdayjobs.com'] };
    await page.open(`${JOB}/apply/applyManually`);
    let choosing = await panelFixture(browser, page, { profile, server: known });
    await choosing.waitForSelector('#account-fill', { timeout: 10000 });
    assert.equal(await choosing.$eval('#account-fill', button => button.textContent.trim()), 'Sign In & Autofill');
    assert.equal(await choosing.$eval('.account-exists', card => card.textContent), 'Account already existsSign in as sam@example.com');
    assert.equal(await choosing.$('.account-other'), null, 'a site with an account: only Sign In');
    assert.equal(await choosing.$$eval('#panel-autofill button[data-account-want]', buttons => buttons.length), 1);
    assert.doesNotMatch(await choosing.$eval('#panel-autofill', node => node.textContent), /Saved-pass-123/, 'never the password');
    await choosing.screenshot({ path: '/private/tmp/account-known-site.png' });
    await choosing.click('#account-fill');
    await choosing.waitForFunction(() => /press Sign In\./.test(document.getElementById('panel-autofill').textContent), { timeout: 10000, polling: 100 });
    assert.equal(await page.evaluate(() => window.switched), true, "Workday's Sign In link pressed");
    assert.deepEqual([await value(page, 'email'), await value(page, 'password'), known.saves.length], ['sam@example.com', 'Saved-pass-123', 0]);
    assert.equal(await page.evaluate(() => Boolean(window.submitted)), false, 'and never pressed Sign In');
    await choosing.close();
    // 8) A new site, but the person says they have an account: the same, from the second button.
    await page.open(`${JOB}/apply/applyManually`);
    choosing = await panelFixture(browser, page, { profile, server: { ...known, sites: [] } });
    await choosing.waitForSelector('.account-other', { timeout: 10000 });
    await choosing.click('.account-other');
    await choosing.waitForFunction(() => /press Sign In\./.test(document.getElementById('panel-autofill').textContent), { timeout: 10000, polling: 100 });
    assert.deepEqual([await value(page, 'email'), await value(page, 'password')], ['sam@example.com', 'Saved-pass-123']);
    await choosing.close();
    // 9) Signing in swaps Workday's page for the application at the same address: the panel follows.
    await page.open(`${JOB}/login`);
    const following = await panelFixture(browser, page, { profile, server: known });
    await following.waitForSelector('#account-fill', { timeout: 10000 });
    await page.evaluate(() => { window.__sent = []; });
    // A page in a background tab never paints, and a click waits for it: the job page comes to the front, as the person sees it.
    await page.bringToFront();
    await page.type('#email', 'sam@example.com');
    await page.type('#password', 'Changed-pass-789');
    await page.click('[data-automation-id="signInSubmitButton"]');
    await page.waitForFunction(() => (window.__sent ?? []).some(message => message.type === 'form-changed'), { timeout: 5000, polling: 100 });
    await following.evaluate(() => window.__deliver({ type: 'form-changed' }));
    await following.waitForSelector('#fill', { timeout: 10000 });
    assert.equal(await following.$('#account-fill'), null, 'the sign-in step is gone from the panel');
    assert.match(await following.$eval('#fill', button => button.textContent), /Autofill This Page/);
    await following.close();
    console.log('PASS after signing in, the application at the same address: the page says its form changed, the panel shows Autofill This Page');
    console.log('PASS Sign In or Create Account: a site you have an account on shows "Account already exists" and only Sign In, which opens it and fills the saved login; a new site offers it second');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });
