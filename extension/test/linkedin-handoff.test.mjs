import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tabOpenedBy } from '../src/linkedin-handoff.js';

test('Apply on LinkedIn: the job goes to the tab that click opened, whichever arrives first', () => {
  const clicked = { tabId: 7, at: 1_000_000 };
  assert.equal(tabOpenedBy(clicked, [{ tabId: 9, opener: 7, at: 1_000_400 }], 1_000_500)?.tabId, 9, 'the new tab after the click');
  assert.equal(tabOpenedBy(clicked, [{ tabId: 9, opener: 7, at: 999_800 }], 1_000_100)?.tabId, 9, 'the new tab reported before the click');
  assert.equal(tabOpenedBy(clicked, [{ tabId: 9, opener: 3, at: 1_000_400 }], 1_000_500), null, 'a tab opened from another tab');
  assert.equal(tabOpenedBy(clicked, [{ tabId: 9, opener: 7, at: 1_030_000 }], 1_030_000), null, 'a tab opened long after the click');
  assert.equal(tabOpenedBy(null, [{ tabId: 9, opener: 7, at: 1 }], 2), null, 'no click');
});
