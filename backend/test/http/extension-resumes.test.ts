import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuthenticationError } from '../../src/modules/auth/application/errors';
import { AUTH_API } from '../../src/modules/auth/auth.tokens';
import { ExtensionResumesController } from '../../src/modules/resumes/adapters/inbound/http/extension-resumes.controller';
import { RESUMES_API } from '../../src/modules/resumes/resumes.tokens';
import type { RenderedResume, ResumeSummary } from '../../src/modules/resumes/domain/resume';
import { ResumeError } from '../../src/modules/resumes/application/errors';

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
const rendered = {
  snapshot: 3,
  contact: { firstName: 'Private', lastName: 'Person', email: 'private@example.com', phone: '+1 555 0100' },
  summaries: { default: 'Backend engineer building payment APIs.' },
  experiences: [
    {
      title: 'Senior Engineer',
      company: 'Acme',
      client: null,
      blurb: null,
      achievements: [
        { bullet: 'Moved billing to PostgreSQL', problem: null, action: null, result: 'Cut costs' },
      ],
    },
  ],
  skills: [{ name: 'Node.js', category: 'Backend', aliases: ['NestJS'] }],
  educations: [{ degree: 'BSc', field: 'Computer Science', institution: 'KPI', fullName: null }],
} as unknown as RenderedResume;

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
        current: (userId: string, id: string) =>
          userId === 'owner' && id === 'primary'
            ? Promise.resolve(rendered)
            : Promise.reject(new ResumeError('not-found', 'No such resume.')),
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

  const text = await fetch(`${url}/primary/text`, { headers: { authorization: 'Bearer owner-token' } });
  assert.equal(text.status, 200);
  const body = (await text.json()) as { id: string; text: string };
  assert.equal(body.id, 'primary');
  for (const part of [
    'payment APIs',
    'Senior Engineer',
    'PostgreSQL',
    'Cut costs',
    'Node.js',
    'NestJS',
    'Computer Science',
  ]) {
    assert.ok(body.text.includes(part), part);
  }
  for (const secret of ['Private', 'private@example.com', '555'])
    assert.ok(!body.text.includes(secret), secret);
  assert.equal(
    (await fetch(`${url}/someone-else/text`, { headers: { authorization: 'Bearer owner-token' } })).status,
    404,
  );
  assert.equal((await fetch(`${url}/primary/text`)).status, 401);
});
