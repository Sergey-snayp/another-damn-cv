import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import golden from './fixtures/tailoring-golden.json';
import { tailorPrompt, TAILOR_SYSTEM } from '../src/modules/tailoring/adapters/outbound/ai/prompt';
import { readCandidate, readRetry } from '../src/modules/tailoring/adapters/outbound/ai/answer';
import { planTailoring } from '../src/modules/tailoring/domain/policy';
import { applyRetry } from '../src/modules/tailoring/domain/retry';
import { TailorResume } from '../src/modules/tailoring/application/use-cases/tailor-resume';
import { ClaudeTailoringGenerator } from '../src/modules/tailoring/adapters/outbound/ai/claude-tailoring.generator';
import type {
  ResumeWorkspace,
  TailoringGenerator,
} from '../src/modules/tailoring/application/ports/tailoring';
import type { Tailoring } from '../src/modules/tailoring/domain/types';
import type { RenderedResume } from '../src/modules/resumes/contracts';
import { bullet, contact, role, skill } from './fixtures/resume';

const resume: RenderedResume = {
  snapshot: 3,
  contact: contact(),
  experiences: [
    role('role-a', { title: 'Engineer', company: 'Acme' }, [
      bullet('a1', 'Built Node.js APIs for 20k requests.'),
      bullet('a2', 'Built AWS Lambda services.'),
    ]),
    role('role-b', { company: 'Other' }, [bullet('b1', 'Built Kafka services.')]),
  ],
  skills: [skill('s-node', 'Node.js'), skill('s-aws', 'AWS')],
  educations: [],
  summaries: { default: 'Engineer building Node.js APIs.' },
};
const job = {
  id: 'job-1',
  title: 'Engineer',
  pageTitle: 'Job',
  company: 'Acme',
  description: 'Build Node.js and Kafka services in Java.',
  extraction: 'structured',
};

test('typed parsing and plain tailoring policies retain legacy prompts, fallback, ordering and retry results', () => {
  const { prompt, ids } = tailorPrompt(resume, job);
  // Frozen from the pre-migration implementation, before removing its services.
  const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  assert.equal(digest(TAILOR_SYSTEM), golden.system);
  assert.equal(digest({ prompt, ids }), golden.prompt);
  const payloads: unknown[] = [
    {},
    { roles: null, skills: null, cannotClaim: null },
    {
      summary: 'Engineer using Java.',
      roles: [{ id: 'r1', bullets: [{ id: 'b1', text: 'Built Kafka services.' }] }],
    },
    {
      roles: [
        {
          id: 'r1',
          bullets: [
            { id: 'b2', text: 'Built AWS Lambda services.', keep: false },
            { id: 'b1', text: 'Built Node.js APIs for 20,000 requests.', keep: false },
          ],
        },
      ],
      skills: ['s2', 's1', 's2', 'unknown'],
      cannotClaim: [' Java ', '', 2],
    },
    {
      roles: [
        {
          id: 'r1',
          bullets: [
            { id: 'b3', text: 'Built Kafka services.' },
            { id: 'b1', text: 'Rebuilt Node.js APIs.' },
            { id: 'b1', text: 'duplicate' },
          ],
        },
        { id: 'r1', bullets: [{ id: 'b2', text: 'Built AWS Lambda APIs.' }] },
        { id: 'unknown', bullets: [] },
      ],
    },
    { summary: 12, roles: [null, { id: 1, bullets: [null, { id: 2, text: null }] }, 'wrong'] },
  ];
  for (const [index, payload] of payloads.entries()) {
    const answer = `Model response:\n${JSON.stringify(payload)}`;
    const candidate = readCandidate(answer, ids);
    assert.ok(candidate);
    const actual = planTailoring(candidate, resume, job);
    assert.equal(digest(actual), golden.drafts[index]);
    const tailoring = { ...actual, jobId: job.id, jobTitle: 'Engineer', company: 'Acme', createdAt: '' };
    const retry = JSON.stringify({
      lines: [
        { id: 'summary', text: 'Engineer building Node.js services.' },
        { id: 'l0', text: 'Built Node.js APIs.' },
        { id: 'l1', text: 'Built Java services.' },
      ],
    });
    assert.equal(digest(applyRetry(readRetry(retry), tailoring, resume, job)), golden.retries[index]);
  }
  assert.equal(readCandidate('No JSON answer.', ids), null);
});

function setup(
  options: { pending?: boolean; empty?: boolean; malformed?: boolean; retryFails?: boolean } = {},
) {
  const stored: Tailoring[] = [];
  let copies = 0,
    retries = 0,
    generations = 0;
  const workspace: ResumeWorkspace = {
    forJob: () => {
      copies++;
      return Promise.resolve({
        id: 'copy-1',
        document: options.empty ? { ...resume, experiences: [], summaries: {} } : resume,
      });
    },
    pending: () => Promise.resolve(stored[0] ?? null),
    store: (_userId, _id, proposal) => {
      stored.push(proposal);
      return Promise.resolve();
    },
    discard: async () => {},
  };
  const generator: TailoringGenerator = {
    generate: () => {
      generations++;
      return Promise.resolve(
        options.malformed
          ? null
          : { summary: 'Engineer using Java.', roles: [], skills: [], cannotClaim: ['Java'] },
      );
    },
    retry: () => {
      retries++;
      if (options.retryFails) return Promise.reject(new Error('Synthetic timeout'));
      return Promise.resolve([{ id: 'summary', text: 'Engineer building Node.js services.' }]);
    },
  };
  const useCase = new TailorResume(
    {
      getForTailoring: () =>
        Promise.resolve({ ...job, extraction: options.pending ? 'pending' : job.extraction }),
    },
    workspace,
    generator,
    () => new Date('2026-01-01T00:00:00Z'),
  );
  return { useCase, stored, counts: () => ({ copies, retries, generations }) };
}
test('tailoring stores proposals after one retry, without changing the supplied resume', async () => {
  const before = structuredClone(resume);
  const { useCase, stored, counts } = setup();
  const result = await useCase.execute({ userId: 'owner', jobId: job.id });
  assert.equal(result.resumeId, 'copy-1');
  assert.equal(result.tailoring.basedOnSnapshot, 3);
  assert.equal(result.tailoring.createdAt, '2026-01-01T00:00:00.000Z');
  assert.equal(result.tailoring.summary.after, 'Engineer building Node.js services.');
  assert.equal(stored.length, 1);
  assert.deepEqual(counts(), { copies: 1, retries: 1, generations: 1 });
  assert.deepEqual(resume, before);
});
test('a failed retry keeps the original text and blocked proposal for review', async () => {
  const { useCase, stored, counts } = setup({ retryFails: true });
  await useCase.execute({ userId: 'owner', jobId: job.id });
  assert.equal(stored[0].summary.after, stored[0].summary.before);
  assert.match(stored[0].summary.blocked ?? '', /Java/);
  assert.equal(counts().retries, 1);
});
test('pending jobs, empty copies and unusable AI replies do not store proposals', async () => {
  for (const [options, message] of [
    [{ pending: true }, /still being read/],
    [{ empty: true }, /resume is empty/],
    [{ malformed: true }, /could not be read/],
  ] as const) {
    const { useCase, stored, counts } = setup(options);
    await assert.rejects(useCase.execute({ userId: 'owner', jobId: job.id }), message);
    assert.equal(stored.length, 0);
    if ('pending' in options) assert.deepEqual(counts(), { copies: 0, retries: 0, generations: 0 });
  }
});

test('AI adapter uses the shared runner with existing timeouts and translates provider failures', async () => {
  const calls: Array<{ prompt: string; system: string; timeoutMs: number | undefined }> = [];
  const generator = new ClaudeTailoringGenerator({
    complete: (prompt, system, options) => {
      calls.push({ prompt, system, timeoutMs: options?.timeoutMs });
      return Promise.resolve(
        calls.length === 1 ? '{"roles":[]}' : '{"lines":[{"id":"summary","text":"Fixed line."}]}',
      );
    },
  });
  assert.ok(await generator.generate(resume, job));
  assert.deepEqual(
    await generator.retry([{ id: 'summary', original: 'Original.', rejected: 'Java.', problems: ['Java'] }]),
    [{ id: 'summary', text: 'Fixed line.' }],
  );
  assert.deepEqual(
    calls.map((call) => call.timeoutMs),
    [300_000, 120_000],
  );
  assert.equal(calls[0].system, calls[1].system);
  assert.match(calls[1].prompt, /<not-allowed>Java<\/not-allowed>/);
  const failing = new ClaudeTailoringGenerator({
    complete: () => Promise.reject(new Error('Synthetic AI timeout')),
  });
  await assert.rejects(
    failing.generate(resume, job),
    (error) =>
      error instanceof Error &&
      error.message === 'Synthetic AI timeout' &&
      'code' in error &&
      error.code === 'unavailable',
  );
});
