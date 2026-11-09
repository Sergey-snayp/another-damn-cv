import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RewriteResumeLine } from '../src/modules/resumes/application/use-cases/rewrite-resume-line';
import { ClaudeLineRewriter } from '../src/modules/resumes/adapters/outbound/ai/claude-line.rewriter';

test('line rewrite checks ownership before AI and has no write dependency', async () => {
  const calls: string[] = [];
  const useCase = new RewriteResumeLine(
    {
      assertOwned: (userId, id) => {
        calls.push(`${userId}/${id}`);
        return Promise.resolve();
      },
    },
    {
      rewrite: (input) => {
        calls.push(input.text);
        return Promise.resolve({ original: input.text, suggestion: 'Built APIs.', cannotDo: [] });
      },
    },
  );
  assert.deepEqual(
    await useCase.execute('owner', 'resume', { text: 'Helped build APIs.', instruction: 'Shorten' }),
    {
      original: 'Helped build APIs.',
      suggestion: 'Built APIs.',
      cannotDo: [],
    },
  );
  assert.deepEqual(calls, ['owner/resume', 'Helped build APIs.']);
  const rejected = new RewriteResumeLine(
    { assertOwned: () => Promise.reject(new Error('No such resume.')) },
    {
      rewrite: () => {
        throw new Error('AI must not run');
      },
    },
  );
  await assert.rejects(
    rejected.execute('other', 'resume', { text: 'Original', instruction: 'Shorten' }),
    /No such resume/,
  );
});

test('line adapter preserves JSON, prose, empty and malformed field fallbacks', async () => {
  const input = { text: 'Built APIs.', instruction: 'Shorten' };
  const cases = [
    ['{"suggestion":"  Built APIs.  ","cannotDo":["No new metrics"]}', 'Built APIs.', ['No new metrics']],
    ['A shorter line.', 'A shorter line.', []],
    ['', 'Built APIs.', []],
    ['{"suggestion":null,"cannotDo":[42]}', 'Built APIs.', []],
    ['Answer: ```json\n{"suggestion":"Built a service.","cannotDo":[]}\n```', 'Built a service.', []],
  ] as const;
  for (const [answer, suggestion, cannotDo] of cases) {
    const adapter = new ClaudeLineRewriter({ complete: () => Promise.resolve(answer) });
    assert.deepEqual(await adapter.rewrite(input), { original: input.text, suggestion, cannotDo });
  }
});

test('line adapter fences source/context/instruction and keeps failures visible', async () => {
  const adapter = new ClaudeLineRewriter({
    complete: (prompt, system) => {
      assert.ok(prompt.includes('<original kind="summary">\nOriginal\n</original>'));
      assert.ok(prompt.includes('<context>\nContext\n</context>'));
      assert.ok(prompt.includes('<request>\nShorten\n</request>'));
      assert.ok(system.includes('Use ONLY facts present in the original text, or in a <cv_facts> block'));
      assert.ok(
        system.includes('Do not use dashes as sentence punctuation'),
        'the writing guide applies to every rewrite',
      );
      return Promise.resolve('{"suggestion":"Suggestion"}');
    },
  });
  await adapter.rewrite({ text: 'Original', instruction: 'Shorten', context: 'Context', kind: 'summary' });
  const unavailable = new ClaudeLineRewriter({ complete: () => Promise.reject(new Error('Unavailable')) });
  await assert.rejects(unavailable.rewrite({ text: 'Original', instruction: 'Shorten' }), /Unavailable/);
});
