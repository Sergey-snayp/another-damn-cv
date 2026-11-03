import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuthenticationError } from '../../src/modules/auth/application/errors';
import { AUTH_API } from '../../src/modules/auth/auth.tokens';
import { ExtensionResumesController } from '../../src/modules/resumes/adapters/inbound/http/extension-resumes.controller';
import { RESUMES_API } from '../../src/modules/resumes/resumes.tokens';
import type { ResumeSummary } from '../../src/modules/resumes/domain/resume';

const summary = (overrides: Partial<ResumeSummary>): ResumeSummary => ({
  id: 'resume-1',
  name: 'Master',
  targetRole: null,
  isPrimary: false,
  currentSnapshotId: 'snapshot-1',
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-02T00:00:00Z'),
  jobId: null,
  sourceResumeId: null,
  hasTailoring: true,
  ...overrides,
});
const listed: string[] = [];

@Module({
  controllers: [ExtensionResumesController],
  providers: [
    {
      provide: AUTH_API,
      useValue: {
        resolveSyncToken: (token: string) =>
          token === 'owner-token'
            ? Promise.resolve('owner')
            : Promise.reject(new AuthenticationError('Invalid sync token.')),
      },
    },
    {
      provide: RESUMES_API,
      useValue: {
        list: (userId: string) => {
          listed.push(userId);
          return Promise.resolve([
            summary({ id: 'primary', name: 'Master', isPrimary: true, targetRole: 'Backend Engineer' }),
            summary({ id: 'copy', name: 'Master for Acme', jobId: 'job-1', sourceResumeId: 'primary' }),
          ]);
        },
      },
    },
  ],
})
class ExtensionResumesFixture {}

test('the extension lists CVs with its sync token and gets only picker fields', async (context) => {
  const app = await NestFactory.create(ExtensionResumesFixture, { logger: false });
  app.setGlobalPrefix('api');
  await app.listen(0, '127.0.0.1');
  context.after(() => app.close());
  const url = `${await app.getUrl()}/api/extension/resumes`;

  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { authorization: 'Bearer wrong' } })).status, 401);
  assert.deepEqual(listed, []);

  const response = await fetch(url, { headers: { authorization: 'Bearer owner-token' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [
    {
      id: 'primary',
      name: 'Master',
      targetRole: 'Backend Engineer',
      isPrimary: true,
      tailoredForJob: false,
      updatedAt: '2026-10-02T00:00:00.000Z',
    },
    {
      id: 'copy',
      name: 'Master for Acme',
      targetRole: null,
      isPrimary: false,
      tailoredForJob: true,
      updatedAt: '2026-10-02T00:00:00.000Z',
    },
  ]);
  assert.deepEqual(listed, ['owner']);
});
