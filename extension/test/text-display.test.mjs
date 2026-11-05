import assert from 'node:assert/strict';
import { test } from 'node:test';
import { previewText, previewCvName, UI_TEXT_LIMIT } from '../src/text-display.js';

const job = "Sr. Delivery Consultant - Application Modernization/Consultant en livraison – Modernisation d'applications, AWS Professional Services — Amazon Web Services Canada, Inc.";
const count = text => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length;
test('one default bounds the reported bilingual job title and status without changing the source', () => {
  const before = job;
  for (const value of [job, `Autofill now uploads ${job}.`, 'https://example.com/' + 'long-link/'.repeat(20)]) {
    const preview = previewText(value);
    assert.ok(count(preview) <= UI_TEXT_LIMIT);
    assert.ok(preview.endsWith('…'));
    assert.ok(value.startsWith(preview.slice(0, -1)));
  }
  assert.equal(job, before);
});
test('short text stays readable and whitespace does not spend the preview budget', () => {
  assert.equal(previewText('CV.pdf'), 'CV.pdf');
  assert.equal(previewText('  Sam\n Lee  '), 'Sam Lee');
  assert.equal(previewText(null), '');
  assert.equal(previewText('x'.repeat(UI_TEXT_LIMIT)), 'x'.repeat(UI_TEXT_LIMIT));
});
test('limits preserve complete emoji and combining characters', () => {
  const emoji = '👨‍👩‍👧‍👦', accented = 'e\u0301';
  assert.equal(previewText(emoji.repeat(70)), emoji.repeat(63) + '…');
  assert.equal(previewText(accented.repeat(70)), accented.repeat(63) + '…');
  assert.equal(count(previewText(job, 20)), 20);
});
test('invalid limits cannot silently hide all text', () => {
  for (const limit of [0, -1, NaN, 1.5]) assert.throws(() => previewText(job, limit), RangeError);
  assert.equal(previewText(job, 1), '…');
});
test('CV previews keep distinct endings, the shared limit and whole characters', () => {
  assert.equal(previewCvName('Master CV'), 'Master CV');
  for (const value of [job, '👨‍👩‍👧‍👦'.repeat(70), 'e\u0301'.repeat(70)]) {
    const preview = previewCvName(value);
    assert.ok(count(preview) <= UI_TEXT_LIMIT);
    const [start, end] = preview.split('…');
    assert.ok(value.startsWith(start) && value.endsWith(end));
    assert.ok(start && end);
  }
  assert.notEqual(previewCvName(job + ' Backend.pdf'), previewCvName(job + ' Frontend.pdf'));
});
