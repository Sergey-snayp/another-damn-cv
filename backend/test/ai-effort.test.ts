import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClaudeLineRewriter } from '../src/modules/resumes/adapters/outbound/ai/claude-line.rewriter';
import { ClaudeSkillTailor } from '../src/modules/resumes/adapters/outbound/ai/claude-skill.tailor';
import { ClaudeSummaryWriter } from '../src/modules/resumes/adapters/outbound/ai/claude-summary.writer';
import { ClaudeCoverLetterWriter } from '../src/modules/resumes/adapters/outbound/ai/claude-cover-letter.writer';
import { ClaudeJobAssessor } from '../src/modules/resumes/adapters/outbound/ai/claude-job.assessor';
import { ClaudeTechnologyDescriber } from '../src/modules/resumes/adapters/outbound/ai/claude-technology.describer';
import { ClaudeResumeChat } from '../src/modules/resumes/adapters/outbound/ai/claude-resume-chat';

/** Calls the adapter with a runner that records the effort asked for, whatever comes back. */
async function effortOf(
  build: (llm: { complete: (...args: unknown[]) => Promise<string> }) => Promise<unknown>,
) {
  const asked: unknown[] = [];
  await build({
    complete: (_prompt, _system, options) => {
      asked.push((options as { effort?: string } | undefined)?.effort);
      return Promise.resolve('{}');
    },
  }).catch(() => undefined);
  return [...new Set(asked)];
}

test('what the person reads and sends is written at medium effort; quick checks run at low effort', async () => {
  const job = { title: 'Engineer', company: 'Acme', description: 'Node.js' };
  assert.deepEqual(
    await effortOf((llm) =>
      new ClaudeLineRewriter(llm as never).rewrite({
        text: 'Built APIs.',
        kind: 'bullet',
        instruction: 'Tailor it.',
      }),
    ),
    ['medium'],
  );
  assert.deepEqual(
    await effortOf((llm) =>
      new ClaudeSummaryWriter(llm as never).write({ job: 'Node.js', experience: 'Built APIs.' }),
    ),
    // The summary's draft is the exception: at medium it took 38 seconds, and its checks catch slips.
    ['low'],
  );
  assert.deepEqual(
    await effortOf((llm) =>
      new ClaudeCoverLetterWriter(llm as never).write({
        job: 'Node.js',
        experience: 'Built APIs.',
        candidate: 'Name: A',
      }),
    ),
    ['medium'],
  );
  assert.deepEqual(
    await effortOf((llm) =>
      new ClaudeResumeChat(llm as never).answer({
        resume: { summaries: {}, experiences: [], skills: [], educations: [] } as never,
        job: null,
        messages: [{ role: 'user', content: 'Hi' }] as never,
        settings: '',
      }),
    ),
    ['medium'],
  );
  assert.deepEqual(
    await effortOf((llm) =>
      new ClaudeSkillTailor(llm as never).tailor({
        job: { title: 'Engineer', description: 'Node.js' },
        evidence: 'Node.js',
        groups: [],
        elsewhere: [],
        settings: '',
      }),
    ),
    ['low'],
  );
  assert.deepEqual(
    await effortOf((llm) =>
      new ClaudeTechnologyDescriber(llm as never).describe({ name: 'Kafka', mentions: [] }),
    ),
    ['low'],
  );
  assert.deepEqual(
    await effortOf((llm) =>
      new ClaudeJobAssessor(llm as never).assess({ job, evidence: 'Built APIs.', asOf: '2026-11-06' }),
    ),
    ['low'],
  );
});
