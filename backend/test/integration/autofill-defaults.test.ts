import { prisma, migrateTestDatabase, createUser } from './setup';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from '../../src/app.module';
import { JOB_READ_SCHEDULER } from '../../src/modules/jobs/jobs.tokens';
import { GetPostingDates } from '../../src/modules/jobs/application/use-cases/get-posting-dates';

let app: INestApplication;
let base: string;
let owner: Awaited<ReturnType<typeof createUser>>, other: Awaited<ReturnType<typeof createUser>>;
let ownerToken: string, otherToken: string;

function call(
  path: string,
  options: { method?: string; body?: unknown; user?: string; token?: string } = {},
) {
  return fetch(`${base}/api${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.user && { 'x-test-user': options.user }),
      ...(options.token && { authorization: `Bearer ${options.token}` }),
      ...(options.body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(options.body !== undefined && { body: JSON.stringify(options.body) }),
  });
}

before(async () => {
  migrateTestDatabase();
  owner = await createUser('Defaults Owner');
  other = await createUser('Defaults Other');
  [ownerToken, otherToken] = [`token-${randomUUID()}`, `token-${randomUUID()}`];
  await prisma.user.update({ where: { id: owner.user.id }, data: { syncToken: ownerToken } });
  await prisma.user.update({ where: { id: other.user.id }, data: { syncToken: otherToken } });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JOB_READ_SCHEDULER)
    .useValue({ enqueue: () => {} })
    // The job board's API stands in: Box's posting on Greenhouse.
    .overrideProvider(GetPostingDates)
    .useValue(
      new GetPostingDates({
        read: () =>
          Promise.resolve({ posted: '2026-10-30T11:49:29-04:00', updated: '2026-11-04T13:11:09-05:00' }),
      }),
    )
    .compile();
  app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  app.use((req: Request, _response: Response, next: NextFunction) => {
    const id = req.headers['x-test-user'];
    Object.assign(req, { session: typeof id === 'string' ? { userId: id } : {} });
    next();
  });
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});
after(async () => {
  await app?.close();
  await prisma.$disconnect();
});

type Row = { id: string; kind: string; scope: string; value: string };

test('the extension saves per-country and per-company defaults and the app manages them', async () => {
  assert.equal((await call('/extension/defaults')).status, 401);

  const save = await call('/extension/defaults', {
    method: 'POST',
    token: ownerToken,
    body: {
      defaults: [
        { kind: 'requiresSponsorship', scope: 'Poland', value: 'Yes' },
        { kind: 'workAuthorization', scope: 'Poland', value: 'No' },
        { kind: 'workedHereBefore', scope: 'Box', value: 'No' },
      ],
    },
  });
  assert.equal(save.status, 201);
  assert.equal(((await save.json()) as Row[]).length, 3);

  // The same kind and country replaces the answer instead of adding a row.
  await call('/extension/defaults', {
    method: 'POST',
    token: ownerToken,
    body: { defaults: [{ kind: 'workAuthorization', scope: 'poland', value: 'Yes' }] },
  });
  const rows = (await (await call('/extension/defaults', { token: ownerToken })).json()) as Row[];
  assert.deepEqual(
    rows.map((row) => [row.kind, row.scope, row.value]),
    [
      ['requiresSponsorship', 'Poland', 'Yes'],
      ['workAuthorization', 'poland', 'Yes'],
      ['workedHereBefore', 'Box', 'No'],
    ],
  );
  assert.deepEqual(await (await call('/extension/defaults', { token: otherToken })).json(), []);

  const box = rows.find((row) => row.kind === 'workedHereBefore')!;
  assert.equal((await call(`/defaults/${box.id}`, { method: 'DELETE', user: other.user.id })).status, 404);
  const patch = await call(`/defaults/${box.id}`, {
    method: 'PATCH',
    user: owner.user.id,
    body: { value: 'Yes' },
  });
  assert.equal(((await patch.json()) as Row).value, 'Yes');
  assert.equal(
    (await call(`/extension/defaults/${box.id}`, { method: 'DELETE', token: ownerToken })).status,
    204,
  );
  assert.equal(((await (await call('/defaults', { user: owner.user.id })).json()) as Row[]).length, 2);
});

test('the extension fills a missing profile value but cannot change name or email', async () => {
  assert.equal((await call('/extension/profile', { method: 'PATCH', body: { phone: '1' } })).status, 401);
  const saved = await call('/extension/profile', {
    method: 'PATCH',
    token: ownerToken,
    body: { phone: '+48 600 100 200' },
  });
  assert.equal(saved.status, 200);
  assert.equal(((await saved.json()) as { phone: string }).phone, '+48 600 100 200');
  const before = (await (await call('/profile', { user: owner.user.id })).json()) as { email: string };
  const refused = await call('/extension/profile', {
    method: 'PATCH',
    token: ownerToken,
    body: { email: 'x@evil.test' },
  });
  assert.equal(refused.status, 400);
  const afterRefusal = (await (await call('/profile', { user: owner.user.id })).json()) as {
    email: string;
    phone: string;
  };
  assert.equal(afterRefusal.email, before.email);
  assert.equal(afterRefusal.phone, '+48 600 100 200');
});

test('the extension forgets a saved answer by its question', async () => {
  await call('/extension/answers', {
    method: 'POST',
    token: ownerToken,
    body: { answers: [{ question: 'Are you open to relocation?', answer: 'No' }] },
  });
  const forget = await call('/extension/answers/forget', {
    method: 'POST',
    token: ownerToken,
    body: { question: 'Are you open to relocation' },
  });
  assert.deepEqual(await forget.json(), { forgotten: true });
  const left = (await (await call('/answers', { user: owner.user.id })).json()) as { question: string }[];
  assert.ok(!left.some((row) => row.question === 'Are you open to relocation?'));
});

test('relocation answers are kept per country and work types on the profile', async () => {
  await call('/extension/defaults', {
    method: 'POST',
    token: ownerToken,
    body: { defaults: [{ kind: 'willingToRelocate', scope: 'Poland', value: 'Yes' }] },
  });
  const rows = (await (await call('/extension/defaults', { token: ownerToken })).json()) as Row[];
  assert.ok(
    rows.some((row) => row.kind === 'willingToRelocate' && row.scope === 'Poland' && row.value === 'Yes'),
  );
  const saved = await call('/extension/profile', {
    method: 'PATCH',
    token: ownerToken,
    body: { workArrangements: 'Hybrid, Remote' },
  });
  assert.equal(((await saved.json()) as { workArrangements: string }).workArrangements, 'remote,hybrid');
  const app = await call('/profile', {
    method: 'PUT',
    user: owner.user.id,
    body: { workArrangements: 'onsite' },
  });
  assert.equal(((await app.json()) as { workArrangements: string }).workArrangements, 'onsite');
});

test('the extension reads the profile career and only its own CVs', async () => {
  assert.equal((await call('/extension/profile/career')).status, 401);
  const empty = (await (await call('/extension/profile/career', { token: ownerToken })).json()) as {
    experiences: unknown[];
    fields: { currentCompany: string };
  };
  assert.deepEqual(empty.experiences, []);
  assert.equal(empty.fields.currentCompany, '');

  const created = (await (
    await call('/resumes', { method: 'POST', user: owner.user.id, body: { name: 'Extension CV' } })
  ).json()) as { id: string };
  await call(`/resumes/${created.id}/save`, {
    method: 'POST',
    user: owner.user.id,
    body: { summaries: [{ variant: 'default', text: 'Payments engineer.' }] },
  });
  const fromCv = await call(`/extension/profile/career/resume/${created.id}`, { token: ownerToken });
  assert.equal(fromCv.status, 200);
  assert.equal(((await fromCv.json()) as { summary: string }).summary, 'Payments engineer.');
  assert.equal(
    (await call(`/extension/profile/career/resume/${created.id}`, { token: otherToken })).status,
    404,
  );
});

test('a captured job keeps its logo, and the extension can tell it is saved', async () => {
  const url = `https://job-boards.greenhouse.io/acme/jobs/${randomUUID()}?gh_src=x`;
  const logo = 'https://recruiting.cdn.greenhouse.io/logos/acme.png';
  const refused = await call('/jobs/capture', {
    method: 'POST',
    token: ownerToken,
    body: { url, text: 'Engineer at Acme', companyLogo: 'javascript:alert(1)' },
  });
  assert.equal(refused.status, 400);
  const saved = await call('/jobs/capture', {
    method: 'POST',
    token: ownerToken,
    body: { url, text: 'Engineer at Acme', companyLogo: logo },
  });
  const { job } = (await saved.json()) as { job: { id: string; companyLogo: string } };
  assert.equal(job.companyLogo, logo);
  // Saved again without a logo: the one found before stays.
  const again = (await (
    await call('/jobs/capture', {
      method: 'POST',
      token: ownerToken,
      body: { url, text: 'Engineer at Acme' },
    })
  ).json()) as { job: { companyLogo: string } };
  assert.equal(again.job.companyLogo, logo);

  const lookup = (await (
    await call(`/jobs/lookup?url=${encodeURIComponent(url.replace('?gh_src=x', ''))}`, { token: ownerToken })
  ).json()) as { job: { id: string; companyLogo: string } | null };
  assert.equal(lookup.job?.id, job.id);
  assert.equal(lookup.job?.companyLogo, logo);
  assert.equal((lookup.job as unknown as { status: string }).status, 'saved');
  assert.equal((lookup.job as unknown as { appliedAt: string | null }).appliedAt, null);
  const stranger = (await (
    await call(`/jobs/lookup?url=${encodeURIComponent(url)}`, { token: otherToken })
  ).json()) as { job: unknown };
  assert.equal(stranger.job, null);
  assert.equal((await call(`/jobs/lookup?url=${encodeURIComponent(url)}`)).status, 401);
});

test('the extension records the CV and answers used on a saved job, for its owner only', async () => {
  const url = `https://jobs.example.com/apply/${randomUUID()}`;
  const { job } = (await (
    await call('/jobs/capture', {
      method: 'POST',
      token: ownerToken,
      body: { url, text: 'Engineer at Acme' },
    })
  ).json()) as { job: { id: string } };
  const cv = (await (
    await call('/resumes', { method: 'POST', user: owner.user.id, body: { name: 'Applied CV' } })
  ).json()) as { id: string };
  await call(`/resumes/${cv.id}/save`, {
    method: 'POST',
    user: owner.user.id,
    body: { summaries: [{ variant: 'default', text: 'Payments engineer.' }] },
  });

  const recorded = await call(`/jobs/${job.id}/application`, {
    method: 'POST',
    token: ownerToken,
    body: {
      resumeId: cv.id,
      answers: [
        { question: 'How did you hear about us?', answer: 'https://another-damn.cv' },
        { question: 'Why Acme?', answer: '  ' },
        { question: 'how did you hear about us?', answer: 'Twice' },
      ],
    },
  });
  assert.equal(recorded.status, 200);
  const detail = (await (await call(`/jobs/${job.id}`, { user: owner.user.id })).json()) as {
    applicationResumeId: string;
    applicationSnapshot: number;
    applicationAnswers: { question: string; answer: string }[];
  };
  assert.equal(detail.applicationResumeId, cv.id);
  assert.ok(detail.applicationSnapshot > 0);
  assert.deepEqual(detail.applicationAnswers, [{ question: 'how did you hear about us?', answer: 'Twice' }]);

  // Answers only: the CV stays as it was, and they are added to the ones kept
  // (the next step of a form); a question answered again keeps its new answer.
  await call(`/jobs/${job.id}/application`, {
    method: 'POST',
    token: ownerToken,
    body: {
      answers: [
        { question: 'Why Acme?', answer: 'Payments.' },
        { question: 'How did you hear about us?', answer: 'LinkedIn' },
      ],
    },
  });
  const again = (await (await call(`/jobs/${job.id}`, { user: owner.user.id })).json()) as {
    applicationResumeId: string;
    applicationAnswers: unknown[];
  };
  assert.equal(again.applicationResumeId, cv.id);
  assert.deepEqual(again.applicationAnswers, [
    { question: 'How did you hear about us?', answer: 'LinkedIn' },
    { question: 'Why Acme?', answer: 'Payments.' },
  ]);

  assert.equal(
    (await call(`/jobs/${job.id}/application`, { method: 'POST', token: otherToken, body: { answers: [] } }))
      .status,
    404,
  );
  const foreignCv = await call(`/jobs/${job.id}/application`, {
    method: 'POST',
    token: ownerToken,
    body: { resumeId: randomUUID() },
  });
  assert.equal(foreignCv.status, 400);
});

test('a saved job takes its name from the page until the page is read, and typed values stay', async () => {
  type Saved = {
    job: { title: string | null; company: string | null; location: string | null; editedFields: string[] };
  };
  const seen = (await (
    await call('/jobs/capture', {
      method: 'POST',
      token: ownerToken,
      body: {
        url: `https://jobs.example.com/${randomUUID()}`,
        text: 'A posting',
        hints: { title: 'Engineer', company: 'Box' },
      },
    })
  ).json()) as Saved;
  assert.deepEqual([seen.job.title, seen.job.company, seen.job.editedFields], ['Engineer', 'Box', []]);

  const typed = (await (
    await call('/jobs/capture', {
      method: 'POST',
      token: ownerToken,
      body: {
        url: `https://jobs.example.com/${randomUUID()}`,
        text: 'A posting',
        hints: { title: 'Backend developer', company: 'Acme', location: 'Warsaw', confirmed: true },
      },
    })
  ).json()) as Saved;
  assert.deepEqual(
    [typed.job.title, typed.job.company, typed.job.location, [...typed.job.editedFields].sort()],
    ['Backend developer', 'Acme', 'Warsaw', ['company', 'location', 'title']],
  );
});

test('the job form saves every field as checked, and Applied moves the job with its date', async () => {
  type Saved = {
    job: {
      title: string;
      company: string;
      location: string;
      salary: string;
      salaryMin: number;
      salaryMax: number;
      salaryCurrency: string;
      salaryPeriod: string;
      employmentType: string;
      description: string;
      notes: string;
      status: string;
      appliedAt: string | null;
      url: string;
      editedFields: string[];
    };
  };
  const page = `https://job-boards.greenhouse.io/boxinc/jobs/${randomUUID()}`;
  const missing = await call('/jobs/capture', {
    method: 'POST',
    token: ownerToken,
    body: { url: page, text: 'A posting', details: { title: 'Engineer', company: 'Box', location: ' ' } },
  });
  assert.equal(missing.status, 400);
  assert.match(((await missing.json()) as { message: string }).message, /Please enter a location/);

  const saved = (await (
    await call('/jobs/capture', {
      method: 'POST',
      token: ownerToken,
      body: {
        url: page,
        text: 'A posting',
        details: {
          title: 'Software Engineer III',
          company: 'Box',
          location: 'Warsaw, Poland',
          salaryMin: 120000,
          salaryMax: 90000,
          salaryCurrency: 'pln',
          salaryPeriod: 'year',
          employmentType: 'Full-time',
          description: 'Build content creation tools.',
          notes: 'Ask about the team.',
          status: 'applied',
          url: `${page}?from=form`,
        },
      },
    })
  ).json()) as Saved;
  const job = saved.job;
  assert.deepEqual(
    [
      job.title,
      job.company,
      job.location,
      job.salaryMin,
      job.salaryMax,
      job.salaryCurrency,
      job.salaryPeriod,
    ],
    ['Software Engineer III', 'Box', 'Warsaw, Poland', 90000, 120000, 'PLN', 'year'],
  );
  assert.equal(job.salary, '90,000 – 120,000 PLN / year');
  assert.deepEqual(
    [job.employmentType, job.description, job.notes, job.url],
    ['Full-time', 'Build content creation tools.', 'Ask about the team.', `${page}?from=form`],
  );
  assert.equal(job.status, 'applied');
  assert.ok(job.appliedAt);
  assert.deepEqual([...job.editedFields].sort(), [
    'company',
    'description',
    'employmentType',
    'location',
    'salary',
    'title',
  ]);
});

test('notes can be changed on the job page', async () => {
  const { job } = (await (
    await call('/jobs/capture', {
      method: 'POST',
      token: ownerToken,
      body: {
        url: `https://jobs.example.com/${randomUUID()}`,
        text: 'A posting',
        details: { title: 'Engineer', company: 'Acme', location: 'Remote', notes: 'First' },
      },
    })
  ).json()) as { job: { id: string } };
  const edited = await call(`/jobs/${job.id}`, {
    method: 'PATCH',
    user: owner.user.id,
    body: { notes: 'Second' },
  });
  assert.equal(edited.status, 200);
  assert.equal(((await edited.json()) as { notes: string }).notes, 'Second');
});

test('the extension gets when a job was posted from its job board', async () => {
  const url = encodeURIComponent('https://job-boards.greenhouse.io/boxinc/jobs/8267934?gh_src=x');
  assert.equal((await call(`/jobs/posting-date?url=${url}`)).status, 401);
  const found = (await (await call(`/jobs/posting-date?url=${url}`, { token: ownerToken })).json()) as {
    posting: unknown;
  };
  assert.deepEqual(found.posting, {
    posted: '2026-10-30T11:49:29-04:00',
    updated: '2026-11-04T13:11:09-05:00',
    board: 'greenhouse',
  });
  const other = (await (
    await call(`/jobs/posting-date?url=${encodeURIComponent('https://careers.zexter.com/jobs/1')}`, {
      token: ownerToken,
    })
  ).json()) as { posting: unknown };
  assert.equal(other.posting, null);
});

test('Personal info saves explicit employment details and country defaults shared with the extension', async () => {
  const fresh = await createUser('Employment Profile');
  const token = `employment-${randomUUID()}`;
  await prisma.user.update({ where: { id: fresh.user.id }, data: { syncToken: token } });
  const defaults = [
    { kind: 'workAuthorization', scope: 'United States', value: 'No' },
    { kind: 'workAuthorization', scope: 'Canada', value: 'Yes' },
    { kind: 'workAuthorization', scope: 'United Kingdom', value: 'No' },
  ];
  assert.equal((await call('/defaults', { method: 'POST', body: { defaults } })).status, 401);
  assert.equal(
    (await call('/defaults', { method: 'POST', user: fresh.user.id, body: { defaults } })).status,
    200,
  );
  const synced = await call('/extension/defaults', { token });
  assert.equal(synced.status, 200);
  const rows = (await synced.json()) as Array<{ scope: string; value: string }>;
  assert.deepEqual(Object.fromEntries(rows.map((row) => [row.scope, row.value])), {
    'United States': 'No',
    Canada: 'Yes',
    'United Kingdom': 'No',
  });
  const details = {
    eeoRace: '',
    eeoGender: 'Man',
    eeoVeteran: 'No',
    eeoDisability: 'No',
    eeoLgbtq: 'Prefer not to answer',
    requiresSponsorship: 'Yes',
  };
  assert.equal((await call('/profile', { method: 'PUT', user: fresh.user.id, body: details })).status, 200);
  const saved = (await (await call('/profile', { user: fresh.user.id })).json()) as Record<string, string>;
  for (const [key, value] of Object.entries(details)) assert.equal(saved[key], value);
  const separate = (await (await call('/profile', { user: other.user.id })).json()) as Record<string, string>;
  assert.equal(separate.eeoGender, '', 'another account never receives these personal answers');
  assert.equal(
    (await call('/profile', { method: 'PUT', user: fresh.user.id, body: { eeoGender: '' } })).status,
    200,
  );
  assert.equal(
    ((await (await call('/profile', { user: fresh.user.id })).json()) as Record<string, string>).eeoGender,
    '',
    'a saved answer can be cleared',
  );
  assert.equal(await prisma.resume.count({ where: { profileId: fresh.profile.id } }), 0);
});
