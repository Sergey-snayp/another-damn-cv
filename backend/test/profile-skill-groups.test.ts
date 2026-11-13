import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroupSkills } from '../src/modules/profiles/application/use-cases/group-skills';

const grouper = (groups: { name: string; skills: string[] }[]) => new GroupSkills({ groupSkills: async () => groups });

test('every skill lands in one group, spelled as written; made-up ones are dropped, missed ones go to Other', async () => {
  const result = await grouper([
    { name: 'Core:', skills: ['typescript', 'Node.js', 'Rust'] },
    { name: 'Databases', skills: ['PostgreSQL', 'Node.js'] },
    { name: 'core', skills: ['NestJS'] },
    { name: 'Misc', skills: [] },
  ]).execute(['TypeScript', 'Node.js', 'NestJS', 'PostgreSQL', 'Code review', 'node.js']);
  assert.deepEqual(result.groups, [
    { name: 'Core', skills: ['TypeScript', 'Node.js', 'NestJS'] },
    { name: 'Databases', skills: ['PostgreSQL'] },
    { name: 'Other', skills: ['Code review'] },
  ]);
});

test('no usable group is an error to show, not an empty Profile', async () => {
  await assert.rejects(grouper([{ name: 'Other', skills: ['A'] }]).execute(['A']), /could not sort/);
});
