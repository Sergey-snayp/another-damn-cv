import { prisma, migrateTestDatabase, createUser } from './setup';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from '../../src/app.module';
import { JOB_READ_SCHEDULER } from '../../src/modules/jobs/jobs.tokens';
import { ClaudeProcessRunner } from '../../src/shared/ai/claude-process.runner';

let app: INestApplication;
let base: string;
let owner: Awaited<ReturnType<typeof createUser>>, other: Awaited<ReturnType<typeof createUser>>;
const prompts: string[] = [];
let answer = '';

function call(path: string, options: { method?: string; body?: unknown; user?: string } = {}) {
  return fetch(`${base}/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.user && { 'x-test-user': options.user }),
      ...(options.body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  });
}

before(async () => {
  migrateTestDatabase();
  owner = await createUser('Assistant Owner');
  other = await createUser('Assistant Other');
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JOB_READ_SCHEDULER)
    .useValue({ enqueue: () => {} })
    // The model stands in: it records the prompt and returns the answer set by the test.
    .overrideProvider(ClaudeProcessRunner)
    .useValue({
      complete: (prompt: string) => {
        prompts.push(prompt);
        return Promise.resolve(answer);
      },
      onApplicationShutdown: () => undefined,
    })
    .compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.use((req: Request, _response: Response, next: NextFunction) => {
    const id = req.headers['x-test-user'];
    Object.assign(req, { session: typeof id === 'string' ? { userId: id } : {} });
    next();
  });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
after(async () => {
  await app?.close();
  await prisma.$disconnect();
});

const JOB = `Senior Backend Engineer

Requirements:
- Node.js and TypeScript
- PostgreSQL
- Kafka
- Docker and Kubernetes`;

async function cv() {
  const created = (await (
    await call('/resumes', { method: 'POST', user: owner.user.id, body: { name: 'Assistant CV' } })
  ).json()) as { id: string };
  const role = randomUUID();
  const bullet = randomUUID();
  const saved = await call(`/resumes/${created.id}/save`, {
    method: 'POST',
    user: owner.user.id,
    body: {
      contact: {
        firstName: 'Sam',
        lastName: 'Lee',
        email: 'sam@example.com',
        phone: '+48 600',
        location: 'Warsaw',
      },
      experiences: [{ lineageId: role, company: 'Acme', title: 'Engineer', from: '2020', current: true }],
      achievements: [
        {
          lineageId: bullet,
          experienceLineageId: role,
          bullet: 'Responsible for Node.js APIs on PostgreSQL with Docker.',
        },
      ],
      skills: [{ name: 'Node.js' }, { name: 'TypeScript' }],
      summaries: [{ variant: 'default', text: 'Backend engineer.' }],
    },
  });
  assert.equal(saved.status, 201);
  return { id: created.id, bullet };
}

test('Resume Score: keywords from a pasted job, CV checks with the section they belong to', async () => {
  const { id } = await cv();
  const response = await call(`/resumes/${id}/score`, {
    method: 'POST',
    user: owner.user.id,
    body: { title: 'Senior Backend Engineer', description: JOB },
  });
  assert.equal(response.status, 200);
  const score = (await response.json()) as {
    score: number;
    keywords: { matched: string[]; missing: string[] };
    issues: Array<{ section: string; kind: string; message: string }>;
    job: { title: string };
  };
  assert.deepEqual(score.keywords.missing.sort(), ['Kafka', 'Kubernetes']);
  assert.ok(score.keywords.matched.includes('PostgreSQL'), 'a skill named in a bullet counts');
  assert.ok(score.score > 0 && score.score < 100);
  assert.equal(score.job.title, 'Senior Backend Engineer');
  assert.ok(
    score.issues.some(
      (issue) => issue.kind === 'keyword' && issue.section === 'skills' && /Kafka/.test(issue.message),
    ),
  );
  assert.ok(score.issues.some((issue) => issue.section === 'header' && /LinkedIn/.test(issue.message)));
  assert.ok(
    score.issues.some((issue) => issue.section === 'experience' && /Responsible for/.test(issue.message)),
  );
  assert.ok(
    score.issues.some((issue) => issue.section === 'skills' && /at least 5 skills/.test(issue.message)),
  );

  const tracked = (await (
    await call('/jobs', {
      method: 'POST',
      user: owner.user.id,
      body: { title: 'Tracked job', description: JOB },
    })
  ).json()) as { id: string };
  const fromTracker = (await (
    await call(`/resumes/${id}/score`, { method: 'POST', user: owner.user.id, body: { jobId: tracked.id } })
  ).json()) as { score: number; job: { id: string } };
  assert.equal(fromTracker.job.id, tracked.id);
  assert.equal(fromTracker.score, score.score);

  assert.equal(
    (await call(`/resumes/${id}/score`, { method: 'POST', user: other.user.id, body: { description: JOB } }))
      .status,
    404,
    "another person's CV cannot be scored",
  );
  assert.equal(
    (
      await call(`/resumes/${id}/score`, {
        method: 'POST',
        user: owner.user.id,
        body: { description: 'short' },
      })
    ).status,
    400,
  );
});

test('AI Settings are kept per CV and reach the chat; the chat only suggests changes to real CV text', async () => {
  const { id, bullet } = await cv();
  assert.deepEqual(await (await call(`/resumes/${id}/ai-settings`, { user: owner.user.id })).json(), {
    tone: 'balanced',
    instructions: '',
  });
  const put = await call(`/resumes/${id}/ai-settings`, {
    method: 'PUT',
    user: owner.user.id,
    body: { tone: 'concise', instructions: 'Use British spelling.' },
  });
  assert.equal(put.status, 200);

  answer = JSON.stringify({
    reply: 'Lead with what you built.',
    suggestions: [
      {
        target: 'bullet',
        lineageId: bullet,
        after: 'Built Node.js APIs on PostgreSQL with Docker.',
        reason: 'Active verb.',
      },
      { target: 'bullet', lineageId: randomUUID(), after: 'A bullet that is not on the CV.' },
      { target: 'add-skill', after: 'Docker', reason: 'Named in a bullet.' },
      { target: 'add-skill', after: 'Kafka', reason: 'The job asks for it.' },
    ],
  });
  const response = await call(`/resumes/${id}/chat`, {
    method: 'POST',
    user: owner.user.id,
    body: { messages: [{ role: 'user', text: 'Make my bullets stronger.' }], job: { description: JOB } },
  });
  assert.equal(response.status, 200);
  const chat = (await response.json()) as {
    reply: string;
    suggestions: Array<{ target: string; before: string; after: string; where: string }>;
  };
  assert.equal(chat.reply, 'Lead with what you built.');
  assert.deepEqual(
    chat.suggestions.map((s) => [s.target, s.after]),
    [
      ['bullet', 'Built Node.js APIs on PostgreSQL with Docker.'],
      ['add-skill', 'Docker'],
    ],
    'a suggestion for text not on the CV, or a skill the CV does not show, is dropped',
  );
  assert.equal(chat.suggestions[0].before, 'Responsible for Node.js APIs on PostgreSQL with Docker.');
  assert.equal(chat.suggestions[0].where, 'Engineer at Acme');
  const prompt = prompts.at(-1)!;
  assert.match(prompt, /Use British spelling\./);
  assert.match(prompt, /one line per bullet/);
  assert.match(prompt, /Kafka/);
  assert.match(prompt, new RegExp(`\\[bullet ${bullet}\\]`));

  answer = 'Plain prose, no JSON.';
  const prose = (await (
    await call(`/resumes/${id}/chat`, {
      method: 'POST',
      user: owner.user.id,
      body: { messages: [{ role: 'user', text: 'Hi' }] },
    })
  ).json()) as { reply: string; suggestions: unknown[] };
  assert.deepEqual(prose, { reply: 'Plain prose, no JSON.', suggestions: [] });

  answer = JSON.stringify({ suggestion: 'Built Node.js APIs.', cannotDo: [] });
  await call(`/resumes/${id}/rewrite`, {
    method: 'POST',
    user: owner.user.id,
    body: { text: 'Responsible for Node.js APIs.', instruction: 'shorter' },
  });
  assert.match(prompts.at(-1)!, /Use British spelling\./, 'the ✦ rewrite follows the AI Settings too');
});

test('Quick tailoring: one copy per job with the source design, and lines tailored to that job', async () => {
  const { id } = await cv();
  const design = {
    template: 'professional',
    accent: '#000000',
    fontFamily: 'Roboto, Arial, sans-serif',
    fontSize: 10,
    lineHeight: 1.3,
    sectionGap: 12,
    hiddenSections: ['education'],
    nameSize: 26,
  };
  assert.equal(
    (await call(`/resumes/${id}/theme`, { method: 'PUT', user: owner.user.id, body: design })).status,
    200,
  );
  const job = (await (
    await call('/jobs', {
      method: 'POST',
      user: owner.user.id,
      body: { title: 'Payments Engineer', company: 'Paymorrow', description: JOB },
    })
  ).json()) as { id: string };

  const first = await call(`/jobs/${job.id}/tailor-copy`, {
    method: 'POST',
    user: owner.user.id,
    body: { sourceResumeId: id },
  });
  assert.equal(first.status, 200);
  const { resumeId } = (await first.json()) as { resumeId: string };
  assert.notEqual(resumeId, id, 'the CV itself is left as it is');
  const nameOf = async (cvId: string) =>
    (
      (await (await call('/resumes', { user: owner.user.id })).json()) as Array<{ id: string; name: string }>
    ).find((row) => row.id === cvId)?.name;
  assert.equal(await nameOf(resumeId), 'Sam_Lee_CV_Paymorrow_Payments_Engineer');
  assert.equal(await nameOf(id), 'Assistant CV', 'the source keeps its own name');
  await prisma.resume.update({ where: { id: resumeId }, data: { name: 'Payments Engineer — Paymorrow' } });
  const again = (await (
    await call(`/jobs/${job.id}/tailor-copy`, {
      method: 'POST',
      user: owner.user.id,
      body: { sourceResumeId: id },
    })
  ).json()) as { resumeId: string };
  assert.equal(again.resumeId, resumeId, 'the same job reuses its copy');
  assert.equal(
    await nameOf(resumeId),
    'Sam_Lee_CV_Paymorrow_Payments_Engineer',
    'an existing automatically named copy adopts the convention',
  );
  await call(`/resumes/${resumeId}/name`, {
    method: 'PATCH',
    user: owner.user.id,
    body: { name: 'My reviewed application CV' },
  });
  await call(`/jobs/${job.id}/tailor-copy`, {
    method: 'POST',
    user: owner.user.id,
    body: { sourceResumeId: id },
  });
  assert.equal(
    await nameOf(resumeId),
    'My reviewed application CV',
    'a custom name is preserved on reopening',
  );
  const copied = (await (await call(`/resumes/${resumeId}/theme`, { user: owner.user.id })).json()) as {
    theme: { hiddenSections: string[] };
  };
  assert.deepEqual(
    copied.theme.hiddenSections,
    ['education'],
    'the copy keeps the design and its hidden sections',
  );
  assert.equal((copied.theme as { nameSize?: number }).nameSize, 26, 'and the name size');
  const tooBig = await call(`/resumes/${id}/theme`, {
    method: 'PUT',
    user: owner.user.id,
    body: { ...design, nameSize: 90 },
  });
  assert.equal(tooBig.status, 400, 'a name size outside 16–48pt is refused');
  assert.equal(
    (await call(`/jobs/${job.id}/tailor-copy`, { method: 'POST', user: other.user.id, body: {} })).status,
    404,
  );

  answer = JSON.stringify({ suggestion: 'Built payment APIs on Node.js and PostgreSQL.', cannotDo: [] });
  const line = await call(`/resumes/${resumeId}/tailor-line`, {
    method: 'POST',
    user: owner.user.id,
    body: {
      text: 'Responsible for Node.js APIs.',
      kind: 'bullet',
      context: 'Engineer at Acme',
      job: { jobId: job.id },
    },
  });
  assert.equal(line.status, 200);
  assert.deepEqual(await line.json(), {
    original: 'Responsible for Node.js APIs.',
    suggestion: 'Built payment APIs on Node.js and PostgreSQL.',
    cannotDo: [],
  });
  const prompt = prompts.at(-1)!;
  assert.match(prompt, /Payments Engineer at Paymorrow/);
  assert.match(prompt, /Docker and Kubernetes/);
  assert.match(prompt, /Engineer at Acme/);
  assert.match(prompt, /Add none it does not have/);
});

test('a CV can be deleted by its owner: its versions and PDF go, a job applied with it stays', async () => {
  const { id } = await cv();
  const job = (await (
    await call('/jobs', {
      method: 'POST',
      user: owner.user.id,
      body: { title: 'Applied job', description: JOB },
    })
  ).json()) as { id: string };
  await prisma.job.update({
    where: { id: job.id },
    data: { applicationResumeId: id, applicationSnapshot: 1 },
  });
  await prisma.resumePdf.create({
    data: { resumeId: id, version: '1:x:3', fileName: 'Sam_Lee_Resume.pdf', pdf: new Uint8Array([1]) },
  });

  assert.equal(
    (await call(`/resumes/${id}`, { method: 'DELETE', user: other.user.id })).status,
    404,
    "someone else's CV is not deleted",
  );
  assert.equal((await call(`/resumes/${id}`, { method: 'DELETE', user: owner.user.id })).status, 204);

  assert.equal((await call(`/resumes/${id}`, { user: owner.user.id })).status, 404);
  assert.equal(await prisma.snapshot.count({ where: { resumeId: id } }), 0);
  assert.equal(await prisma.experienceEntry.count({ where: { resumeId: id } }), 0);
  assert.equal(await prisma.resumePdf.count({ where: { resumeId: id } }), 0);
  const kept = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(kept.applicationResumeId, null, 'the job stays, without the deleted CV');
  const list = (await (await call('/resumes', { user: owner.user.id })).json()) as Array<{ id: string }>;
  assert.ok(!list.some((item) => item.id === id));
});

test('Quick Tailor skills: only adds, at the end of a line, and only what the CV shows', async () => {
  const { id } = await cv();
  answer = JSON.stringify({
    groups: [
      { category: 'Languages', add: ['Docker', 'TypeScript', 'Terraform', 'NestJS'] },
      { category: 'Not a line on the CV', add: ['Go'] },
    ],
    cannotDo: ['Kafka is not on the CV.'],
  });
  const response = await call(`/resumes/${id}/tailor-skills`, {
    method: 'POST',
    user: owner.user.id,
    body: {
      groups: [{ category: 'Languages', skills: ['Node.js', 'TypeScript', 'COBOL'] }],
      elsewhere: ['NestJS'],
      job: { description: JOB },
    },
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    groups: Array<{ category: string; skills: string[]; added: string[]; dropped: string[] }>;
    cannotDo: string[];
  };
  assert.deepEqual(body.groups, [
    {
      category: 'Languages',
      // The line keeps its skills in their order. Docker is in a bullet of the CV: it comes in at the
      // end. TypeScript is already there, Terraform is not on the CV, NestJS is on another line, and
      // the unknown line is ignored.
      skills: ['Node.js', 'TypeScript', 'COBOL', 'Docker'],
      added: ['Docker'],
      dropped: [],
    },
  ]);
  assert.deepEqual(body.cannotDo, ['Kafka is not on the CV.']);
  assert.match(prompts.at(-1)!, /Languages: Node\.js, TypeScript, COBOL/);
  assert.equal(
    (
      await call(`/resumes/${id}/tailor-skills`, {
        method: 'POST',
        user: other.user.id,
        body: { groups: [{ category: '', skills: ['a'] }], job: { description: JOB } },
      })
    ).status,
    404,
  );
});

test('Quick Tailor summary: written from the instructions, checked in code, failures sent back at most twice', async () => {
  const { id } = await cv();
  const before = prompts.length;
  answer = JSON.stringify({
    summary: 'Engineer — optimised **Node.js** APIs on **PostgreSQL** with **Docker**.',
    word_count: 9,
    mapping: [
      { item: 'Node.js', type: 'required', evidence: 'optimised Node.js APIs', employer: 'Acme' },
      { item: 'Kafka', type: 'required', evidence: 'NO EVIDENCE', employer: null },
    ],
    gaps: ['Kafka and event-driven systems'],
    deciding_gap: 'Kafka and event-driven systems',
  });
  const response = await call(`/resumes/${id}/tailor-summary`, {
    method: 'POST',
    user: owner.user.id,
    body: { instruction: 'Stress payments', job: { description: JOB } },
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    original: string;
    summary: string;
    wordCount: number;
    mapping: unknown[];
    gaps: string[];
    decidingGap: string | null;
    failedChecks: Array<{ id: string; name: string; detail?: string }>;
    attempts: number;
  };
  assert.equal(body.original, 'Backend engineer.');
  assert.equal(body.summary, 'Engineer — optimised **Node.js** APIs on **PostgreSQL** with **Docker**.');
  assert.equal(body.wordCount, 8, 'counted in code');
  assert.deepEqual(body.gaps, ['Kafka and event-driven systems']);
  assert.equal(body.decidingGap, 'Kafka and event-driven systems');
  assert.equal(body.mapping.length, 2);
  assert.equal(body.attempts, 3, 'the same failures every time: 3 attempts, then stop');
  assert.equal(prompts.length, before + 3);
  const failed = body.failedChecks.map((check) => check.id);
  for (const id of ['word-count', 'em-dash', 'us-spelling', 'opening']) assert.ok(failed.includes(id), id);

  const first = prompts[before];
  assert.match(first, /<job_description>[\s\S]*Node\.js and TypeScript[\s\S]*<\/job_description>/);
  assert.match(
    first,
    /<experience>\nProfessional experience since 2020[\s\S]*<role employer="Acme"[\s\S]*Responsible for Node\.js APIs on PostgreSQL with Docker\.[\s\S]*<\/experience>/,
  );
  assert.match(first, /<candidate_request>\nStress payments/);
  assert.match(prompts.at(-1)!, /<previous_answer>/);
  assert.match(prompts.at(-1)!, /- No em dashes: 1 em dash/);

  // Not valid JSON twice: an error to try again, not a broken summary.
  answer = 'Sorry, I cannot.';
  const broken = await call(`/resumes/${id}/tailor-summary`, {
    method: 'POST',
    user: owner.user.id,
    body: { job: { description: JOB } },
  });
  assert.equal(broken.status, 503);
  assert.match(((await broken.json()) as { message: string }).message, /did not return a valid summary/);
  assert.equal(
    (
      await call(`/resumes/${id}/tailor-summary`, {
        method: 'POST',
        user: other.user.id,
        body: { job: { description: JOB } },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await call(`/resumes/${id}/tailor-line`, {
        method: 'POST',
        user: owner.user.id,
        body: { text: 'Backend engineer.', kind: 'summary', job: { description: JOB } },
      })
    ).status,
    400,
    'summaries are written by the summary writer only',
  );

  // Each kind of line gets its own part of the writing guide.
  answer = JSON.stringify({ suggestion: 'Built Node.js APIs.', cannotDo: [] });
  for (const [kind, rules] of [
    ['bullet', /HOW TO WRITE A BULLET/],
    ['blurb', /HOW TO WRITE A JOB'S DESCRIPTION LINE/],
    ['headline', /HOW TO WRITE THE HEADLINE/],
  ] as const) {
    const line = await call(`/resumes/${id}/tailor-line`, {
      method: 'POST',
      user: owner.user.id,
      body: { text: 'Responsible for Node.js APIs.', kind, job: { description: JOB } },
    });
    assert.equal(line.status, 200, kind);
    assert.match(prompts.at(-1)!, rules, kind);
  }
  const empty = await call(`/resumes/${id}/tailor-line`, {
    method: 'POST',
    user: owner.user.id,
    body: { text: '  ', kind: 'bullet', job: { description: JOB } },
  });
  assert.equal(empty.status, 400);
});

test('Quick Tailor passes the request typed in the card to the AI, under the same rules', async () => {
  const { id } = await cv();
  answer = JSON.stringify({ suggestion: 'Built Node.js APIs.', cannotDo: [] });
  const line = await call(`/resumes/${id}/tailor-line`, {
    method: 'POST',
    user: owner.user.id,
    body: {
      text: 'Responsible for Node.js APIs.',
      kind: 'bullet',
      instruction: 'Make it shorter',
      job: { description: JOB },
    },
  });
  assert.equal(line.status, 200);
  assert.match(
    prompts.at(-1)!,
    /The candidate's request for this change \(follow it within the rules above\): Make it shorter/,
  );
  assert.match(prompts.at(-1)!, /Add none it does not have/, 'the rules still come first');

  answer = JSON.stringify({
    groups: [{ category: 'Languages', add: [] }],
    cannotDo: [],
  });
  const skills = await call(`/resumes/${id}/tailor-skills`, {
    method: 'POST',
    user: owner.user.id,
    body: {
      groups: [{ category: 'Languages', skills: ['Node.js', 'TypeScript'] }],
      instruction: 'Backend first',
      job: { description: JOB },
    },
  });
  assert.equal(skills.status, 200);
  assert.deepEqual(
    ((await skills.json()) as { groups: unknown[] }).groups,
    [{ category: 'Languages', skills: ['Node.js', 'TypeScript'], added: [], dropped: [] }],
    'nothing to add leaves the line exactly as it was',
  );
  assert.match(
    prompts.at(-1)!,
    /The candidate's request for this change \(follow it within the rules above\): Backend first/,
  );
  const tooLong = await call(`/resumes/${id}/tailor-line`, {
    method: 'POST',
    user: owner.user.id,
    body: { text: 'Line.', kind: 'bullet', instruction: 'x'.repeat(501), job: { description: JOB } },
  });
  assert.equal(tooLong.status, 400);
});

test('a technology on the CV is described once by the AI, then read from the saved note', async () => {
  const { id } = await cv();
  const before = prompts.length;
  answer = '"PostgreSQL is an open-source relational database for storing and querying structured data."';
  const first = await call(`/resumes/${id}/technology?name=${encodeURIComponent(' PostgreSQL ')}`, {
    user: owner.user.id,
  });
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), {
    name: 'PostgreSQL',
    description: 'PostgreSQL is an open-source relational database for storing and querying structured data.',
  });
  assert.equal(prompts.length, before + 1);
  assert.match(
    prompts.at(-1)!,
    /Engineer at Acme: Responsible for Node\.js APIs on PostgreSQL/,
    'the CV line shows which one is meant',
  );

  answer = 'Something else entirely.';
  const again = await call(`/resumes/${id}/technology?name=postgresql`, { user: owner.user.id });
  assert.equal(
    ((await again.json()) as { description: string }).description.startsWith('PostgreSQL is'),
    true,
  );
  assert.equal(prompts.length, before + 1, 'a saved note is not written again');

  assert.equal((await call(`/resumes/${id}/technology?name=`, { user: owner.user.id })).status, 400);
  assert.equal((await call(`/resumes/${id}/technology?name=Kafka`, { user: other.user.id })).status, 404);
  answer = '   ';
  assert.equal((await call(`/resumes/${id}/technology?name=Kafka`, { user: owner.user.id })).status, 400);
});

test('job advice uses full saved Profile evidence independently of CVs and creates no documents or PDFs', async () => {
  const { id } = await cv();
  const tracked = await call('/jobs', {
    method: 'POST',
    user: owner.user.id,
    body: { title: 'Backend Engineer', company: 'Acme', description: JOB },
  });
  assert.equal(tracked.status, 201);
  const job = (await tracked.json()) as { id: string };
  const state = (await (await call('/profile/career', { user: owner.user.id })).json()) as {
    revision: number;
  };
  const profileRole = {
    company: 'Full Profile Employer',
    title: 'Lead Engineer',
    client: 'Payments Client',
    location: 'Remote',
    from: '2018',
    to: '',
    current: true,
    description: 'This detailed role description is saved only in Profile.',
    bullets: [
      'Implemented Node.js and TypeScript services for payment reconciliation.',
      'Mentored engineers across the platform team.',
    ],
  };
  const saved = await call('/profile/career', {
    method: 'PUT',
    user: owner.user.id,
    body: {
      expectedRevision: state.revision,
      sections: {
        experiences: [profileRole],
        skills: ['Node.js', 'TypeScript'],
        educations: [
          { institution: 'Backend Training', degree: '', field: 'Distributed systems', from: '', to: '' },
        ],
      },
    },
  });
  assert.equal(saved.status, 200);
  const profile = (await saved.json()) as {
    revision: number;
    data: { experiences: { source: { kind: string } } };
  };
  assert.equal(profile.data.experiences.source.kind, 'profile');
  const before = {
    documents: await prisma.resume.count({ where: { profileId: owner.profile.id } }),
    versions: await prisma.snapshot.count({ where: { resumeId: id } }),
    pdfs: await prisma.resumePdf.count({ where: { resumeId: id } }),
    cv: await (await call('/resumes/' + id, { user: owner.user.id })).json(),
  };
  answer = JSON.stringify({
    verdict: 'apply',
    score: 8,
    technologies: ['TypeScript', 'Kubernetes', 'Invented Tech'],
    summary:
      'I would apply. Your full Profile shows relevant backend delivery and team mentoring; clarify the infrastructure scope.',
    strengths: [
      {
        point: 'Your payment services match this backend role.',
        jobQuote: 'Node.js and TypeScript',
        profileQuote: profileRole.bullets[0],
      },
    ],
    gaps: [
      {
        point: 'Kubernetes operations are not shown in your Profile.',
        jobQuote: 'Docker and Kubernetes',
        importance: 'required',
      },
    ],
    questions: ['How much Kubernetes ownership is expected?'],
  });
  const modelCalls = prompts.length;
  const assess = (user = owner.user.id, body: unknown = { jobId: job.id }) =>
    call('/profile/job-assessment', { method: 'POST', user, body });
  const response = await assess();
  assert.equal(response.status, 200);
  const assessment = (await response.json()) as {
    verdict: string;
    score: number;
    technologies: unknown;
    basis: unknown;
  };
  assert.equal(assessment.verdict, 'apply');
  assert.equal(assessment.score, 8);
  assert.deepEqual(assessment.technologies, [
    { name: 'TypeScript', inProfile: true },
    { name: 'Kubernetes', inProfile: false },
  ]);
  assert.deepEqual(assessment.basis, { source: 'profile', profileRevision: profile.revision, jobId: job.id });
  assert.equal(prompts.length, modelCalls + 1);
  assert.match(prompts.at(-1)!, /full Profile|full.*Profile|Profile/);
  for (const detail of [
    profileRole.description,
    profileRole.bullets[1],
    profileRole.client,
    'Distributed systems',
  ])
    assert.ok(prompts.at(-1)!.includes(detail));
  assert.ok(
    !prompts.at(-1)!.includes('Responsible for Node.js APIs on PostgreSQL with Docker.'),
    'the selected CV content is never read into the recommendation',
  );
  assert.equal((await assess()).status, 200);
  assert.equal(prompts.length, modelCalls + 1, 'unchanged Profile reuses the assessment');
  assert.equal(
    (await call('/profile/job-assessment', { method: 'POST', body: { jobId: job.id } })).status,
    401,
  );
  assert.equal(
    (await assess(other.user.id)).status,
    404,
    'a different account cannot assess this private job',
  );
  assert.equal((await assess(owner.user.id, {})).status, 400);
  assert.equal(
    (await assess(owner.user.id, { jobId: job.id, resumeId: id })).status,
    400,
    'no selected CV is accepted as an assessment source',
  );
  assert.equal(prompts.length, modelCalls + 1);
  const changed = await call('/profile/career', {
    method: 'PUT',
    user: owner.user.id,
    body: {
      expectedRevision: profile.revision,
      sections: {
        experiences: [{ ...profileRole, bullets: [...profileRole.bullets, 'Improved platform monitoring.'] }],
      },
    },
  });
  assert.equal(changed.status, 200);
  assert.equal((await assess()).status, 200);
  assert.equal(prompts.length, modelCalls + 2, 'saving Profile changes invalidates the old assessment');
  assert.ok(prompts.at(-1)!.includes('Improved platform monitoring.'));
  assert.equal(await prisma.resume.count({ where: { profileId: owner.profile.id } }), before.documents);
  assert.equal(await prisma.snapshot.count({ where: { resumeId: id } }), before.versions);
  assert.equal(await prisma.resumePdf.count({ where: { resumeId: id } }), before.pdfs);
  assert.deepEqual(await (await call('/resumes/' + id, { user: owner.user.id })).json(), before.cv);
});

test('an empty Profile asks for details even with a populated CV, and editing needs no CV', async () => {
  const created = (await (
    await call('/resumes', { method: 'POST', user: other.user.id, body: { name: 'CV with evidence' } })
  ).json()) as { id: string };
  assert.equal(
    (
      await call('/resumes/' + created.id + '/save', {
        method: 'POST',
        user: other.user.id,
        body: {
          summaries: [
            { variant: 'default', text: 'Experienced backend engineer with PostgreSQL and Node.js.' },
          ],
        },
      })
    ).status,
    201,
  );
  const job = (await (
    await call('/jobs', {
      method: 'POST',
      user: other.user.id,
      body: { title: 'Backend Engineer', description: JOB },
    })
  ).json()) as { id: string };
  const before = prompts.length;
  const response = await call('/profile/job-assessment', {
    method: 'POST',
    user: other.user.id,
    body: { jobId: job.id },
  });
  assert.equal(response.status, 200);
  const advice = (await response.json()) as { verdict: string; summary: string };
  assert.equal(advice.verdict, 'unclear');
  assert.match(advice.summary, /Profile has no career details/);
  assert.equal(prompts.length, before, 'CV evidence is never a fallback');
  const fresh = await createUser('Profile Without CVs');
  const write = (body: unknown, user: string | undefined = fresh.user.id) =>
    call('/profile/career', { method: 'PUT', user, body });
  const details = {
    expectedRevision: 0,
    sections: {
      summary: 'Profile-only engineer.',
      experiences: [
        {
          title: 'Engineer',
          company: 'Profile Co',
          client: '',
          location: '',
          from: '2020',
          to: '',
          current: true,
          description: 'All responsibilities.',
          bullets: ['Shipped reliable Node.js services.'],
        },
      ],
    },
  };
  assert.equal((await write(details)).status, 200);
  assert.equal((await write(details)).status, 409, 'a stale editor cannot overwrite newer profile changes');
  assert.equal((await write({ expectedRevision: 1, sections: {} })).status, 400);
  assert.equal((await call('/profile/career', { method: 'PUT', body: details })).status, 401);
  assert.equal(
    (await write({ expectedRevision: 1, sections: { experiences: [] } })).status,
    200,
    'explicit empty lists clear a section',
  );
  assert.equal(await prisma.resume.count({ where: { profileId: fresh.profile.id } }), 0);
});
