import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CaptureJob } from '../src/modules/jobs/application/use-cases/capture-job';
import { CreateManualJob } from '../src/modules/jobs/application/use-cases/create-manual-job';
import { DeleteJob } from '../src/modules/jobs/application/use-cases/delete-job';
import { ListJobs } from '../src/modules/jobs/application/use-cases/list-jobs';
import { RereadJob } from '../src/modules/jobs/application/use-cases/reread-job';
import { UndoJobStatus } from '../src/modules/jobs/application/use-cases/undo-job-status';
import { UpdateJob } from '../src/modules/jobs/application/use-cases/update-job';
import { JobConflictError, JobInputError, JobNotFoundError } from '../src/modules/jobs/application/errors';
import { JsonLdJobReader } from '../src/modules/jobs/adapters/outbound/documents/json-ld-job.reader';
import { presentJobSummary } from '../src/modules/jobs/adapters/inbound/http/jobs.presenter';
import {
  captureSchema,
  jobEditSchema,
  manualJobSchema,
} from '../src/modules/jobs/adapters/inbound/http/jobs.schemas';
import { exampleJob, jobTime, MemoryJobs, queuedJobs, structuredPosting } from './fixtures/jobs-clean';

test('mixed field/status edits stay one write, preserve existing protections, and only moves add an event', async () => {
  const jobs = new MemoryJobs(exampleJob({ editedFields: ['company'] }));
  const update = new UpdateJob(jobs);
  const result = await update.execute('owner', 'job-1', { title: null, remote: false, status: 'interview' });
  assert.deepEqual(result.job.editedFields, ['company', 'title', 'remote']);
  assert.deepEqual(
    result.history.map((event) => [event.from, event.to]),
    [['saved', 'interview']],
  );
  assert.equal(jobs.updates.length, 1);
  assert.deepEqual(jobs.updates[0].changes, {
    title: null,
    remote: false,
    editedFields: ['company', 'title', 'remote'],
    status: 'interview',
  });
  assert.deepEqual(jobs.updates[0].statusChange, { from: 'saved', to: 'interview' });
  const same = await update.execute('owner', 'job-1', { status: 'interview' });
  assert.equal(same.history.length, 1);
  assert.equal(jobs.updates[1].statusChange, undefined);
  const backwards = await update.execute('owner', 'job-1', { status: 'saved' });
  assert.equal(backwards.job.status, 'saved');
});

test('undo only removes the latest event, including events at the same time', async () => {
  const jobs = new MemoryJobs(exampleJob());
  const update = new UpdateJob(jobs);
  await update.execute('owner', 'job-1', { status: 'applied' });
  await update.execute('owner', 'job-1', { status: 'interview' });
  const undo = new UndoJobStatus(jobs);
  await assert.rejects(undo.execute('owner', 'job-1', 'event-1'), JobConflictError);
  const result = await undo.execute('owner', 'job-1', 'event-2');
  assert.equal(result.job.status, 'applied');
  assert.deepEqual(
    result.history.map((event) => event.id),
    ['event-1'],
  );
  await assert.rejects(undo.execute('owner', 'job-1', 'event-2'), JobConflictError);
});

test('foreign jobs cannot be edited, undone, deleted or reread', async () => {
  const jobs = new MemoryJobs(exampleJob());
  const scheduler = queuedJobs();
  const actions = [
    () => new UpdateJob(jobs).execute('stranger', 'job-1', { status: 'applied' }),
    () => new UndoJobStatus(jobs).execute('stranger', 'job-1', 'event-1'),
    () => new DeleteJob(jobs).execute('stranger', 'job-1'),
    () => new RereadJob(jobs, new JsonLdJobReader(), scheduler).execute('stranger', 'job-1'),
  ];
  for (const action of actions) await assert.rejects(action(), JobNotFoundError);
  assert.equal(jobs.updates.length, 0);
  assert.equal(jobs.rows.size, 1);
  assert.deepEqual(scheduler.ids, []);
});

test('capture uses JSON-LD first, updates the same per-user URL, and protects edits', async () => {
  const jobs = new MemoryJobs();
  const scheduler = queuedJobs();
  const capture = new CaptureJob(jobs, new JsonLdJobReader(), scheduler, () => jobTime);
  const first = await capture.execute('owner', {
    url: 'https://jobs.example.com/1?utm_source=x',
    jsonLd: structuredPosting(),
    text: 'Other page text.',
  });
  assert.equal(first.created, true);
  assert.equal(first.job.extraction, 'structured');
  assert.equal(first.job.description, 'Build reliable systems.');
  await new UpdateJob(jobs).execute('owner', first.job.id, { title: 'My title', remote: false });
  const again = await capture.execute('owner', {
    url: 'https://jobs.example.com/1?utm_campaign=y',
    jsonLd: structuredPosting('New title'),
  });
  assert.equal(again.created, false);
  assert.equal(again.job.id, first.job.id);
  assert.equal(again.job.title, 'My title');
  assert.equal(again.job.remote, false);
  const otherUser = await capture.execute('stranger', { url: first.job.url!, jsonLd: structuredPosting() });
  assert.equal(otherUser.created, true);
  assert.notEqual(otherUser.job.id, first.job.id);
  assert.deepEqual(scheduler.ids, []);
});

test('pending recapture keeps all old fields until the new reading lands', async () => {
  const jobs = new MemoryJobs(
    exampleJob({ salary: 'Known salary', description: 'Old employer description.' }),
  );
  const scheduler = queuedJobs();
  const result = await new CaptureJob(jobs, new JsonLdJobReader(), scheduler).execute('owner', {
    url: 'https://jobs.example.com/1',
    text: ' New\r\n page  text. ',
  });
  assert.equal(result.created, false);
  assert.equal(result.job.description, 'Old employer description.');
  assert.equal(result.job.salary, 'Known salary');
  assert.equal(result.job.pageText, 'New\npage text.');
  assert.equal(result.job.extraction, 'pending');
  assert.deepEqual(scheduler.ids, ['job-1']);
});

test('a new text-only capture shows its raw description while pending, and empty captures fail without AI', async () => {
  const jobs = new MemoryJobs();
  const scheduler = queuedJobs();
  const capture = new CaptureJob(jobs, new JsonLdJobReader(), scheduler);
  const pending = await capture.execute('owner', {
    url: 'https://jobs.example.com/text',
    text: ' Job  text. ',
  });
  assert.equal(pending.job.description, 'Job text.');
  assert.equal(pending.job.extraction, 'pending');
  const empty = await capture.execute('owner', { url: 'https://jobs.example.com/empty' });
  assert.equal(empty.job.extraction, 'failed');
  assert.equal(empty.job.extractionError, 'Nothing readable was captured from that page.');
  assert.deepEqual(scheduler.ids, [pending.job.id]);
  await assert.rejects(capture.execute('owner', { url: 'file:///private/job' }), JobInputError);
});

test('manual jobs keep title/company protection, optional location behavior, and duplicate-link checks', async () => {
  const jobs = new MemoryJobs();
  const scheduler = queuedJobs();
  const create = new CreateManualJob(jobs, scheduler);
  const supplied = await create.execute('owner', {
    description: '  Build systems. ',
    title: 'Engineer',
    company: 'Example',
    location: 'Toronto',
    url: 'https://jobs.example.com/1?utm_source=x',
  });
  assert.equal(supplied.extraction, 'manual');
  assert.equal(supplied.description, 'Build systems.');
  assert.deepEqual(supplied.editedFields, ['title', 'company']);
  assert.deepEqual(scheduler.ids, []);
  await assert.rejects(
    create.execute('owner', { description: 'Same job.', url: 'https://jobs.example.com/1?utm_source=y' }),
    /already saved/,
  );
  await assert.rejects(
    create.execute('owner', { description: 'Bad URL.', url: 'invalid' }),
    /not a valid web address/,
  );
  const pending = await create.execute('owner', { description: 'Read this.', title: 'Known title' });
  assert.equal(pending.extraction, 'pending');
  assert.deepEqual(pending.editedFields, ['title']);
  assert.deepEqual(scheduler.ids, [pending.id]);
});

test('reread clears edits and prefers stored structured data before queuing AI', async () => {
  const jobs = new MemoryJobs(
    exampleJob({
      title: 'Edited title',
      editedFields: ['title'],
      structuredData: structuredPosting('Original title'),
    }),
  );
  const scheduler = queuedJobs();
  const reread = new RereadJob(jobs, new JsonLdJobReader(), scheduler);
  const structured = await reread.execute('owner', 'job-1');
  assert.equal(structured.job.title, 'Original title');
  assert.deepEqual(structured.job.editedFields, []);
  assert.equal(structured.job.extraction, 'structured');
  assert.deepEqual(scheduler.ids, []);
  jobs.rows.set('job-1', { ...structured.job, structuredData: null, editedFields: ['company'] });
  const pending = await reread.execute('owner', 'job-1');
  assert.equal(pending.job.title, 'Original title');
  assert.equal(pending.job.extraction, 'pending');
  assert.deepEqual(pending.job.editedFields, []);
  assert.deepEqual(scheduler.ids, ['job-1']);
  jobs.rows.set('job-1', { ...pending.job, pageText: null });
  await assert.rejects(reread.execute('owner', 'job-1'), /There is no captured page/);
});

test('list requests associated resume IDs through its port and omits private/page description fields', async () => {
  const jobs = new MemoryJobs(exampleJob(), exampleJob({ id: 'job-2', userId: 'stranger' }));
  const calls: unknown[] = [];
  const list = new ListJobs(jobs, {
    latestIdsForJobs: (userId, ids) => {
      calls.push({ userId, ids });
      return Promise.resolve({ 'job-1': 'copy-1' });
    },
  });
  const rows = await list.execute('owner', 'saved');
  assert.deepEqual(calls, [{ userId: 'owner', ids: ['job-1'] }]);
  assert.equal(rows.length, 1);
  const response = presentJobSummary(rows[0].job, rows[0].tailoredResumeId);
  assert.equal(response.tailoredResumeId, 'copy-1');
  for (const field of ['userId', 'canonicalUrl', 'description', 'html', 'pageText', 'structuredData'])
    assert.ok(!(field in response));
});

test('HTTP input schemas preserve null versus omitted fields and plain lower-case application status', () => {
  assert.deepEqual(
    jobEditSchema.parse({ title: '  ', company: ' Example ', remote: null, status: 'interview' }),
    { title: null, company: 'Example', remote: null, status: 'interview' },
  );
  assert.deepEqual(jobEditSchema.parse({}), {});
  assert.equal(
    captureSchema.safeParse({ url: 'https://jobs.example.com', html: 'x'.repeat(1_500_001) }).success,
    false,
  );
  assert.equal(manualJobSchema.safeParse({ description: '   ' }).success, false);
  assert.equal(jobEditSchema.safeParse({ status: 'hired' }).success, false);
});
