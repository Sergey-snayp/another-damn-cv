import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jobPlace, workFacts } from '../src/profile/workPlace.ts';

const role = (location, workType) => ({ location, ...(workType && { workType }) });

test('work place: remote / hybrid / on-site apart from where, from new and older saves', () => {
  assert.deepEqual(workFacts(role('Canada', 'remote')), { workType: 'remote', location: 'Canada' });
  assert.deepEqual(workFacts(role('Remote')), { workType: 'remote', location: '' }, 'an older save\'s "Remote" location is the work type');
  assert.deepEqual(workFacts(role(' On-site ')), { workType: 'onsite', location: '' });
  assert.deepEqual(workFacts(role('Remote', 'hybrid')), { workType: 'hybrid', location: '' }, 'the field wins; the old word is not a place');
  assert.deepEqual(workFacts(role('Vancouver, Canada')), { workType: null, location: 'Vancouver, Canada' });
});

test('work place: one line for a CV keeps both', () => {
  assert.equal(jobPlace(role('Canada', 'remote')), 'Canada (Remote)');
  assert.equal(jobPlace(role('Remote')), 'Remote', 'older saves read as before');
  assert.equal(jobPlace(role('', 'hybrid')), 'Hybrid');
  assert.equal(jobPlace(role('Vancouver, Canada')), 'Vancouver, Canada');
  assert.equal(jobPlace(role('')), '');
});
