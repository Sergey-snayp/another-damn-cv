import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ResumeAssistant } from '../src/modules/resumes/application/use-cases/resume-assistant';
import { rewriteProblems } from '../src/modules/resumes/domain/tailoring/rewrite-guard';

test('a rewrite may not change what a line says', () => {
  const cases: [string, string, string[]][] = [
    [
      'Built the integration, adding 4,000+ transactions a day, secured with JWE encryption.',
      'Built the integration, scaling to 4,000+ transactions a day, secured with authentication methods.',
      ['scaling', 'authentication', 'methods'],
    ],
    [
      'White-label ad exchange running real-time OpenRTB auctions.',
      'White-label ad exchange handling transaction processing: real-time OpenRTB auctions.',
      ['handling', 'transaction', 'processing'],
    ],
    [
      'Serverless microservices for a global insurer.',
      "Serverless microservices for a global insurer's money movement workflows.",
      ['money', 'movement', 'workflows'],
    ],
  ];
  for (const [source, rewrite, added] of cases) assert.deepEqual(rewriteProblems(rewrite, source), added);
});

test('reordering, plain verbs and a posting word the line shows are fine', () => {
  assert.deepEqual(
    rewriteProblems(
      'For payment services, modeled PostgreSQL tables.',
      'Modelled tables in PostgreSQL for payment services.',
    ),
    [],
  );
  assert.deepEqual(rewriteProblems('Developed payment APIs.', 'Built payment APIs.'), []);
  assert.deepEqual(
    rewriteProblems('Led payment APIs.', 'Built payment APIs.'),
    ['led'],
    'but not a bigger role',
  );
  assert.deepEqual(
    rewriteProblems('Added observability with CloudWatch alarms.', 'Added CloudWatch alarms.', {
      allowed: ['observability'],
    }),
    [],
  );
});

test('a number the line has must stay, unless the person asked for a change', () => {
  const source = 'Built a backend with a 135-model schema and 200 migrations.';
  assert.deepEqual(rewriteProblems('Built a backend with migrations.', source, { keepNumbers: true }), [
    '135',
    '200',
  ]);
  assert.deepEqual(rewriteProblems('Built a backend with migrations.', source), []);
});

function assistant(replies: { suggestion: string; cannotDo: string[] }[]) {
  const asked: string[] = [];
  const service = new ResumeAssistant(
    { assertOwned: () => Promise.resolve(), current: () => Promise.reject(new Error('unused')) },
    { getForTailoring: () => Promise.reject(new Error('unused')) },
    { aiSettings: () => Promise.resolve({}), setAiSettings: () => Promise.resolve() },
    { answer: () => Promise.reject(new Error('unused')) },
    {
      rewrite: (input) => {
        asked.push(input.instruction);
        const reply = replies[Math.min(asked.length - 1, replies.length - 1)];
        return Promise.resolve({ original: input.text, ...reply });
      },
    },
  );
  return { service, asked };
}
const job = { description: 'A pre-sales role for a payments platform.' };
const text = 'Built ad auctions on Node.js.';

test('a line that gains a false claim is written once more, then kept as it is, without a note', async () => {
  const wrong = {
    suggestion: 'Built payment processing on Node.js.',
    cannotDo: ['You are not a pre-sales person.'],
  };
  const { service, asked } = assistant([wrong]);
  const result = await service.tailorLine('u', 'cv', { text, kind: 'bullet', job });
  assert.equal(result.suggestion, text);
  assert.deepEqual(result.cannotDo, []);
  assert.equal(asked.length, 2);
  assert.match(asked[1], /does not support: payment, processing/);
});

test('the second try is used when it is honest', async () => {
  const { service } = assistant([
    { suggestion: 'Built payment processing on Node.js.', cannotDo: [] },
    { suggestion: 'On Node.js, built ad auctions.', cannotDo: [] },
  ]);
  const result = await service.tailorLine('u', 'cv', { text, kind: 'bullet', job });
  assert.equal(result.suggestion, 'On Node.js, built ad auctions.');
});

test('a typed request gets its answer, in plain words', async () => {
  const { service } = assistant([{ suggestion: text, cannotDo: ['The <cv_facts> show no metric.'] }]);
  const result = await service.tailorLine('u', 'cv', {
    text,
    kind: 'bullet',
    job,
    instruction: 'Add a metric',
  });
  assert.deepEqual(result.cannotDo, ["this job's lines show no metric."]);
});
