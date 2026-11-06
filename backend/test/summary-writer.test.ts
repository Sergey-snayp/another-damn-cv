import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClaudeSummaryWriter } from '../src/modules/resumes/adapters/outbound/ai/claude-summary.writer';
import { SUMMARY_INSTRUCTIONS } from '../src/modules/resumes/adapters/outbound/ai/summary-instructions';
import {
  writeCheckedSummary,
  type SummaryDraft,
  type SummaryWriter,
} from '../src/modules/resumes/application/use-cases/tailor-summary';
import type { ExperienceRecord } from '../src/modules/resumes/domain/summary-checks';

const record: ExperienceRecord = {
  text: 'Professional experience since 2019 (about 7 years).\n<role employer="Acme">\n- Built 16 integrations on NestJS.\n</role>',
  employers: [{ employer: 'Acme', text: 'Built 16 integrations on NestJS.' }],
  technologies: ['NestJS'],
};
const sentence = (words: number) =>
  `Shipped ${Array(words - 2)
    .fill('word')
    .join(' ')} end.`;
const GOOD = `Senior backend engineer with 7 years building integrations on **NestJS** at scale today. ${sentence(30)} ${sentence(30)} ${sentence(20)}`;
const BAD = 'Senior backend engineer with 7 years — optimised things.';
const draft = (summary: string): SummaryDraft => ({
  summary,
  wordCount: 0,
  mapping: [],
  gaps: [],
  decidingGap: null,
});

test('a summary that passes every check is returned after one attempt, with the word count worked out in code', async () => {
  const writer: SummaryWriter = {
    write: () => Promise.resolve(draft(GOOD)),
    fix: () => assert.fail('no fix needed'),
  };
  const result = await writeCheckedSummary(writer, { job: 'Job', experience: record.text }, record);
  assert.equal(result.attempts, 1);
  assert.deepEqual(result.failedChecks, []);
  assert.equal(result.wordCount, 93);
});

test('failed checks go back to the model by name, and a fixed summary is returned', async () => {
  const fixes: string[][] = [];
  const writer: SummaryWriter = {
    write: () => Promise.resolve(draft(BAD)),
    fix: ({ failed, previous }) => {
      assert.equal(previous.summary, BAD);
      fixes.push(failed.map((check) => check.name));
      return Promise.resolve(draft(GOOD));
    },
  };
  const result = await writeCheckedSummary(writer, { job: 'Job', experience: record.text }, record);
  assert.equal(result.attempts, 2);
  assert.equal(result.summary, GOOD);
  assert.ok(fixes[0].includes('No em dashes') && fixes[0].includes('US spelling'));
});

test('after 3 attempts the best version comes back with its failed checks listed', async () => {
  const answers = [BAD, `${BAD} More.`, 'Senior backend engineer with 7 years — again.'];
  let call = 0;
  const writer: SummaryWriter = {
    write: () => Promise.resolve(draft(answers[call++])),
    fix: () => Promise.resolve(draft(answers[call++])),
  };
  const result = await writeCheckedSummary(writer, { job: 'Job', experience: record.text }, record);
  assert.equal(result.attempts, 3);
  assert.equal(call, 3, 'never a 4th attempt');
  assert.ok(result.failedChecks.length > 0);
  // The third has no British spelling: it fails the fewest checks.
  assert.equal(result.summary, answers[2]);
  assert.ok(!result.failedChecks.some((check) => check.id === 'us-spelling'));
});

test('a fix that never comes back as valid JSON ends the loop with the best so far', async () => {
  const writer: SummaryWriter = {
    write: () => Promise.resolve(draft(BAD)),
    fix: () => Promise.reject(new Error('invalid JSON')),
  };
  const result = await writeCheckedSummary(writer, { job: 'Job', experience: record.text }, record);
  assert.equal(result.summary, BAD);
  assert.equal(result.attempts, 2);
});

const answer = (summary: string) =>
  JSON.stringify({
    summary,
    word_count: 10,
    mapping: [{ item: 'Node.js', type: 'required', evidence: 'NestJS clause', employer: 'Acme' }],
    gaps: ['Go'],
    deciding_gap: 'Go',
  });

test('the writer sends the instructions as the system prompt and the inputs in their tags', async () => {
  const calls: Array<{ prompt: string; system: string }> = [];
  const writer = new ClaudeSummaryWriter({
    complete: (prompt, system) => {
      calls.push({ prompt, system });
      return Promise.resolve(answer(GOOD));
    },
  });
  const result = await writer.write({
    job: 'Posting text',
    experience: 'Record text',
    request: 'Stress payments',
  });
  assert.equal(calls[0].system, SUMMARY_INSTRUCTIONS);
  assert.match(SUMMARY_INSTRUCTIONS, /^# Instructions: write a tailored CV summary/);
  assert.doesNotMatch(SUMMARY_INSTRUCTIONS, /Checks to run in code|I don/);
  assert.match(calls[0].prompt, /<job_description>\nPosting text\n<\/job_description>/);
  assert.match(calls[0].prompt, /<experience>\nRecord text\n<\/experience>/);
  assert.match(calls[0].prompt, /<candidate_request>\nStress payments/);
  assert.deepEqual(result, {
    summary: GOOD,
    wordCount: 10,
    mapping: [{ item: 'Node.js', type: 'required', evidence: 'NestJS clause', employer: 'Acme' }],
    gaps: ['Go'],
    decidingGap: 'Go',
  });
});

test('invalid JSON is retried once with what was wrong; twice invalid is an error', async () => {
  const replies = ['not json', '{"summary": "x"}', answer(GOOD)];
  const prompts: string[] = [];
  const writer = new ClaudeSummaryWriter({
    complete: (prompt) => {
      prompts.push(prompt);
      return Promise.resolve(replies.shift()!);
    },
  });
  await assert.rejects(writer.write({ job: 'J', experience: 'E' }), /did not return a valid summary/);
  assert.equal(prompts.length, 2);
  assert.match(prompts[1], /not valid JSON in the required shape \(no JSON object found\)/);

  const retried = await writer.fix({
    job: 'J',
    experience: 'E',
    previous: draft(BAD),
    failed: [{ id: 'em-dash', name: 'No em dashes', ok: false, detail: '1 em dash' }],
  });
  assert.equal(retried.summary, GOOD);
  assert.match(prompts[2], /<previous_answer>[\s\S]*optimised things[\s\S]*<\/previous_answer>/);
  assert.match(prompts[2], /- No em dashes: 1 em dash/);
});
