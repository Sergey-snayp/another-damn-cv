import { createUser, migrateTestDatabase, prisma } from './setup';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Job as StoredJob, Prisma, PrismaClient } from '@prisma/client';
import { JobConflictError, JobNotFoundError } from '../../src/modules/jobs/application/errors';
import { CaptureJob } from '../../src/modules/jobs/application/use-cases/capture-job';
import { GetJob } from '../../src/modules/jobs/application/use-cases/get-job';
import { UpdateJob } from '../../src/modules/jobs/application/use-cases/update-job';
import { UndoJobStatus } from '../../src/modules/jobs/application/use-cases/undo-job-status';
import { DeleteJob } from '../../src/modules/jobs/application/use-cases/delete-job';
import { ReadJobPage } from '../../src/modules/jobs/application/use-cases/read-job-page';
import { PrismaJobRepository } from '../../src/modules/jobs/adapters/outbound/persistence/prisma-job.repository';
import { JsonLdJobReader } from '../../src/modules/jobs/adapters/outbound/documents/json-ld-job.reader';
import { presentJob, presentJobDetail } from '../../src/modules/jobs/adapters/inbound/http/jobs.presenter';
import { queuedJobs, structuredPosting } from '../fixtures/jobs-clean';

const jobs = new PrismaJobRepository(prisma);
const queue = queuedJobs();
const capture = new CaptureJob(jobs, new JsonLdJobReader(), queue);
let owner: Awaited<ReturnType<typeof createUser>>;
let stranger: Awaited<ReturnType<typeof createUser>>;

before(async () => {
  migrateTestDatabase();
  owner = await createUser('Clean jobs owner');
  stranger = await createUser('Clean jobs stranger');
});
after(() => prisma.$disconnect());

function create(suffix: string) {
  return capture.execute(owner.user.id, {
    url: `https://jobs.example.com/clean/${owner.user.id}/${suffix}`,
    jsonLd: structuredPosting(),
  });
}

/** Fails the write after an event was changed, inside a real Postgres transaction. */
function failingJobWrite() {
  const database = {
    $transaction: (work: (transaction: Prisma.TransactionClient) => Promise<StoredJob>) =>
      prisma.$transaction((transaction) =>
        work({
          jobStatusEvent: transaction.jobStatusEvent,
          job: { update: () => Promise.reject(new Error('Injected job write failure.')) },
        } as unknown as Prisma.TransactionClient),
      ),
  } as unknown as PrismaClient;
  return new PrismaJobRepository(database);
}

test('clean job detail matches the recorded response fields and history', async () => {
  const { job } = await create('detail');
  await new UpdateJob(jobs).execute(owner.user.id, job.id, {
    title: 'My title',
    remote: false,
    status: 'interview',
  });
  const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
  const events = await prisma.jobStatusEvent.findMany({ where: { jobId: job.id } });
  const expected = {
    id: job.id,
    source: 'extension',
    status: 'interview',
    extraction: 'structured',
    extractionError: null,
    url: `https://jobs.example.com/clean/${owner.user.id}/detail`,
    title: 'My title',
    company: 'Example',
    location: null,
    remote: false,
    employmentType: null,
    salary: null,
    postedAt: null,
    description: 'Build reliable systems.',
    pageTitle: null,
    editedFields: ['title', 'remote'],
    capturedAt: row.capturedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    history: [{ id: events[0].id, from: 'saved', to: 'interview', at: events[0].at.toISOString() }],
  };
  assert.deepEqual(presentJobDetail(await new GetJob(jobs).execute(owner.user.id, job.id)), expected);
  await assert.rejects(new GetJob(jobs).execute(stranger.user.id, job.id), JobNotFoundError);
  await assert.rejects(new GetJob(jobs).execute(owner.user.id, 'missing'), JobNotFoundError);
});

test('capture maps JSON/nulls correctly and recapture preserves fields while pending', async () => {
  const { job } = await create('capture');
  await new UpdateJob(jobs).execute(owner.user.id, job.id, { title: null, salary: 'Known salary' });
  const pending = await capture.execute(owner.user.id, {
    url: `${job.url!}?utm_source=again`,
    text: 'New page text.',
  });
  assert.equal(pending.created, false);
  assert.equal(pending.job.id, job.id);
  assert.equal(pending.job.title, null);
  assert.equal(pending.job.salary, 'Known salary');
  assert.equal(pending.job.description, 'Build reliable systems.');
  const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(row.structuredData, null);
  assert.equal(row.extraction, 'PENDING');
  assert.deepEqual(presentJob(pending.job), {
    id: job.id,
    source: 'extension',
    status: 'saved',
    extraction: 'pending',
    extractionError: null,
    url: `${job.url!}?utm_source=again`,
    title: null,
    company: 'Example',
    location: null,
    remote: null,
    employmentType: null,
    salary: 'Known salary',
    postedAt: null,
    description: 'Build reliable systems.',
    pageTitle: null,
    editedFields: ['title', 'salary'],
    capturedAt: row.capturedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
});

test('mixed edits and status event commit together; same status adds no event; undo stays latest-only', async () => {
  const { job } = await create('status');
  const update = new UpdateJob(jobs);
  const first = await update.execute(owner.user.id, job.id, { title: 'Edited', status: 'applied' });
  await prisma.jobStatusEvent.update({
    where: { id: first.history[0].id },
    data: { at: new Date('2026-10-01') },
  });
  const next = await update.execute(owner.user.id, job.id, { company: null, status: 'interview' });
  const same = await update.execute(owner.user.id, job.id, { status: 'interview' });
  assert.equal(same.history.length, 2);
  assert.deepEqual(
    same.history.map((event) => [event.from, event.to]),
    [
      ['applied', 'interview'],
      ['saved', 'applied'],
    ],
  );
  const undo = new UndoJobStatus(jobs);
  await assert.rejects(undo.execute(owner.user.id, job.id, first.history[0].id), JobConflictError);
  const result = await undo.execute(owner.user.id, job.id, next.history[0].id);
  assert.equal(result.job.status, 'applied');
  assert.equal(result.job.title, 'Edited');
  assert.equal(result.job.company, null);
  assert.equal(result.history.length, 1);
});

test('a failed mixed job write rolls its event back in Postgres', async () => {
  const { job } = await create('rollback-update');
  await assert.rejects(
    failingJobWrite().update(
      owner.user.id,
      job.id,
      { title: 'Must not save', status: 'applied' },
      { from: 'saved', to: 'applied' },
    ),
    /Injected job write failure/,
  );
  const row = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(row.status, 'SAVED');
  assert.equal(row.title, 'Engineer');
  assert.equal(await prisma.jobStatusEvent.count({ where: { jobId: job.id } }), 0);
});

test('a failed undo restores its deleted event in Postgres', async () => {
  const { job } = await create('rollback-undo');
  const changed = await new UpdateJob(jobs).execute(owner.user.id, job.id, { status: 'applied' });
  const eventId = changed.history[0].id;
  await assert.rejects(
    failingJobWrite().undoStatus(owner.user.id, job.id, eventId),
    /Injected job write failure/,
  );
  assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).status, 'APPLIED');
  assert.ok(await prisma.jobStatusEvent.findUnique({ where: { id: eventId } }));
});

test('worker writes mapped fields without overwriting a user edit and pending lookup recovers it', async () => {
  const { job } = await capture.execute(owner.user.id, {
    url: `https://jobs.example.com/clean/${owner.user.id}/worker`,
    text: 'Employer text.',
  });
  assert.ok((await jobs.pendingIds()).includes(job.id));
  await new UpdateJob(jobs).execute(owner.user.id, job.id, { title: 'My title' });
  await new ReadJobPage(jobs, {
    extract: () =>
      Promise.resolve({
        fields: { title: 'Model title', company: 'Read company', description: 'Employer text.' },
      }),
  }).execute(job.id);
  const stored = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
  assert.equal(stored.title, 'My title');
  assert.equal(stored.company, 'Read company');
  assert.equal(stored.extraction, 'LLM');
  assert.ok(!(await jobs.pendingIds()).includes(job.id));
});

test('deleting a job cascades its events and unlinks its resume copy without deleting the resume', async () => {
  const { job } = await create('delete');
  await new UpdateJob(jobs).execute(owner.user.id, job.id, { status: 'applied' });
  const copy = await prisma.resume.create({
    data: { profileId: owner.profile.id, name: 'Keep this copy', jobId: job.id },
  });
  await assert.rejects(new DeleteJob(jobs).execute(stranger.user.id, job.id), JobNotFoundError);
  await new DeleteJob(jobs).execute(owner.user.id, job.id);
  assert.equal(await prisma.job.findUnique({ where: { id: job.id } }), null);
  assert.equal(await prisma.jobStatusEvent.count({ where: { jobId: job.id } }), 0);
  assert.equal((await prisma.resume.findUniqueOrThrow({ where: { id: copy.id } })).jobId, null);
});
