import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkBullet, isActionVerb } from '../src/resume/bulletCheck.ts';

test('a bullet is checked like a recruiter checker: length, verb, metric, time, keywords', () => {
  const good = checkBullet(
    'Built a TLS certificate service from scratch on AWS Step Functions, renewing 2,000 certificates a day for 3 years; still in production.',
    ['Step Functions', 'Kafka', 'node.js'],
  );
  assert.equal(good.length, 'good');
  assert.equal(good.actionVerb, true);
  assert.equal(good.metric, true);
  assert.equal(good.time, true);
  assert.deepEqual(good.keywords, { used: ['Step Functions'], total: 3 });

  const thin = checkBullet('Configured CloudWatch alarms routed to SNS and Slack for monitoring.');
  assert.equal(thin.length, 'short');
  assert.equal(thin.metric, false, 'no number');
  assert.equal(thin.time, false);
  assert.equal(thin.keywords, null);

  assert.equal(checkBullet('Used Route53 and EC2 for 3-D Secure.').metric, false, 'digits inside names are not numbers');
  assert.equal(checkBullet('Cut costs by 30%.').metric, true);
  assert.equal(checkBullet('Mentored two juniors.').metric, true);
  assert.equal(checkBullet('Responsible for APIs.').actionVerb, false);
  assert.ok(isActionVerb('Led') && isActionVerb('Orchestrated') && !isActionVerb('Used'));
  assert.equal(checkBullet('Ran payment APIs handling ~20,000 transactions daily.').time, true);
  assert.ok(checkBullet('Built APIs in NodeJS.', ['Node.js']).keywords.used.length === 1);
});
