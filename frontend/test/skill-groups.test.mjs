import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenGroups, groupLines, groupSkills, parseGroupLines } from '../src/profile/skillGroups.ts';

const types = { TypeScript: 'Core', 'Node.js': 'Core', Claude: 'AI' };

test('skills are grouped in the order their first skill appears, ungrouped last', () => {
  assert.deepEqual(groupSkills(['TypeScript', 'Docker', 'Claude', 'Node.js'], types), [
    { name: 'Core', skills: ['TypeScript', 'Node.js'] },
    { name: 'AI', skills: ['Claude'] },
    { name: '', skills: ['Docker'] },
  ]);
  assert.deepEqual(groupSkills(['A', 'B']), [{ name: '', skills: ['A', 'B'] }], 'no groups: one plain list');
});

test('groups go back to one list and each skill\'s group; a repeat keeps its first place', () => {
  assert.deepEqual(flattenGroups([{ name: 'Core', skills: ['TypeScript', 'Node.js'] }, { name: '', skills: ['node.js', 'Docker'] }]), {
    skills: ['TypeScript', 'Node.js', 'Docker'],
    skillTypes: { TypeScript: 'Core', 'Node.js': 'Core' },
  });
});

test('the import review writes and reads one group per line', () => {
  const groups = groupSkills(['TypeScript', 'Node.js', 'Claude', 'Docker'], types);
  assert.equal(groupLines(groups), 'Core: TypeScript, Node.js\nAI: Claude\nDocker');
  assert.deepEqual(parseGroupLines('Core: TypeScript, Node.js\nAI: Claude\n\nDocker, Git\ncore: Go'), [
    { name: 'Core', skills: ['TypeScript', 'Node.js', 'Go'] },
    { name: 'AI', skills: ['Claude'] },
    { name: '', skills: ['Docker', 'Git'] },
  ]);
});

