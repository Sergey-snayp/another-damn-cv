import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { captureWithDescription } from '../src/job-capture.js';
const require = createRequire(import.meta.url);
require(require.resolve('ts-node', {paths: [fileURLToPath(new URL('../../backend', import.meta.url))]})).register({project: fileURLToPath(new URL('../../backend/tsconfig.json', import.meta.url)), transpileOnly: true});
const {CaptureJob} = require('../../backend/src/modules/jobs/application/use-cases/capture-job.ts');
const {JsonLdJobReader} = require('../../backend/src/modules/jobs/adapters/outbound/documents/json-ld-job.reader.ts');
const {captureSchema} = require('../../backend/src/modules/jobs/adapters/inbound/http/jobs.schemas.ts');

const form = {url: 'https://jobs.jobvite.com/careers/varonis/job/one/apply', pageTitle: 'Apply', html: '<form>First Name <input value="private"/>State Alaska</form>', text: 'Thank you for considering a career. Add Resume. First Name. State. Alaska.', jsonLd: []};
const job = {title: 'Engineer <Python>', company: 'Varonis', location: 'Vancouver, Canada', description: 'About the role\n\nBuild secure Python & AWS services.\nWork with the security engineering team.', url: 'https://www.linkedin.com/jobs/view/111'};

test('a carried posting becomes the backend description immediately, including recapture of an old form-only record', async () => {
  let row = {id: 'saved', description: form.text, editedFields: []};
  const source = structuredClone(form);
  const capture = captureWithDescription(form, {url: form.url.replace('/apply', ''), description: 'Welcome to the application form.'}, job, true);
  const use = new CaptureJob({findByCanonicalUrl: () => Promise.resolve(row), update: (_user, _id, changes) => Promise.resolve(row = {...row, ...changes})}, new JsonLdJobReader(), {enqueue: () => assert.fail('A known posting must not wait for AI extraction')});
  const saved = await use.execute('owner', captureSchema.parse(capture));
  assert.equal(saved.created, false);
  assert.equal(saved.job.description, job.description);
  assert.equal(saved.job.extraction, 'structured');
  assert.doesNotMatch(saved.job.html + saved.job.pageText + saved.job.description, /private|Add Resume|First Name|Alaska/);
  assert.match(capture.html, /Engineer &lt;Python&gt;/);
  assert.equal(capture.jsonLd[0].isBasedOn, job.url);
  assert.deepEqual(form, source);
  row.editedFields = ['description'];
  row.description = 'The person’s edited description.';
  assert.equal((await use.execute('owner', captureSchema.parse(capture))).job.description, 'The person’s edited description.', 'manual edits remain authoritative');
});

test('the ATS overview description is used without a LinkedIn handoff; missing descriptions never become form fields', () => {
  const captured = captureWithDescription(form, {...job, url: form.url.replace('/apply', '')}, null, true);
  assert.equal(new JsonLdJobReader().read(captured.jsonLd).description, job.description);
  const missing = captureWithDescription(form, {title: 'Engineer'}, null, true);
  assert.equal(missing.descriptionMissing, true);
  assert.equal(missing.text, '');
  assert.equal(missing.html, '');
  assert.deepEqual(missing.jsonLd, []);
});

test('existing structured postings retain complete descriptions and salary metadata', () => {
  const capture = {...form, jsonLd: [{'@type': 'JobPosting', title: 'Engineer', description: '<p>Complete posting.</p>', baseSalary: {currency: 'CAD'}}]};
  assert.equal(captureWithDescription(capture, {description: 'Truncated page text.'}), capture);
});
