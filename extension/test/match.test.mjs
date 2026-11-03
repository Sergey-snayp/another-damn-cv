// Run: node --test extension/test/match.test.mjs   (Node 22)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findKeywords, jobFromCapture, looksLikeJobPosting, matchLabel, scoreCv } from '../src/match.js';

const POSTING = `Senior Backend Engineer
About the role
You will build payment APIs for small businesses and keep the rest of the platform reliable.
Requirements:
- 5+ years with Node.js and TypeScript
- PostgreSQL and Redis in production
- Docker and Kubernetes
Responsibilities
- Design REST APIs and event-driven services on AWS
- Work with Kafka
Nice to have:
- GraphQL
- 3+ years of experience with React
We offer remote work.`;

test('finds the skills a posting asks for, with spellings and weights', () => {
  const keywords = findKeywords(POSTING);
  const byName = Object.fromEntries(keywords.map(k => [k.name, k.weight]));
  assert.deepEqual(Object.keys(byName).sort(), ['AWS', 'Docker', 'Event-driven', 'GraphQL', 'Kafka', 'Kubernetes', 'Node.js', 'Payments', 'PostgreSQL', 'REST', 'React', 'Redis', 'TypeScript'].sort());
  for (const name of ['Node.js', 'TypeScript', 'PostgreSQL', 'Redis', 'Docker', 'Kubernetes']) assert.equal(byName[name], 2, name);
  for (const name of ['GraphQL', 'React', 'Kafka', 'AWS']) assert.equal(byName[name], 1, name);
  assert.equal(keywords[0].weight, 2, 'required skills come first');
});

test('does not mistake ordinary words or parts of words for skills', () => {
  const names = findKeywords('Join the rest of the team. We do R&D in Phoenix. Java developers welcome; tests run nightly; scalable APIs.').map(k => k.name);
  assert.deepEqual(names, ['Java']);
  assert.deepEqual(findKeywords('JavaScript and Node.js').map(k => k.name), ['JavaScript', 'Node.js']);
  assert.deepEqual(findKeywords('nodejs, postgres, k8s, golang').map(k => k.name), ['Node.js', 'PostgreSQL', 'Kubernetes', 'Go']);
  assert.deepEqual(findKeywords('Write Go services.').map(k => k.name), ['Go'], 'Go counts when written as the language name');
});

test('scores a CV by weighted coverage and lists what is missing', () => {
  const keywords = [{ name: 'Node.js', weight: 2 }, { name: 'PostgreSQL', weight: 2 }, { name: 'GraphQL', weight: 1 }];
  const result = scoreCv(keywords, 'Built services in NodeJS on Postgres.');
  assert.deepEqual(result, { score: 80, matched: ['Node.js', 'PostgreSQL'], missing: ['GraphQL'] });
  assert.equal(scoreCv([], 'anything').score, 0);
  assert.deepEqual([95, 80, 79, 60, 59, 40, 39].map(matchLabel), ['Strong', 'Strong', 'Good', 'Good', 'Fair', 'Fair', 'Low']);
});

test('prefers the page JobPosting data and recognises job pages', () => {
  const capture = { pageTitle: 'Acme', text: 'menu', matched: 'whole page', jsonLd: [{ '@graph': [{ '@type': 'JobPosting', title: 'Backend', description: '<p>Node.js</p><ul><li>Docker</li><li>AWS</li></ul>' }] }] };
  const job = jobFromCapture(capture);
  assert.equal(job.structured, true);
  assert.match(job.text, /Node\.js\nDocker\nAWS/);
  assert.equal(looksLikeJobPosting(capture, job, findKeywords(job.text)), true);

  const plain = { pageTitle: 'Blog', text: 'We love Node.js, Docker and AWS. Read our blog post about them.', matched: 'main content' };
  assert.equal(looksLikeJobPosting(plain, jobFromCapture(plain), findKeywords(plain.text)), false);

  const page = { pageTitle: 'Job', text: POSTING, matched: 'main content' };
  assert.equal(looksLikeJobPosting(page, jobFromCapture(page), findKeywords(POSTING)), true);
  const linkedin = { pageTitle: 'LinkedIn', text: 'Node.js Docker AWS', matched: 'linkedin' };
  assert.equal(looksLikeJobPosting(linkedin, jobFromCapture(linkedin), findKeywords(linkedin.text)), true);
});
