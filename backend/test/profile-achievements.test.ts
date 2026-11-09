import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkProposal,
  numbersIn,
  unknownNames,
  type AchievementSource,
} from '../src/modules/profiles/domain/achievements';
import { DeepenAchievement } from '../src/modules/profiles/application/use-cases/deepen-achievement';
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
          text: '- Built an automated TLS certificate service, ACME, Route53, Step Functions.',
          asks: ['How long did renewals take before?', '  ', 'Is it still in use?', 'A third question.'],
        },
        { text: 'Ran payment APIs handling ~20,000 transactions a day.', asks: [] },
        { text: 'Cut incident response time by 40% with Slack alerts.', asks: [] },
        { text: 'Developed Node.js microservices and REST APIs for card tokenization.', asks: [] },
        { text: 'Built an automated TLS certificate service with ACME, Route53, Step Functions.', asks: [] },
        { text: 'Integrated Intercard, a card processor, for authorizations.', asks: [] },
        { text: 'Mentored 2 junior engineers.', asks: [] },
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
    'no leading marker; the same line once',
  );
  assert.equal(
    proposal.dropped,
    2,
    '"40%" and "Intercard" are not in the notes, so those lines are left out',
  );
  assert.deepEqual(
    proposal.achievements[0].asks,
    ['How long did renewals take before?', 'Is it still in use?'],
    'at most 2 questions',
  );
  assert.deepEqual(proposal.achievements[1].asks, []);
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
        'Here you go:\n```json\n{"achievements":[{"text":"Mentored 2 junior engineers on code review.","asks":[]}],"techStack":["Route53"],"description":""}\n```',
      );
    },
  };
  const proposal = await new DraftAchievements(new ClaudeAchievementWriter(runner)).execute(source);
  assert.deepEqual(proposal.achievements, [
    { text: 'Mentored 2 junior engineers on code review.', asks: [], duplicateOf: null },
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

test('clearing Profile notes is explicit and a later CV import does not restore them', () => {
  const job: CareerExperience = {
    company: 'Ciklum',
    title: 'Engineer',
    client: 'SymphonyAI',
    location: '',
    from: '2023-11',
    to: '',
    current: true,
    description: '',
    bullets: ['Built mobile screens.'],
    notes: [{ text: 'Saved mobile notes.', at: '2026-11-01' }],
  };
  const before = {
    revision: 1,
    data: { experiences: { value: [job], source: { kind: 'profile' as const }, importedAt: '2026-11-01' } },
  };
  const cleared = mergeCareer(
    before,
    {
      expectedRevision: 1,
      contact: {},
      expectedContact: {},
      source: { kind: 'profile' },
      sections: { experiences: [{ ...job, notes: [] }] },
    },
    '2026-11-09',
  );
  assert.deepEqual(cleared.data.experiences!.value[0].notes, []);
  assert.deepEqual(before.data.experiences.value[0].notes, job.notes, 'the previous revision stays intact');
  const imported = mergeCareer(
    cleared,
    {
      expectedRevision: 2,
      contact: {},
      expectedContact: {},
      source: { kind: 'file', name: 'cv.txt' },
      sections: { experiences: [{ ...job, notes: undefined }] },
    },
    '2026-11-10',
  );
  assert.deepEqual(imported.data.experiences!.value[0].notes ?? [], []);
  assert.deepEqual(imported.data.experiences!.value[0].bullets, job.bullets);
});

test('stars and deleted achievements are saved with a job and survive a CV re-import', () => {
  const role: CareerExperience = {
    company: 'Ciklum',
    title: 'Engineer',
    client: '',
    location: '',
    from: '2024',
    to: '',
    current: true,
    description: '',
    bullets: ['Kept line.', 'Gone line.'],
    starred: ['Kept line.', 'Gone line.'],
    removed: [{ text: 'Deleted by hand.', at: '2026-11-08' }],
  };
  const saved = careerUpdateSchema.parse({ expectedRevision: 1, sections: { experiences: [role] } });
  assert.deepEqual(saved.sections.experiences?.[0]?.starred, ['Kept line.', 'Gone line.']);
  const after = mergeCareer(
    {
      revision: 1,
      data: { experiences: { value: [role], source: { kind: 'profile' as const }, importedAt: 'x' } },
    },
    {
      expectedRevision: 1,
      contact: {},
      expectedContact: {},
      sections: {
        experiences: [
          { ...role, bullets: ['Kept line.', 'New from CV.'], starred: undefined, removed: undefined },
        ],
      },
      source: { kind: 'file', name: 'cv.pdf' },
    },
    'y',
  ).data.experiences?.value[0];
  assert.deepEqual(after?.starred, ['Kept line.'], 'a star stays on an achievement the job still has');
  assert.deepEqual(after?.removed, role.removed, 'deleted achievements stay restorable');
});

test('a name the person never wrote cannot pass: from an example, or guessed', () => {
  const facts = 'built the TLS cert service with ACME and route53. Ran it on AWS Lambda.';
  assert.deepEqual(
    unknownNames('Built a TLS certificate service with ACME and Route53 on AWS Lambda.', facts),
    [],
  );
  assert.deepEqual(
    unknownNames('Cut late deliveries by re-sequencing routes across 3 depots in Kubernetes.', facts),
    ['Kubernetes'],
  );
  assert.deepEqual(
    unknownNames('Integrated Intercard. Built the API.', facts),
    ['Intercard'],
    'a sentence start is not a name',
  );
  assert.deepEqual(
    unknownNames(' Used ACME on AWS Lambda.', facts),
    [],
    'nor is the first word after a space',
  );
});

test('rewrite with my answers: fuller when the answers give facts, unchanged when it would invent', async () => {
  const input = {
    source,
    text: 'Set up Slack alerts for production.',
    answers: [{ question: 'What was it like before?', answer: 'customers told us about outages first' }],
  };
  const writer = (text: string) => ({
    draft: () => Promise.reject(new Error('not used')),
    deepen: () => Promise.resolve({ text, asks: ['Is it still in use?', 'Extra?'] }),
  });
  const fuller = await new DeepenAchievement(
    writer('Set up Slack alerts for production — the team learned about outages before customers told them.'),
  ).execute(input);
  assert.equal(fuller.changed, true);
  assert.match(fuller.text, /before customers told them/);
  assert.deepEqual(fuller.asks, ['Is it still in use?']);
  const invented = await new DeepenAchievement(
    writer('Set up Slack and PagerDuty alerts, cutting outages by 50%.'),
  ).execute(input);
  assert.deepEqual(
    invented,
    { text: input.text, asks: [], changed: false },
    'PagerDuty and 50% are not in anything the person wrote',
  );
  const merged = await new DeepenAchievement(
    writer(
      'Set up Slack alerts for production, so outages no longer reached customers first. Also mentored 2 juniors.',
    ),
  ).execute(input);
  assert.equal(
    merged.text,
    'Set up Slack alerts for production, so outages no longer reached customers first.',
    'other work from the notes is not added to this line',
  );
  const nothing = await new DeepenAchievement(writer('x')).execute({
    ...input,
    answers: [{ question: 'Q', answer: '  ' }],
  });
  assert.equal(nothing.changed, false);
});
