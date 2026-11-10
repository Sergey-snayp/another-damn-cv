import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ACHIEVEMENT_WORDS,
  casedAs,
  mentions,
  toolsToCover,
  wordCount,
  checkProposal,
  numbersIn,
  unknownNames,
  type AchievementSource,
} from '../src/modules/profiles/domain/achievements';
import { DeepenAchievement } from '../src/modules/profiles/application/use-cases/deepen-achievement';
import { SplitAchievement } from '../src/modules/profiles/application/use-cases/split-achievement';
import { AssistAchievement } from '../src/modules/profiles/application/use-cases/assist-achievement';
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
    split: () => Promise.reject(new Error('not used')),
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
    { text: input.text, more: [], asks: [], changed: false },
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

test('an achievement has a standard size: a longer one is split into parts that each fit, with only its facts', async () => {
  const long =
    'Built a TLS certificate service from scratch as its principal author (144 of 188 commits), still in production. ' +
    'Used ACME issuance on Step Functions with Route53 DNS challenges and a daily sweep over a DynamoDB expiry index, so renewals run as a range query instead of a table scan. ' +
    'Covered it with a Jest suite that blocks release on failure, and led a 3-person team.';
  assert.ok(wordCount(long) > ACHIEVEMENT_WORDS);
  const parts = [
    'Built a TLS certificate service from scratch as its principal author (144 of 188 commits), still in production.',
    'Designed renewals for the TLS certificate service as a daily sweep over a DynamoDB expiry index, so they run as a range query instead of a table scan.',
    'Covered the TLS certificate service with a Jest suite that blocks release on failure, and led a 3-person team.',
  ];
  const splitter = (answer: string[]) => ({ split: () => Promise.resolve(answer) });
  const job = { ...source, title: 'Senior Software Engineer', company: 'Ciklum' };
  assert.deepEqual(
    (await new SplitAchievement(splitter(parts)).execute({ source: job, text: long })).parts,
    parts,
  );
  const short = 'Set up Slack alerts for production.';
  assert.deepEqual(
    (await new SplitAchievement(splitter(parts)).execute({ source: job, text: short })).parts,
    [short],
    'a line that fits is left alone',
  );
  const invented = [parts[0], 'Cut renewal time by 90% with Terraform.'];
  assert.deepEqual(
    (await new SplitAchievement(splitter(invented)).execute({ source: job, text: long })).parts,
    [long],
    'a part with a number or a name the line does not have: the line stays as it was',
  );
  assert.deepEqual(
    (
      await new SplitAchievement({ split: () => Promise.reject(new Error('down')) }).execute({
        source: job,
        text: long,
      })
    ).parts,
    [long],
  );

  // "Turn into bullets": a line over the size comes back as parts, its questions on the first.
  const notes = { ...job, notes: long, bullets: [] };
  const proposal = await new DraftAchievements({
    draft: () =>
      Promise.resolve({
        achievements: [{ text: long, asks: ['Is it still in use?'] }],
        techStack: [],
        description: '',
      }),
    split: () => Promise.resolve(parts),
    cover: () => Promise.resolve({ achievements: [], unplaced: [] }),
  }).execute(notes);
  assert.deepEqual(
    proposal.achievements.map((item) => item.text),
    parts,
  );
  assert.deepEqual(
    proposal.achievements.map((item) => item.asks),
    [['Is it still in use?'], [], []],
  );

  // "Rewrite with my answers" that grows past the size: the rest comes back as more lines.
  const deepened = await new DeepenAchievement({
    deepen: () => Promise.resolve({ text: long, asks: [] }),
    split: () => Promise.resolve(parts),
  }).execute({ source: notes, text: parts[0], answers: [{ question: 'More?', answer: long }] });
  assert.equal(deepened.text, parts[0]);
  assert.deepEqual(deepened.more, parts.slice(1));
});

test('every technology of a job ends up in some achievement, or is named as not placed', async () => {
  assert.ok(mentions('Orchestrated issuance with Step Functions.', 'AWS Step Functions'));
  assert.ok(mentions('Built services in Node.js.', 'Node.js'));
  assert.ok(!mentions('Built services in Node.js.', 'Nest'));
  const job: AchievementSource = {
    title: 'Senior Software Engineer',
    company: 'Ciklum',
    client: '',
    description: 'Card payments platform on AWS Lambda.',
    bullets: ['Built REST APIs in Node.js for card tokenization.'],
    techStack: 'Node.js, Kafka, Redis',
    notes: 'kafka carried the order events between services. also used lambda for webhooks.',
  };
  assert.deepEqual(toolsToCover(job, ['Kafka', 'AWS Lambda', 'Terraform']), [
    'Node.js',
    'Kafka',
    'Redis',
    'AWS Lambda',
  ]);
  const asked: { missing: string[]; written: string[] }[] = [];
  const proposal = await new DraftAchievements({
    draft: () =>
      Promise.resolve({
        achievements: [{ text: 'Handled webhooks for card payments.', asks: ['Is it still in use?'] }],
        techStack: ['Kafka'],
        technologies: ['Kafka', 'AWS Lambda'],
        description: '',
      }),
    cover: (input) => {
      asked.push(input);
      return Promise.resolve({
        achievements: [
          {
            text: 'Handled webhooks for card payments on AWS Lambda.',
            replaces: 'Handled webhooks for card payments.',
          },
          { text: 'Carried order events between services with Kafka.', replaces: '' },
        ],
        unplaced: ['Redis'],
      });
    },
    split: () => Promise.reject(new Error('not used')),
  }).execute(job);
  assert.deepEqual(
    asked[0].missing,
    ['Kafka', 'Redis', 'AWS Lambda'],
    'Node.js is already in a current bullet',
  );
  assert.deepEqual(
    proposal.achievements.map((item) => [item.text, item.asks]),
    [
      ['Handled webhooks for card payments on AWS Lambda.', ['Is it still in use?']],
      ['Carried order events between services with Kafka.', []],
    ],
    'a fuller line takes its place and keeps its questions; a new one is added',
  );
  assert.deepEqual(proposal.uncovered, ['Redis'], 'the notes never say what Redis did');
});

test('tool names: an apostrophe is not a new name, and new tools take the casing the lines use', () => {
  assert.ok(mentions("Issued certificates with Let's Encrypt.", 'lets encrypt'));
  assert.deepEqual(
    unknownNames("Issued certificates with Let's Encrypt.", 'used lets encrypt for certs'),
    [],
  );
  const lines = [
    'Ran a daily EventBridge sweep.',
    "Issued certificates with Let's Encrypt and DNS-01 challenges.",
  ];
  assert.equal(casedAs('eventbridge', lines), 'EventBridge');
  assert.equal(casedAs('lets encrypt', lines), "Let's Encrypt");
  assert.equal(casedAs('dns-01', lines), 'DNS-01');
  assert.equal(casedAs('Kafka', lines), 'Kafka', 'not in any line: as given');
});

test('formatting marks are not facts: a link address or a mark is never a name or a number', () => {
  const line = 'Built **REST** [APIs](https://acme.dev/v2/2024) for *card* ++payments++.';
  assert.deepEqual(unknownNames(line, 'built rest apis for card payments'), []);
  assert.deepEqual([...numbersIn(line)], []);
});

test('Improve with AI and Write with AI: 3 versions, each checked against the facts', async () => {
  const source: AchievementSource = {
    title: 'Senior Software Engineer',
    company: 'Ciklum',
    client: 'Verifone',
    description: 'Card payments platform.',
    bullets: [],
    techStack: 'Node.js, Kafka',
    notes: '',
  };
  const bullet = 'Built REST APIs for card tokenization handling ~20,000 transactions a day.';
  const seen: unknown[] = [];
  const assistant = (options: { angle: string; text: string }[]) =>
    new AssistAchievement({
      assist: (input) => {
        seen.push(input);
        return Promise.resolve(options);
      },
    });
  const result = await assistant([
    {
      angle: 'Result first',
      text: 'Processed ~20,000 card transactions a day through REST APIs for card tokenization.',
    },
    {
      angle: 'Technical',
      text: 'Built Node.js REST APIs for card tokenization, handling ~20,000 transactions a day.',
    },
    { angle: 'Concise', text: 'Cut fraud by 40% with Kafka and Redis.' },
    { angle: 'Same', text: bullet },
  ]).execute({ source, mode: 'improve', text: `**${bullet}**`, keywords: ['Node.js'], instruction: '' });
  assert.deepEqual(
    result.options.map((option) => option.angle),
    ['Technical', 'Result first'],
    'a version with a number or a name nobody wrote is dropped, and so is the bullet unchanged; the one using the keyword comes first',
  );
  assert.equal((seen[0] as { text: string }).text, bullet, 'the AI reads the words, without marks');
  await assert.rejects(
    assistant([{ angle: 'Concise', text: 'Cut fraud by 40% with Redis.' }]).execute({
      source,
      mode: 'improve',
      text: bullet,
      keywords: [],
      instruction: '',
    }),
    /without adding facts/,
  );
  const written = await assistant([
    { angle: 'Concise', text: 'Built card payment services in Node.js for Verifone.' },
  ]).execute({
    source,
    mode: 'write',
    text: 'card payment services',
    keywords: ['Node.js'],
    instruction: '',
  });
  assert.equal(written.options.length, 1, 'a keyword the person chose is a fact it may use');
});

test('AI bullets: placeholders instead of made-up numbers, no unclaimed leading, Coach Me answers are facts, keywords first', async () => {
  const source: AchievementSource = {
    title: 'Senior Software Engineer',
    company: 'Ciklum',
    client: '',
    description: 'Card payments platform on AWS Lambda.',
    bullets: [],
    techStack: '',
    notes: '',
  };
  const assistant = (options: { angle: string; text: string }[]) =>
    new AssistAchievement({ assist: () => Promise.resolve(options) });
  const result = await assistant([
    {
      angle: 'Result first',
      text: 'Cut incident response time by [X]% over [N] months on the card payments platform.',
    },
    {
      angle: 'Technical',
      text: 'Led production support for AWS Lambda services on the card payments platform.',
    },
    {
      angle: 'Concise',
      text: 'Provided production support for AWS Lambda services on the payments platform.',
    },
  ]).execute({
    source,
    mode: 'write',
    text: 'production support',
    keywords: ['AWS Lambda', 'Production Support'],
    instruction: '',
  });
  assert.deepEqual(
    result.options.map((option) => option.angle),
    ['Concise', 'Result first'],
    '"Led" is dropped when nothing says so; the version with both keywords comes first',
  );
  assert.deepEqual(result.options[0].keywords, ['AWS Lambda', 'Production Support']);
  assert.deepEqual(result.options[1].placeholders, ['[X]', '[N]']);

  const coached = await assistant([
    {
      angle: 'Result first',
      text: 'Cut card payment incidents by 30% in 3 months with live production support on the payments platform.',
    },
  ]).execute({
    source,
    mode: 'write',
    text: '',
    keywords: [],
    instruction: '',
    coach: {
      task: 'Live production support',
      impacts: ['Fewer incidents'],
      amount: '30%',
      period: '3 months',
    },
  });
  assert.equal(coached.options.length, 1, 'numbers the person gave in Coach Me may be used');
});
