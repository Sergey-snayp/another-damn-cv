import assert from 'node:assert/strict';
import { test } from 'node:test';
import { practiceHints, practiceHintText } from '../src/modules/resumes/domain/job-practices';
import { tailorPrompt } from '../src/modules/resumes/adapters/outbound/ai/tailoring/prompt';

const POSTING = `Senior Software Engineer at Conexiom.
You will own services end-to-end and improve observability across our event-driven platform.
Requirements: CI/CD, security best practices, integrations with ERP systems.`;

test('a practice the posting asks for is offered in its words when the line shows the work', () => {
  const hints = practiceHints(
    POSTING,
    'Added **CloudWatch** alarms and dashboards to three payment services fed by **SQS** events.',
  );
  assert.deepEqual(hints, [
    { term: 'observability', evidence: ['CloudWatch', 'alarms', 'dashboards'] },
    { term: 'event-driven', evidence: ['SQS', 'events'] },
  ]);
  assert.match(practiceHintText(hints), /- "observability": the line's CloudWatch, alarms, dashboards/);
});

test('nothing is offered without evidence in the line, or when the line already names it', () => {
  assert.deepEqual(practiceHints(POSTING, 'Mentored two junior engineers on code review.'), []);
  assert.deepEqual(
    practiceHints(POSTING, 'Improved observability with CloudWatch alarms.'),
    [],
    'the line already says observability',
  );
  assert.deepEqual(
    practiceHints('We build a payments platform in Go.', 'Added CloudWatch alarms and dashboards.'),
    [],
    'the posting does not ask for it',
  );
  assert.equal(practiceHintText([]), '');
});

test("the posting's own spelling is kept, and acronyms keep their capitals", () => {
  assert.deepEqual(practiceHints(POSTING, 'Shipped every release through GitLab CI.'), [
    { term: 'CI/CD', evidence: ['GitLab CI'] },
  ]);
  assert.deepEqual(practiceHints('Strong Monitoring skills.', 'Built Grafana dashboards.'), [
    { term: 'monitoring', evidence: ['Grafana', 'dashboards'] },
  ]);
  assert.deepEqual(practiceHints(POSTING, 'Passed two PCI DSS audits with RBAC and KMS encryption.'), [
    { term: 'security', evidence: ['PCI DSS', 'audits', 'RBAC'] },
  ]);
});

test('the full tailoring prompt carries the posting words under the bullet that shows the work', () => {
  const resume = {
    summaries: { default: 'Backend engineer.' },
    experiences: [
      {
        lineageId: 'r1',
        title: 'Engineer',
        company: 'Acme',
        client: null,
        from: '2021',
        to: null,
        blurb: '',
        achievements: [
          { lineageId: 'b1', bullet: 'Added CloudWatch alarms to the payment services.', position: 0 },
          { lineageId: 'b2', bullet: 'Wrote the onboarding guide.', position: 1 },
        ],
      },
    ],
    skills: [],
  };
  const { prompt } = tailorPrompt(
    resume as never,
    { title: 'Engineer', company: 'Conexiom', description: POSTING } as never,
  );
  assert.match(
    prompt,
    /<bullet id="b1">Added CloudWatch alarms to the payment services\.\n<posting_words>observability \(CloudWatch, alarms\)<\/posting_words><\/bullet>/,
  );
  assert.match(prompt, /<bullet id="b2">Wrote the onboarding guide\.<\/bullet>/);
});
