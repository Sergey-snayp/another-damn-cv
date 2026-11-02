import assert from 'node:assert/strict';
import { test } from 'node:test';
import { interviewScheduleProblem } from '../src/modules/jobs/domain/interview-schedule';
import { UpdateJob } from '../src/modules/jobs/application/use-cases/update-job';
import { RereadJob } from '../src/modules/jobs/application/use-cases/reread-job';
import { JsonLdJobReader } from '../src/modules/jobs/adapters/outbound/documents/json-ld-job.reader';
import { JobInputError, JobNotFoundError } from '../src/modules/jobs/application/errors';
import { exampleJob, MemoryJobs, queuedJobs, structuredPosting } from './fixtures/jobs-clean';

const interview = { date: '2026-11-02', time: '14:30', timeZone: 'America/Vancouver' };

test('interview schedules keep calendar dates, optional time, and a valid time zone', () => {
  assert.equal(interviewScheduleProblem(interview), null);
  assert.equal(interviewScheduleProblem({ ...interview, time: null }), null);
  assert.equal(interviewScheduleProblem({ ...interview, date: '2028-02-29', timeZone: 'UTC' }), null);
  for (const date of ['2026-02-29', '2026-02-30', '2026-13-01', '11/02/2026', '0000-01-01']) {
    assert.ok(interviewScheduleProblem({ ...interview, date }));
  }
  for (const time of ['24:00', '12:60', '9:30', '']) {
    assert.ok(interviewScheduleProblem({ ...interview, time }));
  }
  assert.ok(interviewScheduleProblem({ ...interview, timeZone: 'Not/A_Timezone' }));
});

test('scheduling preserves status, unrelated edits and status history; omitted and cleared schedules differ', async () => {
  const jobs = new MemoryJobs(exampleJob({ status: 'interview', editedFields: ['company'] }));
  const update = new UpdateJob(jobs);
  const scheduled = await update.execute('owner', 'job-1', { interview });
  assert.deepEqual(scheduled.job.interview, interview);
  assert.equal(scheduled.job.status, 'interview');
  assert.deepEqual(scheduled.history, []);
  assert.deepEqual(scheduled.job.editedFields, ['company']);
  const unchanged = await update.execute('owner', 'job-1', { salary: 'New salary' });
  assert.deepEqual(unchanged.job.interview, interview);
  const cleared = await update.execute('owner', 'job-1', { interview: null });
  assert.equal(cleared.job.interview, null);
});

test('a bad schedule or foreign owner cannot write anything', async () => {
  const jobs = new MemoryJobs(exampleJob());
  const update = new UpdateJob(jobs);
  await assert.rejects(
    update.execute('owner', 'job-1', { interview: { ...interview, date: '2026-02-30' } }),
    JobInputError,
  );
  await assert.rejects(update.execute('stranger', 'job-1', { interview }), JobNotFoundError);
  assert.equal(jobs.updates.length, 0);
});

test('reading a captured posting again keeps the user interview schedule', async () => {
  const jobs = new MemoryJobs(exampleJob({ interview, structuredData: structuredPosting() }));
  const result = await new RereadJob(jobs, new JsonLdJobReader(), queuedJobs()).execute('owner', 'job-1');
  assert.deepEqual(result.job.interview, interview);
});
