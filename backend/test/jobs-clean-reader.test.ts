import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { JobFields } from '../src/modules/jobs/domain/job';
import { ReadJobPage } from '../src/modules/jobs/application/use-cases/read-job-page';
import { UpdateJob } from '../src/modules/jobs/application/use-cases/update-job';
import { CaptureJob } from '../src/modules/jobs/application/use-cases/capture-job';
import { ClaudeJobPageExtractor } from '../src/modules/jobs/adapters/outbound/ai/claude-job-page.extractor';
import { JsonLdJobReader } from '../src/modules/jobs/adapters/outbound/documents/json-ld-job.reader';
import { InProcessJobReadScheduler } from '../src/modules/jobs/adapters/outbound/scheduling/in-process-job-read.scheduler';
import { JobReadWorker } from '../src/modules/jobs/adapters/inbound/worker/job-read.worker';
import { exampleJob, MemoryJobs, queuedJobs, structuredPosting } from './fixtures/jobs-clean';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function pausedReader(jobs: MemoryJobs) {
  const started = deferred<void>();
  const result = deferred<{ fields: JobFields } | { failure: string }>();
  const read = new ReadJobPage(jobs, {
    extract: () => {
      started.resolve();
      return result.promise;
    },
  });
  return { read, started: started.promise, result };
}

test('background reading uses the latest edited-field protections, including edits made during AI', async () => {
  const jobs = new MemoryJobs(exampleJob({ extraction: 'pending' }));
  const { read, started, result } = pausedReader(jobs);
  const reading = read.execute('job-1');
  await started;
  await new UpdateJob(jobs).execute('owner', 'job-1', { title: 'My title', remote: false });
  result.resolve({
    fields: { title: 'Model title', company: 'Read company', remote: true, description: 'Employer wording.' },
  });
  await reading;
  const job = jobs.rows.get('job-1')!;
  assert.equal(job.title, 'My title');
  assert.equal(job.remote, false);
  assert.equal(job.company, 'Read company');
  assert.equal(job.description, 'Employer wording.');
  assert.equal(job.extraction, 'llm');
  assert.equal(job.extractionError, null);
});

test('a late AI result is ignored after deletion or a structured recapture', async () => {
  for (const action of ['delete', 'structured'] as const) {
    const jobs = new MemoryJobs(exampleJob({ extraction: 'pending' }));
    const { read, started, result } = pausedReader(jobs);
    const reading = read.execute('job-1');
    await started;
    if (action === 'delete') jobs.rows.delete('job-1');
    else
      await new CaptureJob(jobs, new JsonLdJobReader(), queuedJobs()).execute('owner', {
        url: 'https://jobs.example.com/1',
        jsonLd: structuredPosting('Structured title'),
      });
    result.resolve({ fields: { title: 'Late model title' } });
    await reading;
    if (action === 'delete') assert.equal(jobs.rows.has('job-1'), false);
    else {
      assert.equal(jobs.rows.get('job-1')?.title, 'Structured title');
      assert.equal(jobs.rows.get('job-1')?.extraction, 'structured');
    }
  }
});

test('existing limit: another pending capture does not invalidate the first in-flight read', async () => {
  const jobs = new MemoryJobs(exampleJob({ extraction: 'pending' }));
  const { read, started, result } = pausedReader(jobs);
  const reading = read.execute('job-1');
  await started;
  await new CaptureJob(jobs, new JsonLdJobReader(), queuedJobs()).execute('owner', {
    url: 'https://jobs.example.com/1',
    text: 'Newer captured text.',
  });
  result.resolve({ fields: { title: 'Earlier answer', description: 'Earlier description.' } });
  await reading;
  assert.equal(jobs.rows.get('job-1')?.pageText, 'Newer captured text.');
  assert.equal(jobs.rows.get('job-1')?.description, 'Earlier description.');
});

test('failed extraction records the current failure without clearing the previous job fields', async () => {
  const jobs = new MemoryJobs(exampleJob({ extraction: 'pending' }));
  await new ReadJobPage(jobs, { extract: () => Promise.resolve({ failure: 'Provider timed out.' }) }).execute(
    'job-1',
  );
  const job = jobs.rows.get('job-1')!;
  assert.equal(job.extraction, 'failed');
  assert.equal(job.extractionError, 'Provider timed out.');
  assert.equal(job.title, 'Engineer');
  assert.equal(job.description, 'Build reliable systems.');
});

test('reader skips missing jobs, completed jobs and pending jobs without readable text', async () => {
  const jobs = new MemoryJobs(
    exampleJob(),
    exampleJob({ id: 'empty', extraction: 'pending', pageText: null }),
  );
  let calls = 0;
  const read = new ReadJobPage(jobs, {
    extract: () => {
      calls++;
      return Promise.resolve({ fields: {} });
    },
  });
  await read.execute('missing');
  await read.execute('job-1');
  await read.execute('empty');
  assert.equal(calls, 0);
  assert.deepEqual(jobs.updates, []);
});

test('page extraction keeps employer text, handles not-a-job/malformed replies, and catches provider errors', async () => {
  const page = {
    url: 'https://jobs.example.com',
    pageTitle: 'Page',
    text: 'Navigation\nBuild reliable systems.\nApply now',
  };
  const extractor = (answer: string) =>
    new ClaudeJobPageExtractor({ complete: () => Promise.resolve(answer) });
  const read = await extractor(
    '{"isJobPosting":true,"title":"Engineer","descriptionStart":"Build reliable","descriptionEnd":"reliable systems."}',
  ).extract(page);
  assert.ok('fields' in read);
  assert.equal(read.fields.description, 'Build reliable systems.');
  assert.deepEqual(await extractor('{"isJobPosting":false}').extract(page), {
    failure: 'This page does not look like a job posting.',
  });
  assert.deepEqual(await extractor('not JSON').extract(page), {
    failure: 'The model answered, but not with job details.',
  });
  assert.deepEqual(
    await new ClaudeJobPageExtractor({ complete: () => Promise.reject(new Error('Timed out.')) }).extract(
      page,
    ),
    { failure: 'Timed out.' },
  );
});

test('scheduler runs one job at a time and keeps working after an error', async () => {
  const release = deferred<void>();
  const started = deferred<void>();
  const order: string[] = [];
  const errors: unknown[] = [];
  const scheduler = new InProcessJobReadScheduler(
    {
      execute: async (id) => {
        order.push(`start:${id}`);
        if (id === 'first') {
          started.resolve();
          await release.promise;
          throw new Error('First read failed.');
        }
        order.push(`finish:${id}`);
      },
    },
    {
      error: (message, error) => {
        errors.push({ message, error });
      },
    },
  );
  scheduler.enqueue('first');
  scheduler.enqueue('second');
  await started.promise;
  assert.deepEqual(order, ['start:first']);
  release.resolve();
  await scheduler.idle();
  assert.deepEqual(order, ['start:first', 'start:second', 'finish:second']);
  assert.equal(errors.length, 1);
});

test('startup recovers pending jobs in capture order using the same scheduler', async () => {
  const jobs = new MemoryJobs(
    exampleJob({ id: 'newer', extraction: 'pending', capturedAt: new Date('2026-10-02') }),
    exampleJob({ id: 'older', extraction: 'pending', capturedAt: new Date('2026-10-01') }),
    exampleJob({ id: 'done', extraction: 'structured' }),
  );
  const scheduler = queuedJobs();
  await new JobReadWorker(jobs, scheduler).onApplicationBootstrap();
  assert.deepEqual(scheduler.ids, ['older', 'newer']);
});
