import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ClaudeSkillTailor } from '../src/modules/resumes/adapters/outbound/ai/claude-skill.tailor';

const input = {
  job: { title: 'Backend Engineer', description: 'Node.js, Kafka, AWS.' },
  evidence: 'Built APIs on Kafka and AWS Lambda.',
  groups: [
    { category: 'Core', skills: ['TypeScript', 'Node.js'] },
    { category: '', skills: ['Docker'] },
  ],
  elsewhere: [],
  settings: '',
};
const tailorWith = (answer: unknown) => {
  const prompts: string[] = [];
  const tailor = new ClaudeSkillTailor({
    complete: (prompt) => {
      prompts.push(prompt);
      return Promise.resolve(JSON.stringify(answer));
    },
  });
  return { prompts, run: () => tailor.tailor(input) };
};

test('each answer goes back to its line by id, and the lines are shown numbered', async () => {
  const { prompts, run } = tailorWith({
    groups: [
      { line: 'l1', add: ['Kafka'] },
      { line: 'l2', add: ['AWS Lambda'] },
    ],
    cannotDo: ['Go'],
  });
  assert.deepEqual(await run(), {
    groups: [
      { category: 'Core', add: ['Kafka'] },
      { category: '', add: ['AWS Lambda'] },
    ],
    cannotDo: ['Go'],
  });
  assert.match(prompts[0], /l1 \| Core: TypeScript, Node\.js\nl2 \| \(no label\): Docker/);
});

test('an answer that echoes the whole line still finds its line; an unknown line is left out', async () => {
  const { run } = tailorWith({
    groups: [
      { category: 'Core: TypeScript, Node.js', add: ['Kafka'] },
      { category: '(no label)', add: [] },
      { category: 'Databases', add: ['PostgreSQL'] },
    ],
  });
  assert.deepEqual((await run()).groups, [
    { category: 'Core', add: ['Kafka'] },
    { category: '', add: [] },
  ]);
});
