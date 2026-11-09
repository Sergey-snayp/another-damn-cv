import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkProposal,
  numbersIn,
  type AchievementSource,
} from '../src/modules/profiles/domain/achievements';
import { DraftAchievements } from '../src/modules/profiles/application/use-cases/draft-achievements';
import {
  ClaudeAchievementWriter,
  achievementPrompt,
} from '../src/modules/profiles/adapters/outbound/ai/claude-achievement.writer';
import { mergeCareer, type CareerExperience } from '../src/modules/profiles/domain/career-profile';
import { achievementDraftSchema, careerUpdateSchema } from '../src/modules/profiles/adapters/career.schemas';

const source: AchievementSource = {
  title: 'Senior Software Engineer',
  company: 'Ciklum',
  client: 'Verifone',
  description: '',
  bullets: ['Developed Node.js microservices and REST APIs for card tokenization.'],
  techStack: 'Node.js, TypeScript',
  notes:
    'built the TLS cert service from scratch with ACME, Route53 and Step Functions. ~20k transactions a day. slack alerts for prod. mentored 2 juniors.',
};

test('numbers are compared by value: 20k and 20,000 are the same', () => {
  assert.deepEqual([...numbersIn('~20k a day, 1.5M users, 3 services')], [20_000, 1_500_000, 3]);
  assert.deepEqual([...numbersIn('about 20,000 transactions')], [20_000]);
  assert.deepEqual([...numbersIn('Route53, EC2 and S3')], [], 'digits in a name are not numbers');
  assert.ok(numbersIn('~15-20k a day').has(15_000), 'a range takes its scale: 15-20k is 15,000 to 20,000');
});

test('a proposal keeps only what the notes support', () => {
  const proposal = checkProposal(
    {
      achievements: [
        {
          text: '- Built an automated TLS certificate service — ACME, Route53, Step Functions.',
          ask: 'How long did renewals take before?',
        },
        { text: 'Ran payment APIs handling ~20,000 transactions a day.', ask: 'How many?' },
        { text: 'Cut incident response time by 40% with Slack alerts.', ask: null },
        { text: 'Developed Node.js microservices and REST APIs for card tokenization.', ask: null },
        { text: 'Built an automated TLS certificate service with ACME, Route53, Step Functions.', ask: null },
        { text: 'Mentored 2 junior engineers.', ask: null },
      ],
      techStack: ['ACME', 'Route53', 'Step Functions', 'Node.js', 'Kubernetes'],
      description: 'Payment platform for Verifone.',
    },
    source,
  );
  assert.deepEqual(
    proposal.achievements.map((item) => item.text),
    [
      'Built an automated TLS certificate service, ACME, Route53, Step Functions.',
      'Ran payment APIs handling ~20,000 transactions a day.',
      'Developed Node.js microservices and REST APIs for card tokenization.',
      'Mentored 2 junior engineers.',
    ],
    'no em dashes or leading markers; the same line once',
  );
  assert.equal(proposal.dropped, 1, '"40%" is not in the notes, so that line is left out');
  assert.equal(proposal.achievements[0].ask, 'How long did renewals take before?');
  assert.equal(proposal.achievements[1].ask, null, 'a line with its number needs no question');
  assert.equal(
    proposal.achievements[2].duplicateOf,
    source.bullets[0],
    'a repeat of an existing bullet is marked',
  );
  assert.deepEqual(
    proposal.techStack,
    ['ACME', 'Route53', 'Step Functions'],
    'only tools the notes name, not already listed',
  );
  assert.deepEqual(
    checkProposal(
      { achievements: [], techStack: ['AWS Step Functions', 'Kafka'], description: '' },
      { ...source, notes: 'step functions on aws' },
    ).techStack,
    ['AWS Step Functions'],
    'a tool counts as named when every word of it is in the notes',
  );
  assert.equal(proposal.description, 'Payment platform for Verifone.');
  assert.equal(
    checkProposal(
      { achievements: [], techStack: [], description: 'X.' },
      { ...source, description: 'Has one.' },
    ).description,
    '',
    'a description is offered only when the job has none',
  );
});

test('Turn into bullets asks the AI with the job and notes, and reads its JSON', async () => {
  const prompts: string[] = [];
  const runner = {
    complete: (prompt: string) => {
      prompts.push(prompt);
      return Promise.resolve(
        'Here you go:\n```json\n{"achievements":[{"text":"Mentored 2 junior engineers on code review.","ask":null}],"techStack":["Route53"],"description":""}\n```',
      );
    },
  };
  const proposal = await new DraftAchievements(new ClaudeAchievementWriter(runner)).execute(source);
  assert.deepEqual(proposal.achievements, [
    { text: 'Mentored 2 junior engineers on code review.', ask: null, duplicateOf: null },
  ]);
  assert.deepEqual(proposal.techStack, ['Route53']);
  assert.match(prompts[0], /<notes>\nbuilt the TLS cert service/);
  assert.match(achievementPrompt(source), /<current_bullets>\n- Developed Node\.js/);
  await assert.rejects(
    new DraftAchievements(
      new ClaudeAchievementWriter({ complete: () => Promise.resolve('no idea') }),
    ).execute(source),
    /did not return achievements/,
  );
});

test('notes are saved with a job, and a CV import keeps them on the same job', () => {
  const role: CareerExperience = {
    company: 'Ciklum',
    title: 'Senior Software Engineer',
    client: '',
    location: '',
    from: '2024-10',
    to: '',
    current: true,
    description: '',
    bullets: [],
  };
  const saved = careerUpdateSchema.parse({
    expectedRevision: 1,
    sections: {
      experiences: [{ ...role, notes: [{ text: '  built the cert service ', at: '2026-11-08T10:00:00Z' }] }],
    },
  });
  assert.equal(saved.sections.experiences?.[0]?.notes?.[0]?.text, 'built the cert service');
  const before = {
    revision: 3,
    data: {
      experiences: {
        value: [{ ...role, notes: [{ text: 'my words', at: '2026-11-08' }] }],
        source: { kind: 'profile' as const },
        importedAt: '2026-11-08',
      },
    },
  };
  const after = mergeCareer(
    before,
    {
      expectedRevision: 3,
      contact: {},
      expectedContact: {},
      sections: {
        experiences: [
          { ...role, title: 'senior software engineer', bullets: ['From the CV.'] },
          { ...role, company: 'EPAM' },
        ],
      },
      source: { kind: 'file', name: 'cv.pdf' },
    },
    '2026-11-09',
  );
  assert.deepEqual(after.data.experiences?.value[0]?.notes, [{ text: 'my words', at: '2026-11-08' }]);
  assert.equal(after.data.experiences?.value[1]?.notes, undefined);
  assert.throws(
    () => achievementDraftSchema.parse({ title: 'X', company: 'Y', notes: '   ' }),
    /Write a few words/,
  );
});
