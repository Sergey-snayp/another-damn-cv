import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkBoldedInRecord,
  checkNoCodebaseCounts,
  checkNoEmDash,
  checkNoToolListEnding,
  checkNumbersInRecord,
  checkOneEmployerPerClause,
  checkOpening,
  checkSentences,
  checkUsSpelling,
  checkWordCount,
  employerLookup,
  experienceRecord,
  runSummaryChecks,
} from '../src/modules/resumes/domain/summary-checks';
import type { RenderedResume } from '../src/modules/resumes/domain/resume';

const role = (company: string, from: string, bullets: string[], blurb: string | null = null) => ({
  company,
  title: 'Software Engineer',
  client: null,
  location: null,
  from,
  to: null,
  current: false,
  blurb,
  achievements: bullets.map((bullet) => ({ bullet })),
});

const resume = {
  contact: null,
  summaries: {},
  experiences: [
    role(
      'Dashdevs',
      '2023-10',
      [
        'Built and maintained 16 partner integrations for card issuing on NestJS and PostgreSQL.',
        'Implemented EMV 3-D Secure flows and passed 2 PCI DSS audits.',
        'Tech stack: Node.js | TypeScript | NestJS | PostgreSQL | Docker',
      ],
      'Card issuing platform for banks.',
    ),
    role('Ciklum', '2023-01', [
      'Authenticated analysts through SAML and OAuth into domain services fed by Apache Kafka.',
      'Tech stack: Node.js | TypeScript | Kafka | Jest',
    ]),
    role('Mavelich Web', '2019-08', [
      'Built the Express and Sequelize backend over PostgreSQL with a 135-model schema and more than 200 migrations.',
      'Tech stack: Node.js | TypeScript | Express | Sequelize | JWT | Mocha | Chai',
    ]),
  ],
  projects: [],
  educations: [],
  skills: [
    'Node.js',
    'TypeScript',
    'NestJS',
    'PostgreSQL',
    'Kafka',
    'Docker',
    'Jest',
    'Mocha',
    'Chai',
    'SAML',
    'OAuth',
    'JWT',
    'Express',
  ].map((name) => ({ name, category: 'Core' })),
} as unknown as RenderedResume;

const record = experienceRecord(resume, new Date('2026-11-05'));

/** Passes all 10. */
const GOOD = [
  'Senior backend engineer with 7 years in **TypeScript** and **Node.js**, building card payment and banking systems.',
  'At Dashdevs, built and maintained 16 partner integrations for card issuing on **NestJS** and **PostgreSQL**, and implemented EMV 3-D Secure flows for issuing banks.',
  'Passed 2 PCI DSS audits on that platform, keeping card data compliant and secure through every release and partner launch.',
  'At Ciklum, authenticated analysts through **SAML** and **OAuth** into services fed by **Apache Kafka**, giving investigators one secure way into their case tools.',
].join(' ');

/**
 * The known-bad case: must fail the em dash, sentence length, British spelling,
 * mixed employer and tool list checks. (A stand-in until the original summary
 * this case came from is pasted in.)
 */
const KNOWN_BAD = [
  'Senior backend engineer with 7 years in **TypeScript** and **Node.js** — building payment systems that optimise card issuing for banks and fintech partners across Europe, with 16 partner integrations on **NestJS** and **PostgreSQL** delivered under strict deadlines and regulatory scrutiny over several launches.',
  'Secured services with OAuth, SAML and JWT through 2 PCI DSS audits.',
  'Tested every service with Jest, Mocha and Chai.',
].join(' ');

test('the record lists each employer with its own text, and the technologies it knows', () => {
  assert.deepEqual(
    record.employers.map((entry) => entry.employer),
    ['Dashdevs', 'Ciklum', 'Mavelich Web'],
  );
  assert.match(record.text, /^Professional experience since 2019 \(about 7 years\)\./);
  assert.match(record.text, /<role employer="Dashdevs" title="Software Engineer" dates="Oct 2023 - ">/);
  assert.ok(record.technologies.includes('Sequelize'), 'tech stack lines count');
  assert.ok(record.technologies.includes('SAML'), 'the skills section counts');
});

test('the lookup maps technologies and numbers to employers, and skips general skills', () => {
  const lookup = employerLookup(record);
  assert.deepEqual(lookup('SAML'), ['Ciklum']);
  assert.deepEqual(lookup('PostgreSQL'), ['Dashdevs', 'Mavelich Web']);
  assert.deepEqual(lookup('16', true), ['Dashdevs']);
  assert.deepEqual(lookup('200', true), ['Mavelich Web']);
  assert.equal(lookup('2', true)?.join(), 'Dashdevs', '2 is not read inside 200 or 2023');
  assert.equal(lookup('TypeScript'), null, 'under every employer: a general skill');
  assert.equal(lookup('Terraform'), null, 'not in the record');
});

test('a summary that follows the instructions passes all 10 checks', () => {
  const failed = runSummaryChecks(GOOD, record).filter((check) => !check.ok);
  assert.deepEqual(failed, []);
});

test('the known-bad summary fails the em dash, sentence length, British spelling, mixed employer and tool list checks', () => {
  const failed = new Set(
    runSummaryChecks(KNOWN_BAD, record)
      .filter((check) => !check.ok)
      .map((check) => check.id),
  );
  for (const id of ['em-dash', 'sentences', 'us-spelling', 'one-employer-per-clause', 'tool-list-ending'])
    assert.ok(failed.has(id), `${id} should fail`);
});

test('1. word count is 80 to 120', () => {
  assert.equal(checkWordCount(GOOD).ok, true);
  const short = checkWordCount('Senior engineer with 7 years.');
  assert.equal(short.ok, false);
  assert.match(short.detail!, /5 words/);
  assert.equal(checkWordCount(Array(121).fill('word').join(' ')).ok, false);
  assert.equal(checkWordCount('**Bold** counts as one word.').ok, false);
});

test('2. 3 or 4 sentences, each at most 35 words', () => {
  assert.equal(checkSentences(GOOD).ok, true);
  assert.match(checkSentences('One sentence. Two sentences.').detail!, /2 sentences/);
  assert.match(checkSentences('A. B. C. D. E.').detail!, /5 sentences/);
  const long = `${Array(36).fill('word').join(' ')}. Second one. Third one.`;
  assert.match(checkSentences(long).detail!, /sentence 1 has 36 words/);
  assert.equal(
    checkSentences('Built **Node.js** services. Ran 99.9% uptime. Shipped it.').ok,
    true,
    'dots inside names and numbers do not end a sentence',
  );
});

test('3. the first sentence has a job title and "years"', () => {
  assert.equal(checkOpening(GOOD).ok, true);
  assert.match(checkOpening('Backend specialist with 7 years. More.').detail!, /job title/);
  assert.match(checkOpening('Senior developer in Node.js. Has 7 years.').detail!, /"years"/);
  assert.equal(checkOpening('Software architect with 10 years of systems.').ok, true);
});

test('4. no em dash', () => {
  assert.equal(checkNoEmDash(GOOD).ok, true);
  assert.equal(checkNoEmDash('Built it — fast.').ok, false);
  assert.equal(checkNoEmDash('From 2019–2021, built it - fast.').ok, true, 'en dashes and hyphens are fine');
});

test('5. no British -ise or -isation spellings, with the allowlist', () => {
  assert.equal(checkUsSpelling(GOOD).ok, true);
  const british = checkUsSpelling(
    'Optimised queries and led the modernisation; normalising data; organisations.',
  );
  assert.equal(british.ok, false);
  for (const word of ['Optimised', 'modernisation', 'normalising', 'organisations'])
    assert.match(british.detail!, new RegExp(word));
  assert.equal(
    checkUsSpelling(
      'Enterprise expertise; advised and promised; raising standards; otherwise precise; advertising platforms.',
    ).ok,
    true,
  );
  assert.equal(checkUsSpelling('Optimized the organization.').ok, true);
});

test('6. no schema or codebase counts', () => {
  assert.equal(checkNoCodebaseCounts(GOOD).ok, true);
  for (const text of [
    'A schema of 135 models.',
    'Wrote 200 migrations.',
    'Built 40 React components.',
    'Published 12 npm packages.',
    'A 135-model schema.',
  ])
    assert.equal(checkNoCodebaseCounts(text).ok, false, text);
  assert.equal(checkNoCodebaseCounts('Served 4 card networks.').ok, true);
});

test('7. every bolded technology is in the record', () => {
  assert.equal(checkBoldedInRecord(GOOD, record).ok, true);
  const invented = checkBoldedInRecord('Built on **Terraform** and **NestJS**.', record);
  assert.equal(invented.ok, false);
  assert.match(invented.detail!, /Terraform/);
  assert.doesNotMatch(invented.detail!, /NestJS/);
});

test('8. every number is in the record', () => {
  assert.equal(checkNumbersInRecord(GOOD, record).ok, true);
  const invented = checkNumbersInRecord('Built 16 integrations serving 40 banks.', record);
  assert.equal(invented.ok, false);
  assert.match(invented.detail!, /40/);
  assert.equal(checkNumbersInRecord('Built 6 integrations.', record).ok, false, '6 is not read inside 16');
});

test('9. one employer per clause', () => {
  assert.equal(checkOneEmployerPerClause(GOOD, record).ok, true);
  const mixed = checkOneEmployerPerClause(
    'Secured services through SAML and JWT in 2 PCI DSS audits.',
    record,
  );
  assert.equal(mixed.ok, false);
  for (const item of ['SAML: Ciklum', 'JWT: Mavelich Web', '2: Dashdevs'])
    assert.ok(mixed.detail!.includes(item), item);
  assert.equal(
    checkOneEmployerPerClause('Built 16 integrations on NestJS and PostgreSQL.', record).ok,
    true,
    'PostgreSQL is also at Mavelich, but Dashdevs holds all three',
  );
  assert.equal(
    checkOneEmployerPerClause('Built Node.js services on TypeScript with SAML.', record).ok,
    true,
    'general skills do not count as an employer',
  );
  assert.equal(
    checkOneEmployerPerClause('Built 16 integrations, and used SAML for analysts.', record).ok,
    true,
    'separate clauses may name separate employers',
  );
});

test('10. no sentence ends in a list of 3 or more tools', () => {
  assert.equal(checkNoToolListEnding(GOOD, record).ok, true);
  assert.equal(checkNoToolListEnding('Tested every service with Jest, Mocha and Chai.', record).ok, false);
  assert.equal(checkNoToolListEnding('Shipped on Docker, Kafka, and **PostgreSQL**.', record).ok, false);
  assert.equal(
    checkNoToolListEnding('Tested with Jest and Mocha.', record).ok,
    true,
    'two tools is not a list',
  );
  assert.equal(
    checkNoToolListEnding('Used Jest, Mocha and Chai to cut regressions by half.', record).ok,
    true,
    'a result after the tools',
  );
});
