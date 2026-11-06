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
import { PDF_RENDERER } from '../../src/modules/resumes/resumes.tokens';
import { ClaudeProcessRunner } from '../../src/shared/ai/claude-process.runner';

let app: INestApplication;
let base: string;
let owner: Awaited<ReturnType<typeof createUser>>, other: Awaited<ReturnType<typeof createUser>>;
let ownerToken: string, otherToken: string;
const prompts: string[] = [];
const printed: string[] = [];
let answer = '';

function call(
  path: string,
  options: { method?: string; body?: unknown; token?: string; user?: string } = {},
) {
  return fetch(`${base}/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.token && { authorization: `Bearer ${options.token}` }),
      ...(options.user && { 'x-test-user': options.user }),
      ...(options.body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  });
}

before(async () => {
  migrateTestDatabase();
  owner = await createUser('Letter Owner');
  other = await createUser('Letter Other');
  [ownerToken, otherToken] = [`token-${randomUUID()}`, `token-${randomUUID()}`];
  await prisma.user.update({ where: { id: owner.user.id }, data: { syncToken: ownerToken } });
  await prisma.user.update({ where: { id: other.user.id }, data: { syncToken: otherToken } });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JOB_READ_SCHEDULER)
    .useValue({ enqueue: () => {} })
    .overrideProvider(ClaudeProcessRunner)
    .useValue({
      complete: (prompt: string) => {
        prompts.push(prompt);
        return Promise.resolve(answer);
      },
      onApplicationShutdown: () => undefined,
    })
    // The server's Chrome stands in: it keeps the page it was given and returns a tiny PDF.
    .overrideProvider(PDF_RENDERER)
    .useValue({
      render: () => Promise.reject(new Error('not used')),
      renderHtml: (html: string) => {
        printed.push(html);
        return Promise.resolve(Buffer.from('%PDF-1.4 letter'));
      },
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

async function cvAndJob(
  description: string | null = 'Senior Backend Engineer. Node.js, PostgreSQL, payments.',
) {
  const created = (await (
    await call('/resumes', { method: 'POST', user: owner.user.id, body: { name: 'Letter CV' } })
  ).json()) as { id: string };
  const role = randomUUID();
  await call(`/resumes/${created.id}/save`, {
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
      experiences: [{ lineageId: role, company: 'Acme', title: 'Engineer', from: '2020-01', current: true }],
      achievements: [
        {
          lineageId: randomUUID(),
          experienceLineageId: role,
          bullet: 'Built 16 payment integrations on Node.js and PostgreSQL.',
        },
      ],
      skills: [{ name: 'Node.js' }],
    },
  });
  const job = await prisma.job.create({
    data: {
      userId: owner.user.id,
      source: 'MANUAL',
      extraction: 'MANUAL',
      editedFields: [],
      title: 'Senior Backend Engineer',
      company: 'Pay & Co',
      description,
    },
  });
  return { resumeId: created.id, jobId: job.id };
}

test('a cover letter is written for a saved job from the chosen CV, kept, edited and printed', async () => {
  const { resumeId, jobId } = await cvAndJob();
  const path = `/extension/jobs/${jobId}/cover-letter`;
  assert.deepEqual(await (await call(path, { token: ownerToken })).json(), { letter: null });

  answer = JSON.stringify({
    letter:
      'Dear Pay & Co team,\n\nAt Acme I built 16 payment integrations — on **Node.js** and PostgreSQL, serving 40 banks.\n\nSincerely,\nSam Lee',
    cannotClaim: ['Kafka'],
  });
  const written = await call(path, {
    method: 'POST',
    token: ownerToken,
    body: { resumeId, instruction: 'Stress payments' },
  });
  assert.equal(written.status, 200);
  const letter = (await written.json()) as {
    text: string;
    fileName: string;
    resumeId: string;
    cannotClaim: string[];
    warnings: string[];
  };
  assert.equal(
    letter.text,
    'Dear Pay & Co team,\n\nAt Acme I built 16 payment integrations, on Node.js and PostgreSQL, serving 40 banks.\n\nSincerely,\nSam Lee',
    'paragraphs kept; em dashes and bold markers removed',
  );
  assert.equal(letter.fileName, 'Sam_Lee_Cover_Letter_Pay_Co.pdf');
  assert.equal(letter.resumeId, resumeId);
  assert.deepEqual(letter.cannotClaim, ['Kafka']);
  assert.match(letter.warnings[0], /40/, 'a number the CV does not state is flagged');
  const prompt = prompts.at(-1)!;
  assert.match(prompt, /<job_description>\nJob title: Senior Backend Engineer\nCompany: Pay & Co\n/);
  assert.match(prompt, /<experience>[\s\S]*Built 16 payment integrations[\s\S]*<\/experience>/);
  assert.match(prompt, /<candidate>\nName: Sam Lee\nBased in: Warsaw\n<\/candidate>/);
  assert.match(prompt, /<candidate_request>\nStress payments/);

  const kept = (await (await call(path, { token: ownerToken })).json()) as { letter: { text: string } };
  assert.equal(kept.letter.text, letter.text);

  const edited = await call(path, {
    method: 'PUT',
    token: ownerToken,
    body: { text: 'Dear team,\n\nMy own words.' },
  });
  assert.equal(edited.status, 200);
  assert.equal(((await edited.json()) as { text: string }).text, 'Dear team,\n\nMy own words.');

  const pdf = await call(`${path}/pdf`, { token: ownerToken });
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get('content-disposition') ?? '', /Sam_Lee_Cover_Letter_Pay_Co\.pdf/);
  assert.equal(Buffer.from(await pdf.arrayBuffer()).toString(), '%PDF-1.4 letter');
  const page = printed.at(-1)!;
  assert.match(page, /<h1>Sam Lee<\/h1>/);
  assert.match(page, /\+48 600<span class="sep"> \| <\/span>sam@example\.com/);
  assert.match(page, /<p>Dear team,<\/p>\n<p>My own words\.<\/p>/);
});

test('cover letters stay with their owner, and need a job description and valid input', async () => {
  const { resumeId, jobId } = await cvAndJob();
  const path = `/extension/jobs/${jobId}/cover-letter`;
  assert.equal((await call(path, { token: otherToken })).status, 404, "another person's job");
  assert.equal((await call(path)).status, 401, 'no sync token');
  assert.equal((await call(path, { method: 'POST', token: otherToken, body: { resumeId } })).status, 404);
  assert.equal((await call(`${path}/pdf`, { token: ownerToken })).status, 404, 'no letter yet');
  assert.equal((await call(path, { method: 'PUT', token: ownerToken, body: { text: 'x' } })).status, 404);
  assert.equal((await call(path, { method: 'POST', token: ownerToken, body: {} })).status, 400);

  const empty = await cvAndJob(null);
  const noDescription = await call(`/extension/jobs/${empty.jobId}/cover-letter`, {
    method: 'POST',
    token: ownerToken,
    body: { resumeId: empty.resumeId },
  });
  assert.equal(noDescription.status, 400);
  assert.match(((await noDescription.json()) as { message: string }).message, /no description/);

  answer = 'Sorry.';
  const broken = await call(path, { method: 'POST', token: ownerToken, body: { resumeId } });
  assert.equal(broken.status, 503, 'no letter after one retry: try again');
});
