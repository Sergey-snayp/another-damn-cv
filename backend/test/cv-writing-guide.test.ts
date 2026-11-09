import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cvFacts,
  experienceSpan,
  withoutDashPunctuation,
} from '../src/modules/resumes/domain/cv-writing-guide';
import type { RenderedResume } from '../src/modules/resumes/domain/resume';

const resume = (froms: string[]) =>
  ({
    contact: null,
    summaries: {},
    experiences: froms.map((from, index) => ({
      title: `Role ${index}`,
      company: 'Acme',
      from,
      achievements: [],
    })),
    educations: [],
    skills: [],
  }) as unknown as RenderedResume;

test('em dashes become commas; a dash between numbers stays', () => {
  assert.equal(
    withoutDashPunctuation('Waivio — a social platform on Hive.'),
    'Waivio, a social platform on Hive.',
  );
  assert.equal(withoutDashPunctuation('Built APIs—fast.'), 'Built APIs, fast.');
  assert.equal(withoutDashPunctuation('Payments – card and bank.'), 'Payments, card and bank.');
  assert.equal(withoutDashPunctuation('Led it 2019–2021 — then left.'), 'Led it 2019–2021, then left.');
  assert.equal(withoutDashPunctuation('Shipped it —.'), 'Shipped it.');
});

test('dash punctuation is removed without damaging names, ranges, URLs, code or paragraph breaks', () => {
  const cases = [
    ['Built APIs - serving customers - with Node.js.', 'Built APIs, serving customers, with Node.js.'],
    ['Built APIs -- serving customers.', 'Built APIs, serving customers.'],
    ['Run node --version or use -v.', 'Run node --version or use -v.'],
    ['Dear Hiring Manager,\n\nSincerely,\nSam Lee', 'Dear Hiring Manager,\n\nSincerely,\nSam Lee'],
    ['Built APIs–serving customers.', 'Built APIs, serving customers.'],
    ['Supported 200 - payment requests.', 'Supported 200, payment requests.'],
    [
      'Worked in 2019 - 2021 and handled 15k - 20k requests.',
      'Worked in 2019 - 2021 and handled 15k - 20k requests.',
    ],
    ['From 2019—2021.', 'From 2019-2021.'],
    ['Oct 2019 - Nov 2021; 2022–present.', 'Oct 2019 - Nov 2021; 2022–present.'],
    [
      'Built Node-RED and react-native-web integrations for 3-D Secure.',
      'Built Node-RED and react-native-web integrations for 3-D Secure.',
    ],
    ['Use `a - b` — see https://example.com/a--b.', 'Use `a - b`, see https://example.com/a--b.'],
    ['Built APIs — fast.\n\nMaintained UI - accessible.', 'Built APIs, fast.\n\nMaintained UI, accessible.'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(withoutDashPunctuation(input), expected);
    assert.equal(withoutDashPunctuation(expected), expected, 'normalizing twice is stable');
  }
});

test('years of experience come from the earliest job on the CV', () => {
  const now = new Date('2026-11-05');
  assert.equal(
    experienceSpan(resume(['2023-10', 'Aug 2019', '2021']), now),
    'Professional experience since 2019 (about 7 years).',
  );
  assert.equal(experienceSpan(resume(['soon']), now), null);
  assert.match(cvFacts(resume(['2024-01'])), /^Professional experience since 2024/);
});
