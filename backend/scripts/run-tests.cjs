const { readdirSync } = require('node:fs');
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
const result = spawnSync(
  process.execPath,
  [
    '--require',
    require.resolve('ts-node/register/transpile-only'),
    '--test',
    '--test-concurrency=1',
    ...files,
  ],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
