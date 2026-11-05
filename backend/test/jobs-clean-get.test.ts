import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Job as StoredJob, JobStatusEvent, PrismaClient } from '@prisma/client';
import { GetJob } from '../src/modules/jobs/application/use-cases/get-job';
import { GetJobForTailoring } from '../src/modules/jobs/application/use-cases/get-job-for-tailoring';
import { JobNotFoundError } from '../src/modules/jobs/application/errors';
import { PrismaJobRepository } from '../src/modules/jobs/adapters/outbound/persistence/prisma-job.repository';
import { presentJobDetail } from '../src/modules/jobs/adapters/inbound/http/jobs.presenter';

const at = new Date('2026-10-01T12:34:56.000Z');
const row: StoredJob = {
  id: 'job-owned',
  userId: 'owner',
  source: 'EXTENSION',
  status: 'INTERVIEW',
  extraction: 'STRUCTURED',
  extractionError: null,
  url: 'https://jobs.example.com/1?utm_source=capture',
  canonicalUrl: 'https://jobs.example.com/1',
  title: 'Engineer',
  company: 'Example',
  companyLogo: null,
  location: null,
  remote: false,
  employmentType: '',
  salary: null,
  postedAt: at,
  description: 'Original description.',
  pageTitle: 'Engineer at Example',
  html: '<private-page />',
  pageText: 'Private captured text.',
  structuredData: { private: true },
  editedFields: ['title'],
  capturedAt: at,
  createdAt: at,
  updatedAt: at,
  isFavorite: false,
  archivedAt: null,
  appliedAt: null,
  applicationResumeId: null,
  applicationSnapshot: null,
  applicationAnswers: null,
  interviewDate: null,
  interviewTime: null,
  interviewTimeZone: null,
};

const history: JobStatusEvent[] = [
  { id: 'event-2', jobId: row.id, from: 'APPLIED', to: 'INTERVIEW', at },
  { id: 'event-1', jobId: row.id, from: 'SAVED', to: 'APPLIED', at },
];

function repository() {
  const queries: unknown[] = [];
  const database = {
    job: {
      findFirst: (query: { where: { id: string; userId: string } }) => {
        queries.push(query);
        return Promise.resolve(query.where.id === row.id && query.where.userId === row.userId ? row : null);
      },
    },
    jobStatusEvent: {
      findMany: (query: unknown) => {
        queries.push(query);
        return Promise.resolve(history);
      },
    },
  } as unknown as PrismaClient;
  return { repository: new PrismaJobRepository(database), queries };
}

test('clean GetJob keeps the current detail response and scopes job and history reads', async () => {
  const { repository: jobs, queries } = repository();
  const result = presentJobDetail(await new GetJob(jobs).execute('owner', row.id));
  assert.deepEqual(result, {
    id: 'job-owned',
    source: 'extension',
    status: 'interview',
    extraction: 'structured',
    extractionError: null,
    url: 'https://jobs.example.com/1?utm_source=capture',
    title: 'Engineer',
    company: 'Example',
    companyLogo: null,
    location: null,
    remote: false,
    employmentType: '',
    salary: null,
    postedAt: '2026-10-01T12:34:56.000Z',
    description: 'Original description.',
    pageTitle: 'Engineer at Example',
    editedFields: ['title'],
    capturedAt: '2026-10-01T12:34:56.000Z',
    createdAt: '2026-10-01T12:34:56.000Z',
    updatedAt: '2026-10-01T12:34:56.000Z',
    isFavorite: false,
    archivedAt: null,
    appliedAt: null,
    applicationResumeId: null,
    applicationSnapshot: null,
    applicationAnswers: null,
    interview: null,
    history: [
      { id: 'event-2', from: 'applied', to: 'interview', at: '2026-10-01T12:34:56.000Z' },
      { id: 'event-1', from: 'saved', to: 'applied', at: '2026-10-01T12:34:56.000Z' },
    ],
  });
  assert.deepEqual(queries, [
    { where: { id: row.id, userId: 'owner' } },
    { where: { jobId: row.id, job: { userId: 'owner' } }, orderBy: [{ at: 'desc' }, { id: 'desc' }] },
  ]);
  for (const field of ['userId', 'canonicalUrl', 'html', 'pageText', 'structuredData']) {
    assert.ok(!(field in result));
  }
});

test('clean GetJob returns the same missing error for foreign and unknown jobs without reading history', async () => {
  const { repository: jobs, queries } = repository();
  const get = new GetJob(jobs);
  await assert.rejects(get.execute('stranger', row.id), JobNotFoundError);
  await assert.rejects(get.execute('owner', 'unknown'), JobNotFoundError);
  assert.equal(queries.length, 2);
});

test('public jobs operation exposes only the owned tailoring fields using plain lower-case values', async () => {
  const { repository: jobs } = repository();
  const get = new GetJobForTailoring(jobs);
  assert.deepEqual(await get.execute('owner', row.id), {
    id: row.id,
    title: row.title,
    company: row.company,
    pageTitle: row.pageTitle,
    description: row.description,
    extraction: 'structured',
  });
  await assert.rejects(get.execute('stranger', row.id), JobNotFoundError);
});
