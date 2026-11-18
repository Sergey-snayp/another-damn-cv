import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bulletBudget } from '../src/resume/bulletBudget.ts';
import { usesKeyword } from '../src/resume/bulletCheck.ts';
import { recruiterFlags } from '../src/resume/readability.ts';

const role = (bullets) => ({ bullets, height: bullets * 30 });

test('a CV that fits two pages loses nothing, and its latest jobs may gain', () => {
  assert.deepEqual(bulletBudget([role(4), role(3), role(2)], 100), [{ min: 4, max: 6 }, { min: 3, max: 4 }, { min: 2, max: 2 }]);
  assert.deepEqual(bulletBudget([role(4)], 0), [{ min: 4, max: 4 }]);
});

test('a CV over two pages gives up bullets from its oldest jobs first', () => {
  assert.deepEqual(bulletBudget([role(8), role(7), role(4), role(2), role(3), role(3)], -70).map((room) => room.min), [8, 7, 4, 2, 2, 1]);
});

test('no job is emptied, however far over the CV runs', () => {
  assert.deepEqual(bulletBudget([role(8), role(7), role(4), role(2), role(3), role(3)], -9000).map((room) => room.min), [3, 3, 2, 2, 1, 1]);
  assert.deepEqual(bulletBudget([role(2), role(1)], -9000).map((room) => room.min), [2, 1], 'never more than a job has');
});

test('"Payments" is shown by a line about payment services; short names stay whole', () => {
  assert.equal(usesKeyword('Delivered 3 payment services.', 'Payments'), true);
  assert.equal(usesKeyword('Ran a law firm.', 'AWS'), false);
});

test('recruiter hints skip what the reader already knows', () => {
  assert.deepEqual(recruiterFlags('Passed 2 PCI DSS audits.'), [], 'PCI DSS is one known name');
  assert.deepEqual(recruiterFlags('Built tools for AML teams.', '', { familiar: 'AML and KYC experience' }), [], 'the posting uses it');
  assert.deepEqual(recruiterFlags('Built HYPT.', 'the largest being HYPT, a platform for venues'), [], 'the CV introduces it');
  assert.match(recruiterFlags('Added PAR lookup.')[0], /PAR/);
});
