import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cutDescription, pageReaderPrompt, parsePageReading } from '../src/jobs/page-reader';

const page = `Jobs  Search  Sign in
Senior Backend Engineer
Acme · Toronto, ON (Hybrid)
About the job
We are building the payments platform that moves
money for small businesses across Canada.
You will own services written in Node.js and Postgres.
Benefits include health, dental and a learning budget.
Similar jobs
Frontend Engineer at Globex`;

test('cuts the description out of the page text, across line breaks', () => {
  const cut = cutDescription(page, 'We are building the payments platform that moves money', 'health, dental and a learning budget.');
  assert.ok(cut.startsWith('We are building'));
  assert.ok(cut.endsWith('learning budget.'));
  assert.ok(!cut.includes('Similar jobs'));
});

test('falls back to the whole text when the phrases are not found', () => {
  assert.equal(cutDescription('abc def', 'not here', 'nor here'), 'abc def');
});

test('parses a fenced answer and nulls', () => {
  const answer = 'Here you go:\n```json\n' + JSON.stringify({
    isJobPosting: true,
    title: 'Senior Backend Engineer',
    company: 'Acme',
    location: 'Toronto, ON',
    remote: false,
    employmentType: null,
    salary: 'null',
    descriptionStart: 'We are building the payments platform',
    descriptionEnd: 'and a learning budget.',
  }) + '\n```';

  const reading = parsePageReading(answer, page);
  assert.equal(reading.kind, 'job');
  if (reading.kind !== 'job') return;
  assert.equal(reading.fields.title, 'Senior Backend Engineer');
  assert.equal(reading.fields.remote, false);
  assert.equal(reading.fields.employmentType, undefined);
  assert.equal(reading.fields.salary, undefined);
  assert.ok(reading.fields.description?.startsWith('We are building'));
});

test('not a job, and not JSON', () => {
  assert.deepEqual(parsePageReading('{"isJobPosting": false}', page), { kind: 'not-a-job' });
  assert.deepEqual(parsePageReading('Sorry, I cannot help.', page), { kind: 'unreadable' });
});

test('the page is fenced as data and truncated', () => {
  const prompt = pageReaderPrompt({ url: 'https://x.test/job', pageTitle: 'Job', text: 'a'.repeat(50_000) });
  assert.ok(prompt.includes('<page>') && prompt.includes('</page>'));
  assert.ok(prompt.length < 31_000);
});
