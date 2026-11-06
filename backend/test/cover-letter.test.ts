import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  coverLetterFileName,
  coverLetterHtml,
  paragraphsOf,
  tidyLetter,
} from '../src/modules/resumes/domain/cover-letter';

test('the file name carries the person and the company', () => {
  assert.equal(
    coverLetterFileName({ firstName: 'Sergey', lastName: 'Proniuk' }, 'Pay & Co.'),
    'Sergey_Proniuk_Cover_Letter_Pay_Co.pdf',
  );
  assert.equal(coverLetterFileName(null, null), 'Cover_Letter.pdf');
  assert.equal(
    coverLetterFileName({ firstName: 'Zoë', lastName: '' }, 'Ünïcode GmbH'),
    'Zoe_Cover_Letter_Unicode_GmbH.pdf',
  );
});

test('a letter keeps its paragraphs and loses dashes used as punctuation and markdown', () => {
  assert.deepEqual(paragraphsOf('Dear team,\n\n\n  First   line.\n\nSincerely,\nSam  '), [
    'Dear team,',
    'First line.',
    'Sincerely,\nSam',
  ]);
  assert.equal(
    tidyLetter(
      'The areas this posting cares about most - payments and **PCI DSS** - are mine.\n\nWaivio — a platform. From 2019 - 2021 on 3-D Secure.',
    ),
    'The areas this posting cares about most, payments and PCI DSS, are mine.\n\nWaivio, a platform. From 2019 - 2021 on 3-D Secure.',
  );
});

test('the PDF page is laid out like the candidate letters: name, one contact line, paragraphs', () => {
  const html = coverLetterHtml('Dear Hiring Manager,\n\nI built <APIs> & more.\n\nSincerely,\nSam Lee', {
    firstName: 'Sam',
    lastName: 'Lee',
    phone: '+1 672',
    email: 'sam@example.com',
    location: 'Vancouver',
    linkedin: 'linkedin.com/in/sam',
  });
  assert.match(html, /@page \{ size: Letter;/);
  assert.match(
    html,
    /<h1>Sam Lee<\/h1><p class="contact">\+1 672<span class="sep"> \| <\/span>sam@example\.com<span class="sep"> \| <\/span>linkedin\.com\/in\/sam<\/p>/,
  );
  assert.doesNotMatch(html, /Vancouver/, 'the header has no location, as in the candidate letters');
  assert.match(html, /<p>I built &lt;APIs&gt; &amp; more\.<\/p>/);
  assert.match(html, /<p>Sincerely,<br>Sam Lee<\/p>/);
});
