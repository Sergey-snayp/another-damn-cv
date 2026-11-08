import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkedStack } from '../src/modules/resumes/domain/resume-assistant';
import { tailorPrompt } from '../src/modules/resumes/adapters/outbound/ai/tailoring/prompt';
import { experienceRecord } from '../src/modules/resumes/domain/summary-checks';

const ownLines =
  'Senior Software Engineer at Ciklum\nBuilt payment APIs on Node.js with Kafka events and PostgreSQL.';

test("a tailored tech stack keeps its tools, adds only what the job's own lines show, as a list", () => {
  assert.deepEqual(
    checkedStack('Kafka, Node.js, TypeScript, PostgreSQL, Go.', 'Node.js, TypeScript', ownLines),
    {
      list: 'Kafka, Node.js, TypeScript, PostgreSQL',
      notes: ["Go left out: this job's lines do not show it."],
    },
  );
  assert.deepEqual(
    checkedStack('Tech stack: Node.js and TypeScript', 'Node.js, TypeScript', ownLines).list,
    'Node.js, TypeScript',
    'no label, no "and"',
  );
  assert.deepEqual(
    checkedStack('', 'Node.js, TypeScript', ownLines).list,
    'Node.js, TypeScript',
    'nothing back: the list as it was',
  );
});

test('the tech stack reaches full tailoring as a fact list and the summary record as technologies', () => {
  const resume = {
    summaries: { default: '' },
    contact: null,
    experiences: [
      {
        lineageId: 'r1',
        title: 'Engineer',
        company: 'Acme',
        client: null,
        location: null,
        from: '2021',
        to: null,
        current: true,
        blurb: '',
        techStack: 'Node.js, Kafka',
        achievements: [{ lineageId: 'b1', bullet: 'Built APIs.', position: 0 }],
      },
    ],
    skills: [],
    educations: [],
  };
  const { prompt } = tailorPrompt(
    resume as never,
    { title: 'Engineer', company: 'X', description: 'Node.js' } as never,
  );
  assert.match(prompt, /<tech_stack>Node\.js, Kafka<\/tech_stack>/);
  const record = experienceRecord(resume as never, new Date('2026-11-07'));
  assert.ok(record.technologies.includes('Kafka'));
  assert.match(record.text, /Tech stack: Node\.js, Kafka/);
});

test('a Profile job keeps its tech stack: saved, read from a CV, and seen by the job assessment', async () => {
  const { careerUpdateSchema, careerDataSchema } = await import(
    '../src/modules/profiles/adapters/career.schemas'
  );
  const { ResumeSectionsAdapter } = await import(
    '../src/modules/profiles/adapters/outbound/resume-sections.reader'
  );
  const { assessmentEvidence } = await import('../src/modules/resumes/domain/job-assessment');
  const role = {
    company: 'Ciklum',
    title: 'Senior Software Engineer',
    client: '',
    location: '',
    from: '2024-10',
    to: '',
    current: true,
    description: '',
    bullets: ['Built payment APIs.'],
  };
  const saved = careerUpdateSchema.parse({
    expectedRevision: 1,
    sections: { experiences: [{ ...role, techStack: '  Node.js, Kafka ' }] },
  });
  assert.equal(saved.sections.experiences?.[0]?.techStack, 'Node.js, Kafka');
  assert.ok(
    careerDataSchema.parse({ experiences: { value: [role], source: { kind: 'profile' }, importedAt: 'x' } }),
    'older saves without a tech stack still read',
  );

  const cv = {
    summaries: { default: '' },
    experiences: [
      {
        ...role,
        blurb: '',
        techStack: 'Node.js, Kafka',
        achievements: [{ bullet: 'Built payment APIs.' }],
      },
    ],
    educations: [],
    skills: [],
  };
  const sections = await new ResumeSectionsAdapter({ current: () => Promise.resolve(cv as never) }).read(
    'u',
    'cv',
  );
  assert.deepEqual(sections.experiences[0]?.bullets, ['Built payment APIs.'], 'not a bullet any more');
  assert.equal(sections.experiences[0]?.techStack, 'Node.js, Kafka');

  const evidence = assessmentEvidence({
    summary: '',
    experiences: [{ ...role, techStack: 'Node.js, Kafka' }],
    educations: [],
    skills: [],
  });
  assert.match(evidence, /Tech stack: Node\.js, Kafka/);
});
