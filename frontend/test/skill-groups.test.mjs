import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flattenGroups, groupLikeProfile, groupLines, groupSkills, parseGroupLines } from '../src/profile/skillGroups.ts';

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


test('a flat CV list takes the Profile\'s groups, in the Profile\'s order; a grouped CV is left alone', () => {
  const cv = ['Docker', 'Claude', 'node.js', 'TypeScript', 'Go'].map((name, position) => ({ name, category: '', position }));
  const profile = ['TypeScript', 'Node.js', 'Claude'];
  assert.deepEqual(groupLikeProfile(cv, profile, types)?.map((skill) => `${skill.category}:${skill.name}:${skill.position}`),
    ['Core:TypeScript:0', 'Core:node.js:1', 'AI:Claude:2', ':Docker:3', ':Go:4']);
  assert.equal(groupLikeProfile([{ name: 'Go', category: 'Core' }], profile, types), null);
  assert.equal(groupLikeProfile([{ name: 'Go', category: '' }], profile, types), null, 'nothing fits');
});
