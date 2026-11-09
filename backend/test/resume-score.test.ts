import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scoreResume } from '../src/modules/resumes/domain/resume-score';
import {
  BULLET_RULES,
  RECRUITER_RULES,
  withoutAddedPurpose,
} from '../src/modules/resumes/domain/cv-writing-guide';

const resume = {
  contact: { email: 'a@b.c', phone: '1', location: 'Vancouver', linkedin: 'x' },
  summaries: { default: 'Backend engineer.' },
  experiences: [
    {
      lineageId: 'r1',
      title: 'Engineer',
      company: 'Acme',
      from: '2020',
      current: true,
      blurb: '',
      techStack: 'Node.js',
      achievements: [{ bullet: 'Built payment APIs in TypeScript.' }],
    },
  ],
  educations: [{ institution: 'U', degree: 'BSc', field: 'CS' }],
  skills: ['Node.js', 'TypeScript', 'Docker', 'PostgreSQL', 'AWS'].map((name) => ({ name })),
  projects: [],
  certifications: [],
  customSections: [],
};

test('a keyword named only in the skills list is called out: it counts for less than one shown in work', () => {
  const score = scoreResume(resume as never, 'Requirements: Node.js, TypeScript and Docker.');
  assert.deepEqual(score.keywords?.matched.sort(), ['Docker', 'Node.js', 'TypeScript']);
  assert.deepEqual(
    score.keywords?.skillsOnly,
    ['Docker'],
    'Node.js is in a tech stack, TypeScript in a bullet',
  );
  assert.ok(
    score.issues.some(
      (issue) => issue.section === 'experience' && /Docker is only in your skills list/.test(issue.message),
    ),
  );
});

test('bullets are written for a non-technical recruiter and the search filters', () => {
  assert.match(BULLET_RULES, /NON-TECHNICAL RECRUITER/);
  assert.doesNotMatch(RECRUITER_RULES, /at most 2/, 'a bullet may show its mechanism');
  assert.match(BULLET_RULES, /One piece of work per bullet, told fully/);
  assert.match(BULLET_RULES, /before and after/);
  assert.match(
    BULLET_RULES,
    /Never use their names, numbers, tools or outcomes/,
    'examples from other fields are style only',
  );
  assert.match(RECRUITER_RULES, /Never guess what a name is/);
});

test('a benefit the facts do not state is cut; one they do state stays', () => {
  const facts =
    'slack alerts + monitoring for prod. secrets in aws secrets manager. fewer outages after the retry fix';
  assert.equal(
    withoutAddedPurpose(
      'Set up Slack alerts and monitoring for production issues to speed up incident response.',
      facts,
    ),
    'Set up Slack alerts and monitoring for production issues.',
  );
  assert.equal(
    withoutAddedPurpose(
      'Stored application secrets in AWS Secrets Manager instead of hardcoding credentials.',
      facts,
    ),
    'Stored application secrets in AWS Secrets Manager.',
  );
  assert.equal(
    withoutAddedPurpose('Added retry logic and cleanup steps for reliability.', facts),
    'Added retry logic and cleanup steps.',
  );
  assert.equal(
    withoutAddedPurpose('Fixed the retry logic, reducing outages after the fix.', facts),
    'Fixed the retry logic, reducing outages after the fix.',
    'the facts say there were fewer outages',
  );
  assert.equal(withoutAddedPurpose('Built payment APIs.', facts), 'Built payment APIs.');
  assert.doesNotMatch(RECRUITER_RULES, /Intercard/, 'no example the AI could copy as a fact');
});
