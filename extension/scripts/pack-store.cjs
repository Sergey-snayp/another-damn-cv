#!/usr/bin/env node
/**
 * Builds the Chrome Web Store package: a copy of the extension pointed at the
 * live app instead of localhost, zipped for upload.
 *
 *   node scripts/pack-store.cjs --app https://yourdomain.com --client-id <id>.apps.googleusercontent.com
 *
 * --app        the live app's address (one origin: the web app and its API are served together)
 * --client-id  the Google OAuth client the live server checks sign-ins against
 *
 * Writes dist/store/ (the unpacked build, to try with "Load unpacked") and
 * dist/another-damn-cv-<version>.zip (to upload). The source files are not changed.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, index, all) => {
    if (arg.startsWith('--')) pairs.push([arg.slice(2), all[index + 1]]);
    return pairs;
  }, []),
);

function fail(message) {
  console.error(`pack-store: ${message}`);
  process.exit(1);
}

let app;
try {
  app = new URL(args.app ?? '');
} catch {
  fail('--app must be the live address, e.g. --app https://yourdomain.com');
}
if (app.protocol !== 'https:') fail('--app must use https.');
const origin = app.origin;
const clientId = args['client-id'] ?? '';
if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
  fail('--client-id must be a Google OAuth client ID ending in .apps.googleusercontent.com');
}

const out = path.join(root, 'dist', 'store');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
// Only what the extension runs: no tests, scripts or notes.
for (const entry of ['manifest.json', 'src', 'assets']) {
  fs.cpSync(path.join(root, entry), path.join(out, entry), { recursive: true });
}

/** Replaces exactly one known line, so a renamed constant stops the build instead of shipping localhost. */
function replaceOnce(file, pattern, replacement) {
  const target = path.join(out, file);
  const text = fs.readFileSync(target, 'utf8');
  const matches = text.match(new RegExp(pattern, 'g')) ?? [];
  if (matches.length !== 1) fail(`${file}: expected one match for ${pattern}, found ${matches.length}.`);
  fs.writeFileSync(target, text.replace(pattern, replacement));
}

replaceOnce('src/auth.js', /export const API_URL = '[^']*';/, `export const API_URL = '${origin}';`);
replaceOnce('src/auth.js', /const CLIENT_ID = '[^']*';/, `const CLIENT_ID = '${clientId}';`);
replaceOnce('src/jobs.js', /export const APP_URL = '[^']*';/, `export const APP_URL = '${origin}';`);
replaceOnce('src/bridge.js', /const ALLOWED_ORIGIN = '[^']*';/, `const ALLOWED_ORIGIN = '${origin}';`);

// The manifest: the app's own pages get the bridge, and are left out of the form filler.
const manifestPath = path.join(out, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const appPages = `${origin}/*`;
for (const script of manifest.content_scripts) {
  if (script.exclude_matches) script.exclude_matches = [appPages];
  if (script.js.includes('src/bridge.js')) script.matches = [appPages];
}
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

// Nothing may still point at a developer's machine.
const leftovers = fs
  .readdirSync(out, { recursive: true })
  .map((file) => path.join(out, file))
  .filter((file) => fs.statSync(file).isFile() && /localhost|127\.0\.0\.1/.test(fs.readFileSync(file, 'latin1')));
if (leftovers.length) fail(`still mentions localhost:\n${leftovers.join('\n')}`);

const zip = path.join(root, 'dist', `another-damn-cv-${manifest.version}.zip`);
fs.rmSync(zip, { force: true });
execFileSync('zip', ['-qr', '-X', zip, '.'], { cwd: out });
console.log(`Built ${path.relative(root, zip)} for ${origin} (version ${manifest.version}).`);
