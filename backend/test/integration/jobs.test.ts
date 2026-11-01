import { createUser, migrateTestDatabase, prisma } from './setup';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import type { LlmService } from '../../src/llm/llm.service';
import { JobCaptureService } from '../../src/jobs/job-capture.service';
import { JobReaderService } from '../../src/jobs/job-reader.service';
import { JobsService } from '../../src/jobs/jobs.service';

/** The model is never called here: every capture below carries JSON-LD. */
const noModel = {
  complete: () => Promise.reject(new Error('The model should not be called in this test.')),
} as unknown as LlmService;

const jobs = new JobsService(prisma);
const capturing = new JobCaptureService(prisma, jobs, new JobReaderService(prisma, noModel));

const posting = (title: string) => [
  { '@type': 'JobPosting', title, hiringOrganization: { name: 'Acme' }, description: '<p>Build things.</p>' },
];

let user: Awaited<ReturnType<typeof createUser>>['user'];
let stranger: Awaited<ReturnType<typeof createUser>>['user'];

before(async () => {
  migrateTestDatabase();
  ({ user } = await createUser('Applicant'));
  ({ user: stranger } = await createUser('Stranger'));
});

after(() => prisma.$disconnect());

test('a capture with JSON-LD is read straight away', async () => {
  const { job, created } = await capturing.capture(user.id, {
    url: 'https://jobs.example.com/view/1?utm_source=x',
    jsonLd: posting('Backend Engineer'),
  });
  assert.equal(created, true);
  assert.equal(job.extraction, 'structured');
  assert.equal(job.title, 'Backend Engineer');
  assert.equal(job.company, 'Acme');
});

test('the same posting sent again updates it, keeping what you edited', async () => {
  const { job } = await capturing.capture(user.id, {
    url: 'https://jobs.example.com/view/2',
    jsonLd: posting('Old'),
  });
  await jobs.update(user.id, job.id, { title: 'My title' });

  const again = await capturing.capture(user.id, {
    url: 'https://jobs.example.com/view/2?utm_campaign=y',
    jsonLd: posting('New'),
  });
  assert.equal(again.created, false);
  assert.equal(again.job.id, job.id);
  assert.equal(again.job.title, 'My title');
});

test('a move is logged, and only the latest move can be undone', async () => {
  const { job } = await capturing.capture(user.id, {
    url: 'https://jobs.example.com/view/3',
    jsonLd: posting('X'),
  });

  const applied = await jobs.update(user.id, job.id, { status: JobStatus.APPLIED });
  const interview = await jobs.update(user.id, job.id, { status: JobStatus.INTERVIEW });
  assert.deepEqual(
    interview.history.map((e) => [e.from, e.to]),
    [
      ['applied', 'interview'],
      ['saved', 'applied'],
    ],
  );

  const same = await jobs.update(user.id, job.id, { status: JobStatus.INTERVIEW });
  assert.equal(same.history.length, 2, 'saving the same status records nothing');

  await assert.rejects(jobs.undoStatus(user.id, job.id, applied.history[0].id), ConflictException);
  const undone = await jobs.undoStatus(user.id, job.id, interview.history[0].id);
  assert.equal(undone.status, 'applied');
  assert.equal(undone.history.length, 1);
});

test("someone else's job is a 404", async () => {
  const { job } = await capturing.capture(user.id, {
    url: 'https://jobs.example.com/view/4',
    jsonLd: posting('Y'),
  });
  await assert.rejects(jobs.get(stranger.id, job.id), NotFoundException);
  await assert.rejects(jobs.update(stranger.id, job.id, { status: JobStatus.DISMISSED }), NotFoundException);
});

test('a pasted job with the same link as a saved one is refused', async () => {
  await assert.rejects(
    capturing.createManual(user.id, {
      description: 'Build things.',
      title: 'T',
      company: 'C',
      url: 'https://jobs.example.com/view/1',
    }),
    /already saved/,
  );
});

test('the list carries no page text or description', async () => {
  const list = await jobs.list(user.id);
  assert.ok(list.length >= 4);
  assert.ok(
    list.every((job) => !('description' in job) && !('pageText' in job) && 'tailoredResumeId' in job),
  );
  assert.ok((await jobs.list(user.id, JobStatus.APPLIED)).every((job) => job.status === 'applied'));
});
