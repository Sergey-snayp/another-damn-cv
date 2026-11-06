import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cvFacts, experienceSpan, withoutEmDashes } from '../src/modules/resumes/domain/cv-writing-guide';
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
  assert.equal(withoutEmDashes('Waivio — a social platform on Hive.'), 'Waivio, a social platform on Hive.');
  assert.equal(withoutEmDashes('Built APIs—fast.'), 'Built APIs, fast.');
  assert.equal(withoutEmDashes('Payments – card and bank.'), 'Payments, card and bank.');
  assert.equal(withoutEmDashes('Led it 2019–2021 — then left.'), 'Led it 2019–2021, then left.');
  assert.equal(withoutEmDashes('Shipped it —.'), 'Shipped it.');
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
