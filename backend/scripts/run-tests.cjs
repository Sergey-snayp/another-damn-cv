const { readdirSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

if (Number(process.versions.node.split('.')[0]) !== 22) {
  process.stderr.write('Use Node 22 for this project: run nvm use from the repository root.\n');
  process.exit(1);
}

const mode = process.argv[2] ?? 'unit';
if (!['unit', 'http', 'integration'].includes(mode)) throw new Error(`Unknown test group: ${mode}`);
const root = path.resolve(__dirname, '../test');
function findTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? findTests(file) : entry.name.endsWith('.test.ts') ? [file] : [];
  });
}
const files = findTests(root)
  .filter((file) => {
    const group = path.relative(root, file).split(path.sep)[0];
    return mode === 'unit' ? group !== 'http' && group !== 'integration' : group === mode;
  })
  .sort();
if (!files.length) throw new Error(`No ${mode} tests found.`);
// Test files run side by side. Database tests share one database (each makes its own users),
// so they get fewer places, and the migrations run once here instead of once per file.
const cores = Math.max(1, os.availableParallelism() - 1);
const jobs = Number(process.env.TEST_JOBS) || (mode === 'integration' ? Math.min(cores, 6) : cores);
const env = { ...process.env };
if (mode === 'integration') {
  require('dotenv/config');
  const address = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!address) throw new Error('Set DATABASE_URL (or TEST_DATABASE_URL) to reach Postgres.');
  const url = new URL(address);
  if (!process.env.TEST_DATABASE_URL) url.pathname = '/cv_test';
  if (!url.pathname.endsWith('_test')) throw new Error(`Refusing to migrate "${url.pathname}": not a test database.`);
  const migrated = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: url.toString(), PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  if (migrated.status !== 0) process.exit(migrated.status ?? 1);
  env.TEST_DATABASE_MIGRATED = '1';
}
const result = spawnSync(
  process.execPath,
  [
    '--require',
    require.resolve('ts-node/register/transpile-only'),
    '--test',
    `--test-concurrency=${jobs}`,
    ...files,
  ],
  { stdio: 'inherit', env },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
