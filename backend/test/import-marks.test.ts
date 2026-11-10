import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  htmlToMarks,
  markStyles,
} from '../src/modules/resumes/adapters/outbound/documents/document-text.extractor';
import { marksOnlyInText } from '../src/modules/resumes/domain/import-marks';

test('a PDF keeps its bold and italic: runs found in order are marked and joined', () => {
  const text = 'Ciklum | Senior Engineer Oct 2024 - Present\n• Built the TLS service from scratch.';
  const marked = markStyles(text, [
    { text: 'Ciklum', bold: true, italic: false },
    { text: '| Senior Engineer', bold: false, italic: false },
    { text: 'Oct 2024', bold: false, italic: true },
    { text: '- Present', bold: false, italic: true },
    { text: '• Built the', bold: false, italic: false },
    { text: 'TLS', bold: true, italic: false },
    { text: 'service', bold: true, italic: false },
    { text: 'from scratch.', bold: false, italic: false },
  ]);
  assert.equal(
    marked,
    '**Ciklum** | Senior Engineer *Oct 2024 - Present*\n• Built the **TLS service** from scratch.',
  );
  assert.equal(
    markStyles(text, [{ text: 'Ciklum', bold: false, italic: false }]),
    text,
    'no styles: the text as it was',
  );
  assert.equal(markStyles(text, [{ text: 'Not in it', bold: true, italic: false }]), text);
});

test('a Word file keeps bold, italic, underline, links and lists', () => {
  assert.equal(
    htmlToMarks(
      '<p><strong>Ciklum</strong> | <em>Remote</em></p><ul><li>Built <u>the</u> <a href="https://acme.dev">TLS service</a> &amp; APIs</li><li>Led 3 people</li></ul>',
    ),
    '**Ciklum** | *Remote*\n\n\n- Built ++the++ [TLS service](https://acme.dev) & APIs\n\n- Led 3 people\n',
  );
});

test('imported marks stay in the summary, descriptions and bullets; elsewhere the words, and links keep their address', () => {
  const profile = marksOnlyInText({
    fullName: '**Sam Lee**',
    linkedin: '[LinkedIn](https://linkedin.com/in/sam)',
    summary: 'Backend engineer with **7 years** in *payments*.',
    skills: ['**Node.js**'],
    skillGroups: [{ category: '**Core:**', skills: ['**TypeScript**'] }],
    experience: [
      {
        company: '**Ciklum**',
        title: 'Senior Engineer',
        from: '*2024-10*',
        description: '*Paymorrow / Verifone* platform',
        bullets: ['Built the **TLS service** with [ACME](https://letsencrypt.org).'],
      },
    ],
  });
  assert.equal(profile.fullName, 'Sam Lee');
  assert.equal(profile.linkedin, 'https://linkedin.com/in/sam');
  assert.equal(profile.summary, 'Backend engineer with **7 years** in *payments*.');
  assert.deepEqual(profile.skills, ['Node.js']);
  assert.deepEqual(profile.skillGroups, [{ category: 'Core', skills: ['TypeScript'] }]);
  assert.equal(profile.experience![0].company, 'Ciklum');
  assert.equal(profile.experience![0].from, '2024-10');
  assert.equal(profile.experience![0].description, '*Paymorrow / Verifone* platform');
  assert.deepEqual(profile.experience![0].bullets, [
    'Built the **TLS service** with [ACME](https://letsencrypt.org).',
  ]);
});
