import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numbersIn, techTerms, unsupportedClaims } from '../src/modules/resumes/domain/tailoring/claims';
import { blockedLines, applyRetry as retryPlan } from '../src/modules/resumes/domain/tailoring/retry';
import { planTailoring } from '../src/modules/resumes/domain/tailoring/policy';
import { tailorPrompt } from '../src/modules/resumes/adapters/outbound/ai/tailoring/prompt';
import { retryPrompt } from '../src/modules/resumes/adapters/outbound/ai/tailoring/retry-prompt';
import { readCandidate, readRetry } from '../src/modules/resumes/adapters/outbound/ai/tailoring/answer';
import type { PromptIds } from '../src/modules/resumes/adapters/outbound/ai/tailoring/prompt-ids';
import type { JobForTailoring, Tailoring } from '../src/modules/resumes/domain/tailoring/types';
import type { RenderedResume } from '../src/modules/resumes/contracts';
import { bullet, contact, role, skill } from './fixtures/resume';

function readTailoring(answer: string, resume: RenderedResume, job: JobForTailoring, ids: PromptIds) {
  const candidate = readCandidate(answer, ids);
  return candidate ? planTailoring(candidate, resume, job) : null;
}
function applyRetry(answer: string, tailoring: Tailoring, resume: RenderedResume, job: JobForTailoring) {
  return retryPlan(readRetry(answer), tailoring, resume, job);
}

const resume: RenderedResume = {
  snapshot: 4,
  contact: contact(),
  summaries: { default: 'Senior engineer with 7+ years in Node.js and AWS serverless.' },
  experiences: [
    role(
      'role-pay',
      { title: 'Senior Software Engineer', company: 'Ciklum', client: 'Paymorrow', from: '2024-10' },
      [
        bullet('a1', 'Built real-time Slack alerting on CloudWatch for gateway errors.'),
        bullet('a2', 'Led a TLS certificate service on AWS Lambda and Step Functions, deployed with CDK.', {
          result: 'About 75% of its commits are mine.',
        }),
        bullet('a3', 'Developed TypeScript REST APIs serving ~30,000 requests/day.'),
      ],
    ),
    role(
      'role-ad',
      { title: 'Senior Engineer', company: 'EPAM', client: 'ADBM', from: '2023-02', to: '2023-09' },
      [bullet('b1', 'Worked on a Node.js bidding engine with Kafka at 20k requests per second.')],
    ),
  ],
  educations: [],
  skills: [skill('sk-ts', 'TypeScript'), skill('sk-aws', 'AWS Lambda'), skill('sk-kafka', 'Apache Kafka')],
};

const job = {
  id: 'job-1',
  title: 'Delivery Consultant',
  company: 'AWS',
  description:
    'You will modernize legacy Java and .NET apps. Experience with Amazon Bedrock and EventBridge. Java is a plus.',
};

test('the guard passes a rewording that only uses known facts', () => {
  const source = 'Led a TLS certificate service on AWS Lambda and Step Functions, deployed with CDK.';
  assert.deepEqual(
    unsupportedClaims(
      'Designed and led a serverless TLS certificate service on AWS Lambda and Step Functions with CDK.',
      source,
    ),
    [
      // "serverless" is lowercase prose and passes; nothing else is new.
    ],
  );
});

test('the guard catches technologies and numbers the source does not have', () => {
  const source = 'Developed TypeScript REST APIs serving ~30,000 requests/day.';
  const problems = unsupportedClaims(
    'Developed TypeScript and Java REST APIs on EventBridge serving 50,000 requests/day.',
    source,
  );
  assert.deepEqual(problems, ['50000', 'Java', 'EventBridge']);
});

test('the guard treats 20k and 20,000 as the same number', () => {
  assert.deepEqual(numbersIn('20k requests and 20,000 more, ~75%, 3+ years'), ['20000', '20000', '75', '3']);
  assert.deepEqual(
    unsupportedClaims('Handled 20,000 requests per second.', 'at 20k requests per second'),
    [],
  );
});

test('the guard catches a posting term that opens a sentence', () => {
  const terms = techTerms(job.description);
  assert.ok(terms.has('bedrock'));
  assert.deepEqual(unsupportedClaims('Bedrock pipelines. Built alerting.', 'Built alerting.', terms), [
    'Bedrock',
  ]);
  // The same word in plain lowercase prose is not a claim.
  assert.deepEqual(
    unsupportedClaims('Built alerting on solid bedrock.', 'Built alerting on solid', terms),
    [],
  );
});

test('names with digits and punctuation are words, not numbers', () => {
  assert.deepEqual(
    unsupportedClaims('Stored files in S3 from Node.js.', 'Uploads to S3 from Node.js services.'),
    [],
  );
  assert.deepEqual(unsupportedClaims('Stored files in S3 and EC2.', 'Uploads to S3.'), ['EC2']);
});

function answer(body: unknown): string {
  return `Here you go:\n${JSON.stringify(body)}`;
}

test('readTailoring reorders, rewords, hides and blocks', () => {
  const { ids } = tailorPrompt(resume, job);
  const result = readTailoring(
    answer({
      summary: 'Senior engineer with 7+ years building AWS serverless systems in Node.js.',
      roles: [
        {
          id: 'r1',
          bullets: [
            {
              id: 'b2',
              text: 'Led an AWS serverless TLS certificate service on Lambda and Step Functions, deployed with CDK.',
              keep: true,
            },
            { id: 'b3', text: 'Developed Java REST APIs serving ~30,000 requests/day.', keep: true },
            {
              id: 'b1',
              text: 'Built real-time Slack alerting on CloudWatch for gateway errors.',
              keep: false,
              reason: 'Not about modernization.',
            },
          ],
        },
        // Kafka belongs to ADBM; answering it under r1 is ignored, the bullet stays.
        { id: 'r2', bullets: [] },
      ],
      skills: ['s2', 's1', 's2', 's99'],
      cannotClaim: ['Java', ' .NET ', ''],
    }),
    resume,
    job,
    ids,
  );

  assert.ok(result);
  assert.equal(result.basedOnSnapshot, 4);
  assert.equal(
    result.summary.after,
    'Senior engineer with 7+ years building AWS serverless systems in Node.js.',
  );
  assert.equal(result.summary.blocked, null);

  const pay = result.bullets.filter((b) => b.experienceLineageId === 'role-pay');
  assert.deepEqual(
    pay.map((b) => [b.lineageId, b.from, b.to]),
    [
      ['a2', 1, 0],
      ['a3', 2, 1],
      ['a1', 0, 2],
    ],
  );
  assert.match(pay[0].after, /^Led an AWS serverless/);
  assert.equal(pay[1].after, pay[1].before, 'the Java rewrite is thrown away');
  assert.match(pay[1].blocked ?? '', /Java/);
  assert.equal(pay[2].keep, false);
  assert.equal(pay[2].reason, 'Not about modernization.');

  const ad = result.bullets.filter((b) => b.experienceLineageId === 'role-ad');
  assert.deepEqual(
    ad.map((b) => [b.lineageId, b.keep, b.after === b.before]),
    [['b1', true, true]],
  );

  assert.deepEqual(result.skills, ['sk-aws', 'sk-ts', 'sk-kafka']);
  assert.deepEqual(result.cannotClaim, ['Java', '.NET']);
});

test('a bullet cannot borrow a fact from another role', () => {
  const { ids } = tailorPrompt(resume, job);
  const result = readTailoring(
    answer({
      roles: [
        {
          id: 'r1',
          bullets: [
            { id: 'b1', text: 'Built real-time Slack alerting on CloudWatch and Kafka for gateway errors.' },
          ],
        },
      ],
    }),
    resume,
    job,
    ids,
  )!;
  const alerting = result.bullets.find((b) => b.lineageId === 'a1')!;
  assert.equal(alerting.after, alerting.before);
  assert.match(alerting.blocked ?? '', /Kafka/);
});

test('a role is never left with every bullet hidden', () => {
  const { ids } = tailorPrompt(resume, job);
  const result = readTailoring(
    answer({
      roles: [{ id: 'r2', bullets: [{ id: 'b4', text: '', keep: false, reason: 'irrelevant' }] }],
    }),
    resume,
    job,
    ids,
  )!;
  const ad = result.bullets.find((b) => b.lineageId === 'b1')!;
  assert.equal(ad.keep, true);
  assert.equal(ad.after, ad.before);
});

test('an unreadable answer is null', () => {
  const { ids } = tailorPrompt(resume, job);
  assert.equal(readTailoring('Sorry, I cannot help with that.', resume, job, ids), null);
});

test('compounds need only their name parts known', () => {
  const source = 'Built AWS serverless services in Node.js.';
  assert.deepEqual(unsupportedClaims('Built AWS-based, cloud-native services.', source), []);
  assert.deepEqual(unsupportedClaims('Built GenAI-accelerated services.', source), ['GenAI-accelerated']);
  assert.deepEqual(unsupportedClaims('Built Vue.js services.', source), ['Vue.js']);
});

test('a rewrite that only changed quotes is no change', () => {
  const quoted: RenderedResume = structuredClone(resume);
  quoted.experiences[1].achievements[0].bullet = 'Worked on ADBM’s Node.js bidding engine.';
  const { ids } = tailorPrompt(quoted, job);
  const result = readTailoring(
    answer({
      roles: [{ id: 'r2', bullets: [{ id: 'b4', text: "Worked on ADBM's Node.js bidding engine." }] }],
    }),
    quoted,
    job,
    ids,
  )!;
  const b = result.bullets.find((x) => x.lineageId === 'b1')!;
  assert.equal(b.after, b.before);
});

test('plurals match: API is known when the role says APIs', () => {
  assert.deepEqual(unsupportedClaims('Built an API in TypeScript.', 'Developed TypeScript REST APIs.'), []);
});

test('a second try replaces a blocked line only if it passes the check', () => {
  const { ids } = tailorPrompt(resume, job);
  const first = readTailoring(
    answer({
      summary: 'Senior engineer with 7+ years in GenAI and AWS serverless.',
      roles: [
        {
          id: 'r1',
          bullets: [
            { id: 'b3', text: 'Developed Java REST APIs serving ~30,000 requests/day.' },
            { id: 'b1', text: 'Built Slack alerting on CloudWatch with Kafka.' },
          ],
        },
      ],
    }),
    resume,
    job,
    ids,
  )!;
  const t = { ...first, jobId: 'job-1', jobTitle: 'x', company: null, createdAt: '' };

  const lines = blockedLines(t);
  assert.deepEqual(
    lines.map((l) => l.id),
    ['summary', 'l0', 'l1'],
  );
  assert.match(retryPrompt(lines), /<not-allowed>Java<\/not-allowed>/);

  const next = applyRetry(
    answer({
      lines: [
        { id: 'summary', text: 'Senior engineer with 7+ years of AWS serverless work in Node.js.' },
        {
          id: 'l0',
          text: 'Developed TypeScript REST APIs serving ~30,000 requests/day for modernized services.',
        },
        { id: 'l1', text: 'Built Slack alerting on CloudWatch with Kafka.' },
      ],
    }),
    t,
    resume,
    job,
  );

  assert.equal(next.summary.after, 'Senior engineer with 7+ years of AWS serverless work in Node.js.');
  assert.equal(next.summary.blocked, null);
  assert.match(next.bullets[0].after, /modernized services/);
  assert.equal(next.bullets[1].after, next.bullets[1].before, 'still mentions Kafka, still blocked');
  assert.ok(next.bullets[1].blocked);
  assert.equal(t.summary.after, t.summary.before, 'the first result is not mutated');
});
