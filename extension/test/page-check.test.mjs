import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const check = read('src/page-check.js');

test('every job system mark in site-fields.js is in the page check', () => {
  const context = { window: {} };
  vm.runInNewContext(read('src/site-fields.js'), context);
  const marks = context.window.CVAutofillSiteFields.flatMap((site) => site.markers ?? []).filter((mark) => typeof mark === 'string');
  assert.ok(marks.length > 20);
  for (const mark of marks) assert.ok(check.includes(`'${mark}'`), mark);
});

test('job addresses count as job pages, ordinary ones do not', () => {
  const words = new RegExp(check.match(/JOB_WORDS = \/(.+)\/i;/)[1], 'i');
  for (const address of [
    'https://acme.wd5.myworkdayjobs.com/en-US/External/job/Vancouver/Engineer_R1', 'https://boards.greenhouse.io/acme/jobs/1', 'https://job-boards.greenhouse.io/acme/jobs/1',
    'https://jobs.lever.co/acme/1/apply', 'https://jobs.ashbyhq.com/acme/1/application', 'https://careers-acme.icims.com/jobs/1/engineer/login', 'https://acme.taleo.net/careersection/ex/jobdetail.ftl',
    'https://jobs.smartrecruiters.com/Acme/1', 'https://jobs.jobvite.com/acme/job/1', 'https://acme.teamtailor.com/jobs/1', 'https://www.linkedin.com/jobs/view/1', 'https://www.indeed.com/viewjob?jk=1',
    'https://www.glassdoor.com/Job/acme.htm', 'https://careers.lululemon.com/en_US/careers/ApplicationForm/1', 'https://www.orderful.com/about/careers?ashby_jid=1',
  ]) assert.ok(words.test(address), address);
  for (const address of ['https://www.nytimes.com/section/world', 'https://github.com/acme/app/pulls', 'https://www.amazon.com/dp/B000', 'https://mail.google.com/mail/u/0/']) assert.ok(!words.test(address), address);
});

test('the page check is the only script Chrome puts on every page, and stays small', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const everywhere = manifest.content_scripts.filter((entry) => entry.matches.includes('https://*/*'));
  assert.deepEqual(everywhere.map((entry) => entry.js), [['src/page-check.js']]);
  assert.ok(statSync(new URL('../src/page-check.js', import.meta.url)).size < 6000);
});
