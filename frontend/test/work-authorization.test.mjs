import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answer, emptyStatus, missingOf, readStatuses, rowsFor, summaryOf, workComplete } from '../src/profile/workAuthorization.ts';

const row = (kind, scope, value, id = `${kind}-${scope}`) => ({ id, kind, scope, value, updatedAt: '2026-11-17' });

test('answers saved before (from the extension) become country cards, nothing lost', () => {
  const rows = [row('workAuthorization', 'Canada', 'Yes'), row('requiresSponsorship', 'Canada', 'No'), row('workAuthorization', 'United States', 'Yes'), row('requiresSponsorship', 'Poland', 'No')];
  const cards = readStatuses(rows);
  assert.deepEqual(cards.map((card) => card.country), ['US', 'CA'], "Jobright's countries that were answered; Poland is not one of them");
  assert.deepEqual(missingOf(cards.find((card) => card.country === 'CA')), ['citizenship'], 'only the new question is missing');
  assert.equal(workComplete(cards), false);
});

test('once countries are chosen, only those are cards', () => {
  const rows = [row('workCountry', 'Canada', 'Yes'), row('workAuthorization', 'United States', 'Yes')];
  assert.deepEqual(readStatuses(rows).map((card) => card.country), ['CA']);
});

test('a citizen needs nothing more; others answer authorization, sponsorship, basis and permit', () => {
  const citizen = answer(emptyStatus('CA'), 'citizenship', 'Yes');
  assert.deepEqual([citizen.authorized, citizen.sponsorship, citizen.basis], ['Yes', 'No', 'CITIZEN']);
  assert.deepEqual(missingOf(citizen), []);
  let permit = answer(emptyStatus('CA'), 'citizenship', 'No');
  assert.deepEqual(missingOf(permit), ['authorized', 'sponsorship']);
  permit = answer(answer(permit, 'authorized', 'Yes'), 'sponsorship', 'No');
  assert.deepEqual(missingOf(permit), ['basis']);
  permit = answer(permit, 'basis', 'TEMPORARY_WORK_AUTHORIZATION');
  assert.deepEqual(missingOf(permit), ['permit'], 'a temporary basis asks for the permit; its expiry is asked, never required');
  permit = answer(answer(permit, 'permit', 'OPEN_WORK_PERMIT'), 'expiry', '2027-03');
  assert.deepEqual(missingOf(permit), []);
  const notAllowed = answer(answer(answer(emptyStatus('US'), 'citizenship', 'No'), 'authorized', 'No'), 'sponsorship', 'Yes');
  assert.equal(notAllowed.basis, 'NOT_CURRENTLY_AUTHORIZED');
  assert.deepEqual(missingOf(notAllowed), []);
  const pr = answer(answer(answer(answer(emptyStatus('CA'), 'citizenship', 'No'), 'authorized', 'Yes'), 'sponsorship', 'No'), 'basis', 'PERMANENT_RESIDENT');
  assert.deepEqual(missingOf(pr), [], 'a permanent resident has no permit to name');
  assert.deepEqual(summaryOf(pr).map((line) => line.answer), ['No', 'Yes', 'No', 'Permanent resident']);
});

test('saving writes only what changed, and a country no longer chosen keeps its answers', () => {
  const rows = [row('workCountry', 'Canada', 'Yes'), row('workAuthorization', 'Canada', 'Yes'), row('workCountry', 'United States', 'Yes'), row('workAuthorization', 'United States', 'Yes')];
  const canada = answer(answer(answer(emptyStatus('CA'), 'citizenship', 'No'), 'authorized', 'Yes'), 'sponsorship', 'No');
  const { save, remove } = rowsFor([canada], rows);
  assert.deepEqual(save.map((item) => `${item.kind}:${item.scope}=${item.value}`).sort(), ['citizenship:Canada=No', 'requiresSponsorship:Canada=No', 'workCountry:Canada=Yes'].sort());
  assert.deepEqual(remove, ['workCountry-United States'], 'the US is no longer chosen; its authorization answer stays');
});
