import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stackLine, withTechStacks } from '../src/resume/techStack.ts';

test('a tech stack is written "A | B | C", whatever it came in as', () => {
  assert.equal(stackLine('TypeScript, Node.js, AWS Lambda'), 'TypeScript | Node.js | AWS Lambda');
  assert.equal(stackLine('TypeScript; Node.js\nPostgreSQL.'), 'TypeScript | Node.js | PostgreSQL');
  assert.equal(stackLine('TypeScript | Node.js | TypeScript'), 'TypeScript | Node.js', 'no repeats');
  assert.equal(stackLine('AWS (Lambda, S3), Node.js'), 'AWS (Lambda, S3) | Node.js', 'a list in brackets stays with its tool');
  assert.equal(stackLine(null), '');
  assert.equal(stackLine('A, B', ', '), 'A, B', 'the separator can change later');
});

test('a CV opened with a comma stack or a "Tech stack:" bullet gets the same style', () => {
  const role = (techStack, bullets) => ({ title: 'Engineer', company: 'Acme', techStack, achievements: bullets.map((bullet) => ({ bullet })) });
  const resume = withTechStacks({ experiences: [role('Node.js, TypeScript', ['Built it.']), role('', ['Built it.', 'Tech stack: Go, Kafka.'])] });
  assert.deepEqual(resume.experiences.map((item) => item.techStack), ['Node.js | TypeScript', 'Go | Kafka']);
  assert.deepEqual(resume.experiences[1].achievements.map((item) => item.bullet), ['Built it.']);
});
