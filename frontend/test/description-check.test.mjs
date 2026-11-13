import assert from 'node:assert/strict';
import { test } from 'node:test';
import { descriptionChecks } from '../src/profile/descriptionCheck.ts';

const job = { keywords: ['Node.js', 'AWS', 'Go', 'PostgreSQL'], title: 'Senior Software Engineer', company: 'Ciklum' };
const missing = text => descriptionChecks({ ...job, text }).filter(item => !item.ok).map(item => item.key);

test('a description: one factual sentence of 15 to 25 words about the product and who uses it', () => {
  for (const good of [
    'Payments platform that lets 300 German online retailers offer invoice and instalment checkout to their shoppers.',
    'Anti-money-laundering system that screens card transactions in real time for compliance teams at 12 regional banks.',
    "Ad exchange that matches publishers' mobile ad slots with advertisers' bids in under 100 ms, about 20,000 requests a second.",
  ]) assert.deepEqual(missing(good), [], good);
});

test('a description: what each rule catches', () => {
  assert.deepEqual(missing('Payments platform for retailers.'), ['length'], 'too short');
  assert.ok(missing('Payments platform for online retailers in Germany offering invoice checkout. It also handles refunds for their shoppers.').includes('sentence'));
  assert.ok(missing('Payments platform that processes invoice and instalment checkout payments in real time across Germany and Austria.').includes('audience'), 'nobody named');
  assert.ok(missing('Built a payments platform that lets online retailers offer invoice and instalment checkout to their shoppers.').includes('product'), 'starts with the work');
  assert.ok(missing('Our payments platform lets online retailers in Germany offer invoice and instalment checkout to their shoppers.').includes('product'), '"our"');
  assert.ok(missing('Payments platform on AWS and Node.js that lets online retailers offer invoice and instalment checkout to shoppers.').includes('tech'));
  assert.ok(!missing('Google Ads reporting tool that shows marketing agencies how their clients\' campaigns perform across every channel.').includes('tech'), '"Go" is not in "Google"');
  assert.ok(missing('Payments platform that cut checkout drop-off by 30% for online retailers offering invoice and instalment checkout.').includes('result'));
  assert.ok(missing('Innovative payments platform that lets online retailers offer invoice and instalment checkout to their shoppers.').includes('buzz'));
  assert.ok(missing('Ciklum payments platform that lets online retailers offer invoice and instalment checkout to their shoppers.').includes('title'), 'the company is already above');
});
