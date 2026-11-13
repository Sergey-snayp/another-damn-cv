import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AssistDescription } from '../src/modules/profiles/application/use-cases/assist-description';
import { descriptionProblems } from '../src/modules/profiles/domain/job-description';
import type { DescribeInput } from '../src/modules/profiles/application/ports/achievement-writer';

const source = {
  title: 'Senior Software Engineer',
  company: 'Ciklum',
  client: 'Paymorrow',
  description: '',
  bullets: ['Built the invoice checkout API used by 300 German online retailers.'],
  techStack: 'Node.js, AWS',
  notes: 'Paymorrow is a payments platform; retailers offer invoice and instalment checkout to shoppers.',
};
const good = 'Payments platform that lets 300 German online retailers offer invoice and instalment checkout to their shoppers.';

test('a description that breaks the standard says how', () => {
  assert.deepEqual(descriptionProblems(good, source), []);
  assert.deepEqual(descriptionProblems('Built an innovative Node.js payments platform for Ciklum that cut checkout time by 30% for retailers.', source), [
    'about the person ("Built"), not the product',
    'a result ("cut")',
    'a generic claim ("innovative")',
    'technologies (Node.js)',
    'repeats "Ciklum" from the title',
  ]);
});

test('Write with AI for a description: checked versions, one retry with what went wrong, or questions', async () => {
  const calls: DescribeInput[] = [];
  const replies = [
    { options: [{ angle: 'Product', text: 'Leading payments platform used by 5,000 European banks for cross-border transfers and card issuing worldwide.' }], questions: [] },
    { options: [{ angle: 'Product', text: good }, { angle: 'Users', text: 'Too short.' }], questions: [] },
  ];
  const assist = new AssistDescription({ describe: async (input) => (calls.push(input), replies.shift()!) });
  const result = await assist.execute({ source, text: '', answers: [], instruction: '' });
  assert.deepEqual(result.options.map((option) => option.text), [good], 'only the version that keeps to the facts and the standard');
  assert.equal(calls.length, 2, 'asked again once');
  assert.ok(calls[1]!.avoid!.some((item) => /not in the job's facts|number or name/.test(item)), 'telling it what went wrong');

  const asking = new AssistDescription({ describe: async () => ({ options: [], questions: ['What does the product do?', 'Who uses it?'] }) });
  assert.deepEqual(await asking.execute({ source: { ...source, notes: '', bullets: [] }, text: '', answers: [], instruction: '' }), {
    options: [],
    questions: ['What does the product do?', 'Who uses it?'],
  }, 'too little to go on: questions instead of guesses');

  const answered: DescribeInput[] = [];
  await new AssistDescription({ describe: async (input) => (answered.push(input), { options: [{ angle: 'Product', text: good }], questions: [] }) })
    .execute({ source, text: '', answers: [{ question: 'Who uses it?', answer: 'German online retailers' }], instruction: '' });
  assert.deepEqual(answered[0]!.answers, [{ question: 'Who uses it?', answer: 'German online retailers' }], 'answers go to the AI');

  await assert.rejects(
    new AssistDescription({ describe: async () => ({ options: [{ angle: 'x', text: 'Innovative platform.' }], questions: [] }) }).execute({ source, text: '', answers: [], instruction: '' }),
    /without guessing/,
  );
});
