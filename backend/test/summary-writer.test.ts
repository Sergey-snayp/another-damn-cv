import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClaudeSummaryWriter } from '../src/modules/resumes/adapters/outbound/ai/claude-summary.writer';
import { SUMMARY_INSTRUCTIONS } from '../src/modules/resumes/adapters/outbound/ai/summary-instructions';
import {
  writeCheckedSummary,
  type SummaryDraft,
  type SummaryWriter,
} from '../src/modules/resumes/application/use-cases/tailor-summary';
import {
  keepsOtherSentences,
  sentencesToFix,
  type ExperienceRecord,
} from '../src/modules/resumes/domain/summary-checks';

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
/** BAD after the code's own repairs: what goes back to the model when rewording is still needed. */
const BAD_REPAIRED = 'Senior backend engineer with 7 years, optimized things.';
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
      assert.equal(previous.summary, BAD_REPAIRED, 'the dash and spelling are repaired in code first');
      fixes.push(failed.map((check) => check.name));
      return Promise.resolve(draft(GOOD));
    },
  };
  const result = await writeCheckedSummary(writer, { job: 'Job', experience: record.text }, record);
  assert.equal(result.attempts, 2);
  assert.equal(result.summary, GOOD);
  assert.ok(fixes[0].includes('Word count'), 'what needs rewording goes back by name');
  assert.ok(
    !fixes[0].includes('No em dashes') && !fixes[0].includes('US spelling'),
    'mechanical slips do not',
  );
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
  // All three are repaired in code and fail the same checks: the latest stands.
  assert.equal(result.summary, 'Senior backend engineer with 7 years, again.');
  assert.ok(!result.failedChecks.some((check) => check.id === 'us-spelling' || check.id === 'em-dash'));
});

test('a fix that never comes back as valid JSON leaves the last try to the main model, then the best so far stands', async () => {
  const quick: boolean[] = [];
  const writer: SummaryWriter = {
    write: () => Promise.resolve(draft(BAD)),
    fix: (input) => {
      quick.push(input.quick);
      return Promise.reject(new Error('invalid JSON'));
    },
  };
  const result = await writeCheckedSummary(writer, { job: 'Job', experience: record.text }, record);
  assert.equal(result.summary, BAD_REPAIRED);
  assert.equal(result.attempts, 3);
  assert.deepEqual(quick, [true, false]);
});

/** 4 sentences that pass, the 2nd made too long: only it has to change. */
const LONG_SECOND = GOOD.replace(sentence(30), sentence(40));

test('the quick model fixes first and the main model takes the last try', async () => {
  const calls: Array<{ quick: boolean; change: number[] | null }> = [];
  const answers = [LONG_SECOND, GOOD];
  const writer: SummaryWriter = {
    write: () => Promise.resolve(draft(LONG_SECOND)),
    fix: ({ quick, change }) => {
      calls.push({ quick, change });
      return Promise.resolve(draft(answers.shift()!));
    },
  };
  const result = await writeCheckedSummary(writer, { job: 'Job', experience: record.text }, record);
  assert.deepEqual(calls, [
    { quick: true, change: [1] },
    { quick: false, change: [1] },
  ]);
  assert.equal(result.summary, GOOD);
  assert.equal(result.attempts, 3);
});

test('a fix that rewrites a sentence it was told to keep is thrown away', async () => {
  // Sentence 2 shortened, but sentence 1 rewritten too, with a claim the draft never made.
  const rewrote = GOOD.replace('building integrations', 'leading teams building integrations');
  const answers = [rewrote, GOOD];
  const writer: SummaryWriter = {
    write: () => Promise.resolve(draft(LONG_SECOND)),
    fix: () => Promise.resolve(draft(answers.shift()!)),
  };
  const result = await writeCheckedSummary(writer, { job: 'Job', experience: record.text }, record);
  assert.equal(result.summary, GOOD, 'the main model’s fix, which kept sentence 1, stands');
  assert.doesNotMatch(result.summary, /leading teams/);
});

test('which sentences a fix may change', () => {
  assert.deepEqual(sentencesToFix(LONG_SECOND, [{ id: 'sentences', name: 'S', ok: false }], record), [1]);
  const unknownNumber = GOOD.replace('Shipped', 'Shipped 42');
  assert.deepEqual(
    sentencesToFix(unknownNumber, [{ id: 'numbers-in-record', name: 'N', ok: false }], record),
    [1],
  );
  // A word count that is off can be put right in any sentence.
  assert.equal(sentencesToFix(GOOD, [{ id: 'word-count', name: 'W', ok: false }], record), null);
  assert.equal(sentencesToFix(BAD_REPAIRED, [{ id: 'sentences', name: 'S', ok: false }], record), null);
  assert.ok(keepsOtherSentences(LONG_SECOND, GOOD, [1]));
  assert.ok(!keepsOtherSentences(LONG_SECOND, GOOD.replace('7 years', '8 years'), [1]));
  assert.ok(
    keepsOtherSentences(GOOD, GOOD.replace('**NestJS**', 'NestJS'), [3]),
    'bold marks alone do not count',
  );
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
    change: null,
    quick: false,
  });
  assert.equal(retried.summary, GOOD);
  assert.match(
    prompts[2],
    /<previous_summary>\n1\. Senior backend engineer[\s\S]*optimised things[\s\S]*<\/previous_summary>/,
  );
  assert.match(prompts[2], /- No em dashes: 1 em dash/);
});

test('a quick fix runs on the small model at low effort, returns only the summary, and keeps the mapping', async () => {
  const calls: Array<{ prompt: string; options: unknown }> = [];
  const writer = new ClaudeSummaryWriter(
    {
      complete: (prompt, _system, options) => {
        calls.push({ prompt, options });
        return Promise.resolve(JSON.stringify({ summary: GOOD }));
      },
    },
    { quick: 'claude-haiku-5-5' },
  );
  const previous: SummaryDraft = {
    ...draft(LONG_SECOND),
    mapping: [{ item: 'NestJS', type: 'required', evidence: 'NestJS clause', employer: 'Acme' }],
    gaps: ['Go'],
    decidingGap: 'Go',
  };
  const fixed = await writer.fix({
    job: 'J',
    experience: 'E',
    previous,
    failed: [
      { id: 'sentences', name: 'Sentence count and length', ok: false, detail: 'sentence 2 has 40 words' },
    ],
    change: [1],
    quick: true,
  });
  assert.deepEqual(calls[0].options, { timeoutMs: 60_000, effort: 'low', model: 'claude-haiku-5-5' });
  assert.match(calls[0].prompt, /Rewrite only sentence 2\. Copy every other sentence exactly/);
  assert.match(calls[0].prompt, /\{"summary": "<the corrected summary>"\}/);
  assert.deepEqual(fixed, { ...previous, summary: GOOD });
});

test('mechanical slips are repaired in code, without another round with the model', async () => {
  const slipped = GOOD.replace(
    'building integrations',
    'building integrations — optimised for scale —',
  ).replace('at scale today', 'and **Git** today');
  const writer: SummaryWriter = {
    write: () => Promise.resolve(draft(slipped)),
    fix: () => assert.fail('no fix round for a dash, a spelling or a bold'),
  };
  const result = await writeCheckedSummary(writer, { job: 'Job', experience: record.text }, record);
  assert.equal(result.attempts, 1);
  assert.match(result.summary, /building integrations, optimized for scale, on \*\*NestJS\*\* and Git today/);
});
