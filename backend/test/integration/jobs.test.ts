import { createUser, migrateTestDatabase, prisma } from './setup';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { JobConflictError, JobNotFoundError } from '../../src/modules/jobs/application/errors';
import type { JobStatus } from '../../src/modules/jobs/domain/job';
import { CaptureJob, type CaptureInput } from '../../src/modules/jobs/application/use-cases/capture-job';
import {
  CreateManualJob,
  type ManualJobInput,
} from '../../src/modules/jobs/application/use-cases/create-manual-job';
import { GetJob } from '../../src/modules/jobs/application/use-cases/get-job';
import { ListJobs } from '../../src/modules/jobs/application/use-cases/list-jobs';
import { UpdateJob, type JobEdit } from '../../src/modules/jobs/application/use-cases/update-job';
import { UndoJobStatus } from '../../src/modules/jobs/application/use-cases/undo-job-status';
import { PrismaJobRepository } from '../../src/modules/jobs/adapters/outbound/persistence/prisma-job.repository';
import { JsonLdJobReader } from '../../src/modules/jobs/adapters/outbound/documents/json-ld-job.reader';
import { PublicResumeLinkReader } from '../../src/modules/jobs/adapters/outbound/modules/resume-link.reader';
import {
  presentJob,
  presentJobDetail,
  presentJobSummary,
} from '../../src/modules/jobs/adapters/inbound/http/jobs.presenter';
import { PrismaResumeRepository } from '../../src/modules/resumes/adapters/outbound/persistence/prisma-resume.repository';

/** The model is never called here: every capture below carries JSON-LD. */
const scheduler = {
  enqueue: () => {
    throw new Error('Structured jobs should not queue AI reading.');
  },
};
const repository = new PrismaJobRepository(prisma);
const resumes = new PrismaResumeRepository(prisma);
const get = new GetJob(repository);
const update = new UpdateJob(repository);
const undo = new UndoJobStatus(repository);
const list = new ListJobs(
  repository,
  new PublicResumeLinkReader({ latestIdsForJobs: (userId, ids) => resumes.latestIdsForJobs(userId, ids) }),
);
const capture = new CaptureJob(repository, new JsonLdJobReader(), scheduler);
const manual = new CreateManualJob(repository, scheduler);
const jobs = {
  get: (userId: string, id: string) => get.execute(userId, id).then(presentJobDetail),
  update: (userId: string, id: string, edit: JobEdit) =>
    update.execute(userId, id, edit).then(presentJobDetail),
  undoStatus: (userId: string, id: string, eventId: string) =>
    undo.execute(userId, id, eventId).then(presentJobDetail),
  list: async (userId: string, status?: JobStatus) =>
    (await list.execute(userId, status)).map(({ job, tailoredResumeId }) =>
      presentJobSummary(job, tailoredResumeId),
    ),
};
const capturing = {
  capture: async (userId: string, input: CaptureInput) => {
    const { job, created } = await capture.execute(userId, input);
    return { job: presentJob(job), created };
  },
  createManual: (userId: string, input: ManualJobInput) => manual.execute(userId, input).then(presentJob),
};

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

  const applied = await jobs.update(user.id, job.id, { status: 'applied' });
  const interview = await jobs.update(user.id, job.id, { status: 'interview' });
  assert.deepEqual(
    interview.history.map((e) => [e.from, e.to]),
    [
      ['applied', 'interview'],
      ['saved', 'applied'],
    ],
  );

  const same = await jobs.update(user.id, job.id, { status: 'interview' });
  assert.equal(same.history.length, 2, 'saving the same status records nothing');

  await assert.rejects(jobs.undoStatus(user.id, job.id, applied.history[0].id), JobConflictError);
  const undone = await jobs.undoStatus(user.id, job.id, interview.history[0].id);
  assert.equal(undone.status, 'applied');
  assert.equal(undone.history.length, 1);
});

test("someone else's job is a 404", async () => {
  const { job } = await capturing.capture(user.id, {
    url: 'https://jobs.example.com/view/4',
    jsonLd: posting('Y'),
  });
  await assert.rejects(jobs.get(stranger.id, job.id), JobNotFoundError);
  await assert.rejects(jobs.update(stranger.id, job.id, { status: 'dismissed' }), JobNotFoundError);
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
  assert.ok((await jobs.list(user.id, 'applied')).every((job) => job.status === 'applied'));
});
