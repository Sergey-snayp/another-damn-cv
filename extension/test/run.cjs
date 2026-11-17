/**
 * Runs the extension's tests fast, side by side, in one Chrome:
 *
 *   node test/run.cjs                     every test
 *   node test/run.cjs account-step heard  only the named ones (.cjs, .test.mjs or .html)
 *   node test/run.cjs --jobs 6            up to 6 at once (default 4: more overloads a laptop)
 *
 * - Browser tests (*.cjs): Chrome starts once and every test opens its own
 *   private window in it (see shared-browser.cjs). A test that loads the
 *   extension itself still starts its own Chrome.
 * - Unit tests (*.test.mjs): node --test, on Node 22 (they need it).
 * - Test pages (*.html that report a #result): opened from disk, as each
 *   page says to (a file:// page counts as a known job site), each in its
 *   own window of the same Chrome; iframe.html over a local web server, where
 *   its frames load as on a site.
 *
 * Each has a time limit, so a stuck one fails instead of holding the run.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const jobsAt = args.indexOf('--jobs');
const jobs = jobsAt >= 0 ? Math.max(1, Number(args[jobsAt + 1]) || 4) : 4;
const names = (jobsAt >= 0 ? args.filter((_, index) => index !== jobsAt && index !== jobsAt + 1) : args).map((name) => name.replace(/\.(cjs|test\.mjs|html)$/, ''));
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(root, '../backend')] }));
const chromePath = process.env.CHROME_PATH || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');

/** Node 22 for the unit tests: this one if it is, else the newest nvm has. */
function node22() {
  if (Number(process.versions.node.split('.')[0]) >= 22) return process.execPath;
  const dir = path.join(os.homedir(), '.nvm', 'versions', 'node');
  const found = fs.existsSync(dir) ? fs.readdirSync(dir).filter((version) => Number(version.slice(1).split('.')[0]) >= 22).sort().at(-1) : null;
  return found ? path.join(dir, found, 'bin', 'node') : process.execPath;
}

function tests() {
  const files = fs.readdirSync(__dirname);
  const all = [
    ...files.filter((file) => file.endsWith('.test.mjs')).map((file) => ({ name: file.replace(/\.test\.mjs$/, ''), kind: 'unit', file })),
    ...files.filter((file) => file.endsWith('.cjs') && !['run.cjs', 'shared-browser.cjs', 'panel-fixture.cjs'].includes(file)).map((file) => ({ name: file.replace(/\.cjs$/, ''), kind: 'browser', file })),
    ...files.filter((file) => file.endsWith('.html') && /id = 'result'|pre#result/.test(fs.readFileSync(path.join(__dirname, file), 'utf8'))).map((file) => ({ name: file.replace(/\.html$/, ''), kind: 'page', file })),
  ];
  if (!names.length) return all;
  const missing = names.filter((name) => !all.some((test) => test.name === name));
  if (missing.length) throw new Error(`No such test: ${missing.join(', ')}`);
  return all.filter((test) => names.includes(test.name));
}

function child(command, commandArgs, env, limit) {
  return new Promise((resolve) => {
    const process_ = spawn(command, commandArgs, { cwd: root, env: { ...process.env, ...env } });
    let output = '';
    // Over its limit: asked to stop (it closes its window), then killed outright 5 s later.
    const timer = setTimeout(() => {
      output += `\nStopped: over ${limit / 1000} s.\n`;
      process_.kill('SIGTERM');
      setTimeout(() => process_.kill('SIGKILL'), 5000).unref();
    }, limit);
    process_.stdout.on('data', (chunk) => { output += chunk; });
    process_.stderr.on('data', (chunk) => { output += chunk; });
    process_.on('close', (code) => { clearTimeout(timer); resolve({ code, output }); });
  });
}

/** Test pages that need a site address: iframe.html's frames do not load from disk here. */
const OVER_HTTP = new Set(['iframe']);
/** The extension folder over http, so a test page's frames load as on a site. */
function serve() {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const server = http.createServer((request, response) => {
    const file = path.join(root, decodeURIComponent(new URL(request.url, 'http://x').pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function page(test, browser, base) {
  const context = await browser.createBrowserContext();
  try {
    const tab = await context.newPage();
    await tab._client().send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await tab.goto(OVER_HTTP.has(test.name) ? `${base}/test/${test.file}` : `file://${path.join(__dirname, test.file)}`);
    const text = await tab.waitForSelector('pre#result', { timeout: 60000 }).then(() => tab.$eval('pre#result', (node) => node.textContent), () => null);
    if (!text) return { code: 1, output: 'No result within 60 s.' };
    const result = JSON.parse(text);
    const pass = result.passed === true || (Array.isArray(result.failed) && !result.failed.length);
    return { code: pass ? 0 : 1, output: pass ? 'PASS' : JSON.stringify(result.problems ?? result.failed) };
  } catch (error) {
    return { code: 1, output: error.message };
  } finally {
    await context.close().catch(() => {});
  }
}

(async () => {
  const started = Date.now();
  const list = tests();
  // Chrome starts while the unit tests run. On a Mac it sometimes takes over 30 s: wait longer, try once more.
  const start = () => puppeteer.launch({ executablePath: chromePath, headless: true, timeout: 90_000, args: ['--allow-file-access-from-files', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const browserReady = list.some((test) => test.kind !== 'unit') ? start().catch(start) : null;
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  let failed = 0;
  const report = (test, result, seconds) => {
    const pass = result.code === 0;
    if (!pass) failed += 1;
    const lines = result.output.split('\n');
    const summary = pass ? lines.filter((line) => /^(PASS|# pass)/.test(line)).join('\n  ') : lines.filter(Boolean).slice(0, 20).join('\n  ');
    console.log(`${pass ? 'ok  ' : 'FAIL'} ${test.name} (${seconds}s)${summary ? `\n  ${summary}` : ''}`);
  };
  try {
    // Unit tests first, while Chrome starts: they need no browser.
    const queue = [...list.filter((test) => test.kind === 'unit'), ...list.filter((test) => test.kind !== 'unit')];
    await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
      while (queue.length) {
        const test = queue.shift();
        const at = Date.now();
        let result;
        if (test.kind === 'unit') result = await child(node22(), ['--test', path.join(__dirname, test.file)], {}, 120000);
        else {
          const browser = await browserReady;
          result = test.kind === 'page' ? await page(test, browser, base)
            : await child(process.execPath, ['--require', path.join(__dirname, 'shared-browser.cjs'), path.join(__dirname, test.file)], { SHARED_CHROME_WS: browser.wsEndpoint() }, 180000);
        }
        report(test, result, Math.round((Date.now() - at) / 1000));
      }
    }));
  } finally {
    server.close();
    if (browserReady) await (await browserReady.catch(() => null))?.close();
  }
  console.log(`${failed ? `${failed} of ${list.length} failed` : `all ${list.length} passed`} in ${Math.round((Date.now() - started) / 1000)} s`);
  process.exit(failed ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
