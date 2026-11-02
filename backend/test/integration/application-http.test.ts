import { prisma, migrateTestDatabase } from './setup';
import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../../src/app.module';
import { configureHttp } from '../../src/bootstrap';
import { ClaudeProcessRunner } from '../../src/shared/ai/claude-process.runner';
import { AuthApplication } from '../../src/modules/auth/application/auth-api';
import { AuthenticationError } from '../../src/modules/auth/application/errors';
import { SignInWithGoogle } from '../../src/modules/auth/application/use-cases/sign-in-with-google';
import { SyncTokens } from '../../src/modules/auth/application/use-cases/sync-tokens';
import { PrismaAccountRepository } from '../../src/modules/auth/adapters/outbound/prisma-account.repository';
import { RandomSyncTokenGenerator } from '../../src/modules/auth/adapters/outbound/random-sync-token.generator';
import { AUTH_API, AUTH_SETTINGS } from '../../src/modules/auth/auth.tokens';
import type { PublicUser } from '../../src/modules/auth/contracts';
import type { RenderedResume } from '../../src/modules/resumes/contracts';
import type { Tailoring } from '../../src/modules/tailoring/contracts';

interface JobResponse {
  id: string;
  title: string | null;
  status: string;
  extraction: string;
  remote: boolean | null;
  capturedAt: string;
  history: Array<{ id: string; from: string; to: string; at: string }>;
}
interface RequestOptions {
  method?: string;
  cookie?: string;
  token?: string;
  body?: unknown;
  form?: FormData;
  origin?: string;
}

/** The editor sends nested reads back as flat saves, including echoed metadata. */
function editorSave(document: RenderedResume) {
  return {
    contact: document.contact ?? undefined,
    experiences: document.experiences.map(({ achievements: _bullets, ...role }) => role),
    achievements: document.experiences.flatMap((role) => role.achievements),
    educations: document.educations,
    skills: document.skills,
    summaries: Object.entries(document.summaries).map(([variant, text]) => ({ variant, text })),
  };
}

test(
  'the complete application preserves sessions, extension capture and resume review flows',
  { timeout: 60_000 },
  async (context) => {
    migrateTestDatabase();
    const tag = randomUUID();
    const accounts = new PrismaAccountRepository(prisma);
    const auth = new AuthApplication(
      new SignInWithGoogle(
        {
          verify: (credential) =>
            credential === 'owner' || credential === 'other'
              ? Promise.resolve({
                  subject: `${tag}-${credential}`,
                  email: `${tag}-${credential}@example.com`,
                  name: credential === 'owner' ? 'Owner Person' : 'Other Person',
                  emailVerified: true,
                })
              : Promise.reject(new AuthenticationError('Invalid Google token.')),
        },
        accounts,
      ),
      accounts,
      new SyncTokens(accounts, new RandomSyncTokenGenerator()),
    );
    const aiCalls: string[] = [];
    const fakeRunner = {
      complete: (_prompt: string, system: string): Promise<string> => {
        if (system.startsWith('You convert a CV')) {
          aiCalls.push('import');
          return Promise.resolve(
            JSON.stringify({
              firstName: 'Imported',
              lastName: 'Applicant',
              email: 'imported@example.com',
              skills: ['Node.js'],
            }),
          );
        }
        if (system.startsWith('You rewrite one line')) {
          aiCalls.push('rewrite');
          return Promise.resolve(
            JSON.stringify({ suggestion: 'Built reliable Node.js APIs.', cannotDo: [] }),
          );
        }
        if (system.startsWith('You tailor a candidate')) {
          aiCalls.push('tailor');
          return Promise.resolve(
            JSON.stringify({
              summary: 'Backend engineer building reliable Node.js APIs.',
              roles: [
                { id: 'r1', bullets: [{ id: 'b1', text: 'Built reliable Node.js APIs.', keep: true }] },
              ],
              skills: ['s2', 's1'],
              cannotClaim: ['Java'],
            }),
          );
        }
        if (system.startsWith('You read one job')) {
          aiCalls.push('page');
          return Promise.resolve(
            JSON.stringify({
              isJobPosting: true,
              title: 'Parsed Engineer',
              company: 'Parsed Company',
              descriptionStart: 'Build reliable Node.js',
              descriptionEnd: 'systems and APIs.',
            }),
          );
        }
        return Promise.reject(new Error('Unexpected model task; no real provider is allowed.'));
      },
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AUTH_API)
      .useValue(auth)
      .overrideProvider(AUTH_SETTINGS)
      .useValue({ googleClientId: 'test-client-id' })
      .overrideProvider(ClaudeProcessRunner)
      .useValue(fakeRunner)
      .compile();
    const app = module.createNestApplication<NestExpressApplication>({ logger: false });
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const closeSessions = configureHttp(app);
    context.after(async () => {
      try {
        await app.close();
      } finally {
        await closeSessions();
        await prisma.$disconnect();
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousNodeEnv;
      }
    });
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const request = (path: string, options: RequestOptions = {}) =>
      fetch(`${base}/api/${path}`, {
        method: options.method ?? 'GET',
        headers: {
          ...(options.cookie && { cookie: options.cookie }),
          ...(options.token && { authorization: `Bearer ${options.token}` }),
          ...(options.body !== undefined && { 'content-type': 'application/json' }),
          ...(options.origin && { origin: options.origin }),
        },
        body: options.form ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
        signal: AbortSignal.timeout(10_000),
      });
    const json = async <T>(path: string, options: RequestOptions = {}, status = 200): Promise<T> => {
      const response = await request(path, options);
      const text = await response.text();
      assert.equal(response.status, status, `${options.method ?? 'GET'} ${path}: ${text}`);
      return JSON.parse(text) as T;
    };
    const login = async (credential: string, previousCookie?: string) => {
      const response = await request('auth/google', {
        method: 'POST',
        body: { credential },
        cookie: previousCookie,
      });
      assert.equal(response.status, 201);
      const setCookie = response.headers.get('set-cookie');
      assert.ok(setCookie);
      assert.match(setCookie, /HttpOnly/);
      assert.match(setCookie, /SameSite=Lax/);
      return { cookie: setCookie.split(';')[0], user: (await response.json()) as PublicUser };
    };

    // Use the real Postgres session store: login rotates its row and logout revokes it.
    assert.equal((await request('auth/me')).status, 401);
    assert.equal(
      (await request('auth/google', { method: 'POST', body: { credential: 'invalid' } })).status,
      401,
    );
    assert.deepEqual(await json('auth/config'), { googleClientId: 'test-client-id', configured: true });
    const first = await login('owner');
    assert.deepEqual(Object.keys(first.user).sort(), ['avatarUrl', 'email', 'id', 'name']);
    const sid = decodeURIComponent(first.cookie.slice(first.cookie.indexOf('=') + 1))
      .replace(/^s:/, '')
      .split('.')[0];
    const storedSession = await prisma.userSession.findUniqueOrThrow({ where: { sid } });
    assert.equal((storedSession.sess as { userId: string }).userId, first.user.id);
    const second = await login('owner', first.cookie);
    assert.notEqual(first.cookie, second.cookie);
    assert.equal((await request('auth/me', { cookie: first.cookie })).status, 401);
    assert.deepEqual(await json('auth/logout', { method: 'POST', cookie: second.cookie }, 201), { ok: true });
    assert.equal((await request('auth/me', { cookie: second.cookie })).status, 401);
    const owner = await login('owner'),
      other = await login('other');
    await json('profile', { method: 'PUT', cookie: owner.cookie, body: { phone: 'owner-phone' } }, 200);
    assert.equal((await json<{ phone: string }>('profile', { cookie: other.cookie })).phone, '');
    const extension = await request('auth/extension', { method: 'POST', body: { credential: 'owner' } });
    assert.equal(extension.status, 201);
    assert.equal(extension.headers.get('set-cookie'), null);
    const firstToken = ((await extension.json()) as { user: PublicUser; syncToken: string }).syncToken;
    assert.equal((await json<{ phone: string }>('profile/sync', { token: firstToken })).phone, 'owner-phone');
    const { token } = await json<{ token: string }>(
      'profile/sync-token',
      { method: 'POST', cookie: owner.cookie },
      201,
    );
    assert.notEqual(token, firstToken);
    assert.equal((await request('profile/sync', { token: firstToken })).status, 401);
    assert.equal((await request('profile/sync')).status, 401);

    // A real capture exceeds Express's usual 100 KiB default, then moves on the board.
    const captureBody = {
      url: `https://jobs.example.com/${tag}/role?utm_source=extension`,
      html: `<main>${'x'.repeat(120_000)}</main>`,
      jsonLd: [
        {
          '@type': 'JobPosting',
          title: 'Backend Engineer',
          hiringOrganization: { name: 'Acme' },
          description: '<p>Build Node.js APIs.</p>',
        },
      ],
    };
    assert.ok(JSON.stringify(captureBody).length > 100 * 1024);
    assert.equal(
      (await request('jobs/capture', { method: 'POST', cookie: owner.cookie, body: captureBody })).status,
      401,
    );
    const captureResponse = await request('jobs/capture', {
      method: 'POST',
      token,
      body: captureBody,
      origin: 'chrome-extension://integration-test',
    });
    assert.equal(captureResponse.status, 201);
    assert.equal(
      captureResponse.headers.get('access-control-allow-origin'),
      'chrome-extension://integration-test',
    );
    const captured = (await captureResponse.json()) as { created: boolean; job: JobResponse };
    assert.equal(captured.created, true);
    assert.equal(captured.job.extraction, 'structured');
    assert.match(captured.job.capturedAt, /^\d{4}-\d{2}-\d{2}T/);
    const jobId = captured.job.id;
    assert.equal((await request(`jobs/${jobId}`, { cookie: other.cookie })).status, 404);
    const moved = await json<JobResponse>(`jobs/${jobId}`, {
      method: 'PATCH',
      cookie: owner.cookie,
      body: { title: 'My title', remote: false, status: 'interview' },
    });
    assert.equal(moved.status, 'interview');
    assert.equal(moved.remote, false);
    assert.equal(moved.history.length, 1);
    const same = await json<JobResponse>(`jobs/${jobId}`, {
      method: 'PATCH',
      cookie: owner.cookie,
      body: { status: 'interview' },
    });
    assert.equal(same.history.length, 1);
    const recaptured = await json<{ created: boolean; job: JobResponse }>(
      'jobs/capture',
      {
        method: 'POST',
        token,
        body: { ...captureBody, url: `https://jobs.example.com/${tag}/role?utm_campaign=again` },
      },
      201,
    );
    assert.equal(recaptured.created, false);
    assert.equal(recaptured.job.id, jobId);
    assert.equal(recaptured.job.title, 'My title');
    const undo = await json<JobResponse>(`jobs/${jobId}/status/undo`, {
      method: 'POST',
      cookie: owner.cookie,
      body: { eventId: moved.history[0].id },
    });
    assert.equal(undo.status, 'saved');
    assert.equal(undo.title, 'My title');
    assert.equal(
      (
        await request(`jobs/${jobId}/status/undo`, {
          method: 'POST',
          cookie: owner.cookie,
          body: { eventId: moved.history[0].id },
        })
      ).status,
      409,
    );
    const board = await json<Array<Record<string, unknown>>>('jobs', { cookie: owner.cookie });
    assert.ok(board.some((job) => job.id === jobId));
    assert.ok(
      board.every((job) => !('description' in job) && !('pageText' in job) && 'tailoredResumeId' in job),
    );
    assert.ok(
      !(await json<Array<{ id: string }>>('jobs', { cookie: other.cookie })).some((job) => job.id === jobId),
    );
    const queued = await json<{ job: { id: string } }>(
      'jobs/capture',
      {
        method: 'POST',
        token,
        body: {
          url: `https://jobs.example.com/${tag}/plain`,
          text: 'Build reliable Node.js systems and APIs.',
        },
      },
      201,
    );
    let parsed = await json<JobResponse>(`jobs/${queued.job.id}`, { cookie: owner.cookie });
    for (let attempt = 0; parsed.extraction === 'pending' && attempt < 100; attempt++) {
      await delay(20);
      parsed = await json<JobResponse>(`jobs/${queued.job.id}`, { cookie: owner.cookie });
    }
    assert.equal(parsed.extraction, 'llm');
    assert.equal(parsed.title, 'Parsed Engineer');

    // Exercise wire DTOs, echoing every row's bookkeeping through the real validator.
    const created = await json<{ id: string }>(
      'resumes',
      { method: 'POST', cookie: owner.cookie, body: { name: 'Backend', targetRole: 'Engineer' } },
      201,
    );
    const resumeId = created.id;
    const original = await json<RenderedResume>(
      `resumes/${resumeId}/save`,
      {
        method: 'POST',
        cookie: owner.cookie,
        body: {
          contact: { firstName: 'Owner', lastName: 'Person', email: owner.user.email, phone: null },
          experiences: [
            {
              lineageId: `role-${tag}`,
              company: 'Acme',
              client: 'Client',
              title: 'Backend Engineer',
              from: '2020',
              current: true,
            },
          ],
          achievements: [
            {
              lineageId: `bullet-${tag}`,
              experienceLineageId: `role-${tag}`,
              bullet: 'Built Node.js APIs.',
              problem: 'Slow services.',
              action: 'Built APIs.',
              result: 'Reliable services.',
              verified: true,
              evidence: 'repo/commit',
              weight: 5,
              authoredBy: 'human',
            },
          ],
          educations: [
            {
              institution: 'UT',
              fullName: 'University of Testing',
              degree: 'BSc',
              field: 'Computing',
              from: '2016',
              to: '2020',
            },
          ],
          skills: [
            {
              name: 'Node.js',
              aliases: ['Node'],
              category: 'Backend',
              level: 'advanced',
              years: 4,
              verified: true,
              evidence: 'repo/package.json',
              weight: 4,
            },
            { name: 'AWS', aliases: [] },
          ],
          summaries: [{ variant: 'default', text: 'Backend engineer building Node.js APIs.' }],
          message: 'Initial',
        },
      },
      201,
    );
    assert.equal(original.snapshot, 1);
    const unchanged = await json<RenderedResume>(
      `resumes/${resumeId}/save`,
      { method: 'POST', cookie: owner.cookie, body: editorSave(original) },
      201,
    );
    assert.deepEqual(unchanged, original);
    const changed = await json<RenderedResume>(
      `resumes/${resumeId}/save`,
      {
        method: 'POST',
        cookie: owner.cookie,
        body: {
          achievements: [
            { ...original.experiences[0].achievements[0], bullet: 'Built reliable Node.js APIs.' },
          ],
          summaries: [{ variant: 'default', text: 'Updated summary.' }],
          message: 'Edit',
        },
      },
      201,
    );
    assert.equal(changed.snapshot, 2);
    assert.deepEqual(changed.contact, original.contact);
    assert.deepEqual(changed.educations, original.educations);
    assert.deepEqual(changed.skills, original.skills);
    assert.equal(changed.experiences[0].achievements[0].authoredBy, 'human');
    const history = await json<Array<{ createdInSnapshot: number; supersededInSnapshot: number | null }>>(
      `resumes/${resumeId}/history?table=achievement&lineageId=bullet-${tag}`,
      { cookie: owner.cookie },
    );
    assert.deepEqual(
      history.map((row) => row.createdInSnapshot),
      [2, 1],
    );
    assert.equal(history[1].supersededInSnapshot, 2);
    const diff = await json<{
      counts: { added: number; changed: number; removed: number };
      changes: Array<{ table: string; before: { bullet?: string } | null }>;
    }>(`resumes/${resumeId}/diff/2`, { cookie: owner.cookie });
    assert.deepEqual(diff.counts, { added: 0, changed: 2, removed: 0 });
    assert.equal(
      diff.changes.find((change) => change.table === 'achievement')?.before?.bullet,
      'Built Node.js APIs.',
    );
    assert.equal(
      (await json<RenderedResume>(`resumes/${resumeId}/at/1`, { cookie: owner.cookie })).summaries.default,
      original.summaries.default,
    );
    const source = await json<RenderedResume>(
      `resumes/${resumeId}/revert/1`,
      { method: 'POST', cookie: owner.cookie },
      201,
    );
    assert.equal(source.snapshot, 3);
    assert.equal(source.experiences[0].achievements[0].bullet, 'Built Node.js APIs.');
    assert.equal(
      (await json<Array<unknown>>(`resumes/${resumeId}/snapshots`, { cookie: owner.cookie })).length,
      3,
    );
    assert.equal((await request(`resumes/${resumeId}`, { cookie: other.cookie })).status, 404);
    assert.equal(
      (
        await request(`resumes/${resumeId}/save`, {
          method: 'POST',
          cookie: other.cookie,
          body: { experiences: 'malformed' },
        })
      ).status,
      404,
    );
    assert.equal(
      (await request(`resumes/${resumeId}/at/not-a-number`, { cookie: other.cookie })).status,
      404,
    );
    assert.equal((await request(`resumes/${resumeId}/tailoring`, { cookie: other.cookie })).status, 404);
    const rewrite = await json<{ original: string; suggestion: string; cannotDo: string[] }>(
      `resumes/${resumeId}/rewrite`,
      {
        method: 'POST',
        cookie: owner.cookie,
        body: { text: 'Built Node.js APIs.', instruction: 'Make this clearer.', kind: 'bullet' },
      },
      201,
    );
    assert.deepEqual(rewrite, {
      original: 'Built Node.js APIs.',
      suggestion: 'Built reliable Node.js APIs.',
      cannotDo: [],
    });
    assert.deepEqual(await json<RenderedResume>(`resumes/${resumeId}`, { cookie: owner.cookie }), source);

    // Import is a draft: the HTTP upload never saves profile or resume content.
    const beforeImport = await json('profile', { cookie: owner.cookie });
    const text = 'Imported Applicant\nimported@example.com\nBuilt Node.js APIs.';
    const form = new FormData();
    form.append('file', new Blob([text], { type: 'text/plain' }), 'candidate.txt');
    const imported = await json<{
      id: string;
      charsRead: number;
      proposed: { firstName: string };
      notFound: string[];
    }>('import/cv', { method: 'POST', cookie: owner.cookie, form }, 201);
    assert.equal(typeof imported.id, 'string');
    assert.equal(imported.charsRead, text.length);
    assert.equal(imported.proposed.firstName, 'Imported');
    assert.deepEqual(imported.notFound, ['phone', 'location', 'linkedin', 'github']);
    assert.deepEqual(await json('profile', { cookie: owner.cookie }), beforeImport);
    assert.deepEqual(await json<RenderedResume>(`resumes/${resumeId}`, { cookie: owner.cookie }), source);
    assert.equal((await json<Array<unknown>>('resumes', { cookie: owner.cookie })).length, 1);

    // Tailoring writes only a proposal on a fresh copy. The client accepts it via normal save.
    assert.equal(
      (
        await request(`jobs/${jobId}/tailor`, {
          method: 'POST',
          cookie: other.cookie,
          body: { sourceResumeId: resumeId },
        })
      ).status,
      404,
    );
    const tailored = await json<{ resumeId: string; tailoring: Tailoring }>(`jobs/${jobId}/tailor`, {
      method: 'POST',
      cookie: owner.cookie,
      body: { sourceResumeId: resumeId },
    });
    assert.notEqual(tailored.resumeId, resumeId);
    const copy = await json<RenderedResume>(`resumes/${tailored.resumeId}`, { cookie: owner.cookie });
    assert.equal(tailored.tailoring.basedOnSnapshot, copy.snapshot);
    assert.notEqual(copy.experiences[0].lineageId, source.experiences[0].lineageId);
    assert.equal(copy.experiences[0].achievements[0].experienceLineageId, copy.experiences[0].lineageId);
    assert.equal(copy.experiences[0].achievements[0].evidence, 'repo/commit');
    assert.deepEqual(await json(`resumes/${tailored.resumeId}/tailoring`, { cookie: owner.cookie }), {
      tailoring: tailored.tailoring,
    });
    const accepted = editorSave(copy);
    accepted.summaries = accepted.summaries.map((summary) =>
      summary.variant === tailored.tailoring.summaryVariant
        ? { ...summary, text: tailored.tailoring.summary.after }
        : summary,
    );
    accepted.achievements = accepted.achievements.map((bullet) => {
      const suggestion = tailored.tailoring.bullets.find((item) => item.lineageId === bullet.lineageId);
      return suggestion
        ? { ...bullet, bullet: suggestion.after, authoredBy: 'tailor', position: suggestion.to }
        : bullet;
    });
    accepted.skills = tailored.tailoring.skills.map((id, position) => ({
      ...copy.skills.find((skill) => skill.lineageId === id)!,
      position,
    }));
    const saved = await json<RenderedResume>(
      `resumes/${tailored.resumeId}/save`,
      { method: 'POST', cookie: owner.cookie, body: accepted },
      201,
    );
    assert.equal(saved.experiences[0].achievements[0].bullet, 'Built reliable Node.js APIs.');
    assert.equal(saved.experiences[0].achievements[0].authoredBy, 'tailor');
    assert.deepEqual(
      saved.skills.map((skill) => skill.name),
      ['AWS', 'Node.js'],
    );
    const discard = await request(`resumes/${tailored.resumeId}/tailoring`, {
      method: 'DELETE',
      cookie: owner.cookie,
    });
    assert.equal(discard.status, 204);
    assert.equal(await discard.text(), '');
    assert.deepEqual(await json(`resumes/${tailored.resumeId}/tailoring`, { cookie: owner.cookie }), {
      tailoring: null,
    });
    assert.deepEqual(
      await json<RenderedResume>(`resumes/${tailored.resumeId}`, { cookie: owner.cookie }),
      saved,
    );
    assert.deepEqual(await json<RenderedResume>(`resumes/${resumeId}`, { cookie: owner.cookie }), source);
    const linked = await json<Array<{ id: string; tailoredResumeId: string | null }>>('jobs', {
      cookie: owner.cookie,
    });
    assert.equal(linked.find((job) => job.id === jobId)?.tailoredResumeId, tailored.resumeId);
    const removed = await request(`jobs/${jobId}`, { method: 'DELETE', cookie: owner.cookie });
    assert.equal(removed.status, 204);
    assert.equal((await request(`jobs/${jobId}`, { cookie: owner.cookie })).status, 404);
    assert.deepEqual(
      await json<RenderedResume>(`resumes/${tailored.resumeId}`, { cookie: owner.cookie }),
      saved,
    );
    assert.equal((await prisma.resume.findUniqueOrThrow({ where: { id: tailored.resumeId } })).jobId, null);
    for (const task of ['import', 'rewrite', 'tailor', 'page'])
      assert.ok(aiCalls.includes(task), `Missing fake ${task} call`);
  },
);
