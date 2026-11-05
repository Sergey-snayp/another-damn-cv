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
      contact: { firstName: 'Sam', lastName: 'Lee', email: 'sam@example.com', phone: '+48 600', location: 'Warsaw' },
      experiences: [{ lineageId: role, company: 'Acme', title: 'Engineer', from: '2020', current: true }],
      achievements: [
        { lineageId: bullet, experienceLineageId: role, bullet: 'Responsible for Node.js APIs on PostgreSQL with Docker.' },
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
  assert.ok(score.issues.some((issue) => issue.kind === 'keyword' && issue.section === 'skills' && /Kafka/.test(issue.message)));
  assert.ok(score.issues.some((issue) => issue.section === 'header' && /LinkedIn/.test(issue.message)));
  assert.ok(score.issues.some((issue) => issue.section === 'experience' && /Responsible for/.test(issue.message)));
  assert.ok(score.issues.some((issue) => issue.section === 'skills' && /at least 5 skills/.test(issue.message)));

  const tracked = (await (
    await call('/jobs', { method: 'POST', user: owner.user.id, body: { title: 'Tracked job', description: JOB } })
  ).json()) as { id: string };
  const fromTracker = (await (
    await call(`/resumes/${id}/score`, { method: 'POST', user: owner.user.id, body: { jobId: tracked.id } })
  ).json()) as { score: number; job: { id: string } };
  assert.equal(fromTracker.job.id, tracked.id);
  assert.equal(fromTracker.score, score.score);

  assert.equal(
    (await call(`/resumes/${id}/score`, { method: 'POST', user: other.user.id, body: { description: JOB } })).status,
    404,
    "another person's CV cannot be scored",
  );
  assert.equal(
    (await call(`/resumes/${id}/score`, { method: 'POST', user: owner.user.id, body: { description: 'short' } })).status,
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
      { target: 'bullet', lineageId: bullet, after: 'Built Node.js APIs on PostgreSQL with Docker.', reason: 'Active verb.' },
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
    await call(`/resumes/${id}/chat`, { method: 'POST', user: owner.user.id, body: { messages: [{ role: 'user', text: 'Hi' }] } })
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
