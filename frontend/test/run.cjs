/**
 * Runs browser tests fast: against a production build, not the dev server.
 *
 * The dev server sends the app as hundreds of separate modules, and every test
 * intercepts every request (to fake the API), so one page load took ~16 s and
 * waits timed out. A build is a few files: a page loads in about a second.
 *
 *   node test/run.cjs                       every *.cjs browser test
 *   node test/run.cjs quick-tailor-card     only the named tests
 *   node test/run.cjs --jobs 4 a b c        up to 4 at once (default 6)
 *
 * quick-tailor-save runs as its six scenarios side by side.
 *
 * Chrome starts once (it takes ~4 s on a Mac) while the app builds; every test
 * opens its own private window in it (see shared-browser.cjs).
 *
 * Builds into .test-build/ (ignored), serves it with `vite preview` on a free
 * port, runs the tests with FRONTEND_URL pointing at it, and stops the server.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const out = path.join(root, '.test-build');
const args = process.argv.slice(2);
const jobsAt = args.indexOf('--jobs');
const jobs = jobsAt >= 0 ? Math.max(1, Number(args[jobsAt + 1]) || 6) : 6;
const names = jobsAt >= 0 ? args.filter((_, index) => index !== jobsAt && index !== jobsAt + 1) : args;
const vite = path.join(root, 'node_modules', '.bin', 'vite');
const puppeteer = require(require.resolve('puppeteer-core', { paths: [path.resolve(root, '../backend')] }));
const chromePath = process.env.CHROME_PATH || (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');

const freePort = () => new Promise((resolve) => {
  const server = net.createServer().listen(0, () => { const { port } = server.address(); server.close(() => resolve(port)); });
});

/** Long tests split into scenarios that run as separate processes, in parallel. */
const SPLIT = { 'quick-tailor-save': ['close', 'save', 'cv', 'pdf', 'history', 'editor'] };

function tests() {
  const all = fs.readdirSync(__dirname).filter((file) => file.endsWith('.cjs') && file !== 'run.cjs' && file !== 'shared-browser.cjs').map((file) => file.replace(/\.cjs$/, ''));
  if (!names.length) return all;
  const missing = names.filter((name) => !all.includes(name.replace(/\.cjs$/, '')));
  if (missing.length) throw new Error(`No such test: ${missing.join(', ')}`);
  return names.map((name) => name.replace(/\.cjs$/, ''));
}
/** Each test, or each scenario of a split one: { name, file, args }. */
const runs = (list) => list.flatMap((name) => (SPLIT[name] ?? [null]).map((scenario) => ({
  name: scenario ? `${name} ${scenario}` : name, file: name, args: scenario ? [`--only=${scenario}`] : [],
})));

function run({ name, file, args }, url, chrome) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, ['--require', path.join(__dirname, 'shared-browser.cjs'), path.join(__dirname, `${file}.cjs`), ...args],
      { cwd: root, env: { ...process.env, FRONTEND_URL: url, SHARED_CHROME_WS: chrome } });
    let output = '';
    // A stuck test fails after 3 minutes instead of holding the whole run.
    const limit = setTimeout(() => { output += '\nStopped: over 3 minutes.\n'; child.kill(); }, 180000);
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('close', (code) => clearTimeout(limit) || resolve({ name, code, output, seconds: Math.round((Date.now() - started) / 1000) }));
  });
}

(async () => {
  const list = runs(tests());
  // Chrome on a Mac sometimes takes over 30 s to start: wait longer, and try once more.
  const start = () => puppeteer.launch({ executablePath: chromePath, headless: true, timeout: 90_000 });
  const browser = start().catch(start);
  const built = await new Promise((resolve) => spawn(vite, ['build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], { cwd: root, stdio: 'inherit' }).on('close', resolve));
  if (built !== 0) { await (await browser).close(); process.exit(built ?? 1); }
  const chrome = await browser;
  const port = await freePort();
  const server = spawn(vite, ['preview', '--outDir', out, '--port', String(port), '--strictPort'], { cwd: root, stdio: 'ignore' });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 50; i += 1) {
    if (await fetch(url).then(() => true, () => false)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  let failed = 0;
  try {
    const queue = [...list];
    await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
      while (queue.length) {
        const result = await run(queue.shift(), url, chrome.wsEndpoint());
        const pass = result.code === 0;
        if (!pass) failed += 1;
        const lines = result.output.split('\n');
        const summary = pass ? lines.filter((line) => line.startsWith('PASS')).join('\n  ') : lines.filter(Boolean).slice(0, 25).join('\n  ');
        console.log(`${pass ? 'ok  ' : 'FAIL'} ${result.name} (${result.seconds}s)\n  ${summary}`);
      }
    }));
  } finally {
    server.kill();
    await chrome.close();
  }
  console.log(failed ? `${failed} of ${list.length} failed` : `all ${list.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
