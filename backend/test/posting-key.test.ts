import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postingKey } from '../src/modules/jobs/domain/posting-key';
import { FindCapturedJob } from '../src/modules/jobs/application/use-cases/find-captured-job';

test("an application's pages share its job number: Avature's form finds the job saved from its job page", async () => {
  const page = 'https://careers.lululemon.com/en_US/careers/JobDetail/Staff-Software-Engineer-Digital-Engineering/65847';
  assert.deepEqual(postingKey(page), { host: 'careers.lululemon.com', id: '65847' });
  assert.deepEqual(postingKey('https://careers.lululemon.com/en_US/careers/ApplicationForm?jobId=65847&source=LinkedIn'), { host: 'careers.lululemon.com', id: '65847' });
  assert.equal(postingKey('https://careers.lululemon.com/en_US/careers/SearchJobs'), null);

  const job = (id: string, url: string) => ({ id, url, canonicalUrl: url }) as never;
  const saved = [job('lulu', page), job('other', 'https://careers.lululemon.com/en_US/careers/JobDetail/Designer/70001')];
  const find = new FindCapturedJob({
    findByCanonicalUrl: async (_user: string, canonical: string) => saved.find((item: { canonicalUrl: string }) => item.canonicalUrl === canonical) ?? null,
    findOnHost: async () => saved,
  });
  assert.equal((await find.execute('u', 'https://careers.lululemon.com/en_US/careers/ApplicationForm?jobId=65847&source=LinkedIn'))?.id, 'lulu');
  assert.equal((await find.execute('u', page))?.id, 'lulu', 'the same address first');
  assert.equal(await find.execute('u', 'https://careers.lululemon.com/en_US/careers/ApplicationForm?jobId=99999'), null, 'another number is another job');
  assert.equal(await find.execute('u', 'https://careers.lululemon.com/en_US/careers/Register'), null, 'no number, no guess');
});
