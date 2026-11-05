import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boardPosting } from '../src/modules/jobs/domain/board-posting';
import { PublicBoardDatesReader } from '../src/modules/jobs/adapters/outbound/boards/public-board-dates.reader';
import { GetPostingDates } from '../src/modules/jobs/application/use-cases/get-posting-dates';

test('a job posting is found from its address on each board', () => {
  const cases: [string, string | null][] = [
    ['https://job-boards.greenhouse.io/boxinc/jobs/8267934?gh_src=a89ki7sr1us', 'greenhouse boxinc 8267934 '],
    ['https://boards.greenhouse.io/embed/job_app?for=boxinc&token=8267934', 'greenhouse boxinc 8267934 '],
    ['https://job-boards.eu.greenhouse.io/acme/jobs/4012345', 'greenhouse acme 4012345 eu'],
    [
      'https://jobs.lever.co/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd/apply',
      'lever palantir 6ed76ce8-4156-4b60-b120-403538bd66cd ',
    ],
    [
      'https://jobs.eu.lever.co/acme/6ed76ce8-4156-4b60-b120-403538bd66cd',
      'lever acme 6ed76ce8-4156-4b60-b120-403538bd66cd eu',
    ],
    [
      'https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245/application',
      'ashby ramp 34413f8d-26bf-4bbc-8ade-eb309a0e2245 ',
    ],
    [
      'https://jobs.smartrecruiters.com/BoschGroup/744000159777230-production-engineering-intern',
      'smartrecruiters BoschGroup 744000159777230 ',
    ],
    ['https://job-boards.greenhouse.io/boxinc', null],
    ['https://jobs.lever.co/palantir', null],
    ['https://careers.zexter.com/jobs/8522943-backend-developer', null],
    ['not a url', null],
  ];
  for (const [url, want] of cases) {
    const found = boardPosting(url);
    assert.equal(found && `${found.board} ${found.account} ${found.id} ${found.eu ? 'eu' : ''}`, want, url);
  }
});

const reply = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );

test('each board API answer becomes the posting dates', async () => {
  const asked: string[] = [];
  const reader = new PublicBoardDatesReader((url) => {
    asked.push(url);
    if (url.includes('greenhouse'))
      return reply({ first_published: '2026-10-30T11:49:29-04:00', updated_at: '2026-11-04T13:11:09-05:00' });
    if (url.includes('lever')) return reply({ createdAt: Date.UTC(2026, 9, 1, 12) });
    if (url.includes('ashbyhq'))
      return reply({
        jobs: [
          { id: 'other', publishedAt: '2026-01-01T00:00:00Z' },
          { id: '34413f8d-26bf-4bbc-8ade-eb309a0e2245', publishedAt: '2026-04-07T17:12:35.753+00:00' },
        ],
      });
    if (url.includes('smartrecruiters')) return reply({ releasedDate: '2026-11-05T03:52:53.659Z' });
    return reply({}, 404);
  });
  const read = (url: string) => reader.read(boardPosting(url)!);
  assert.deepEqual(await read('https://job-boards.greenhouse.io/boxinc/jobs/8267934'), {
    posted: '2026-10-30T11:49:29-04:00',
    updated: '2026-11-04T13:11:09-05:00',
  });
  assert.deepEqual(await read('https://jobs.lever.co/palantir/6ed76ce8-4156-4b60-b120-403538bd66cd'), {
    posted: '2026-10-01T12:00:00.000Z',
    updated: null,
  });
  assert.deepEqual(await read('https://jobs.ashbyhq.com/ramp/34413f8d-26bf-4bbc-8ade-eb309a0e2245'), {
    posted: '2026-04-07T17:12:35.753+00:00',
    updated: null,
  });
  assert.deepEqual(await read('https://jobs.smartrecruiters.com/BoschGroup/744000159777230'), {
    posted: '2026-11-05T03:52:53.659Z',
    updated: null,
  });
  assert.equal(asked[0], 'https://boards-api.greenhouse.io/v1/boards/boxinc/jobs/8267934');
  assert.equal(
    await new PublicBoardDatesReader(() => reply({}, 404)).read(
      boardPosting('https://jobs.lever.co/a/6ed76ce8-4156-4b60-b120-403538bd66cd')!,
    ),
    null,
  );
});

test('posting dates are kept for a day, and unknown sites ask nothing', async () => {
  let now = 0,
    asked = 0;
  const dates = new GetPostingDates(
    {
      read: () => {
        asked++;
        return Promise.resolve({ posted: '2026-10-30T11:49:29-04:00', updated: null });
      },
    },
    () => now,
  );
  const url = 'https://job-boards.greenhouse.io/boxinc/jobs/8267934';
  assert.deepEqual(await dates.execute(url), {
    posted: '2026-10-30T11:49:29-04:00',
    updated: null,
    board: 'greenhouse',
  });
  await dates.execute(`${url}?gh_src=x`);
  assert.equal(asked, 1, 'asked once a day');
  now += 25 * 60 * 60 * 1000;
  await dates.execute(url);
  assert.equal(asked, 2, 'asked again the next day');
  assert.equal(await dates.execute('https://careers.zexter.com/jobs/1'), null);
  assert.equal(asked, 2);
  const failing = new GetPostingDates({ read: () => Promise.reject(new Error('down')) });
  assert.equal(await failing.execute(url), null, 'a board that does not answer gives no date, not an error');
});
