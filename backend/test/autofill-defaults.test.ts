import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanDefaults, scopeKey } from '../src/modules/answers/domain/defaults';
import { extensionProfileSchema } from '../src/modules/profiles/adapters/inbound/http/profiles.controller';
import { saveDefaultsSchema } from '../src/modules/answers/adapters/inbound/http/defaults.controller';

test('a country or company is one scope regardless of case and spacing', () => {
  assert.equal(scopeKey('  Poland '), 'poland');
  assert.equal(scopeKey('United  Kingdom'), scopeKey('united kingdom'));
  assert.equal(scopeKey(''), '');
});

test('defaults are trimmed, blank ones dropped and the last one per kind and scope kept', () => {
  assert.deepEqual(
    cleanDefaults([
      { kind: 'requiresSponsorship', scope: 'Poland', value: 'No' },
      { kind: 'requiresSponsorship', scope: 'poland ', value: ' Yes ' },
      { kind: 'workAuthorization', scope: 'Poland', value: 'Yes' },
      { kind: 'workAuthorization', scope: 'Germany', value: '  ' },
      { kind: 'workedHereBefore', scope: 'Box', value: 'No' },
    ]),
    [
      { kind: 'requiresSponsorship', scope: 'poland', scopeKey: 'poland', value: 'Yes' },
      { kind: 'workAuthorization', scope: 'Poland', scopeKey: 'poland', value: 'Yes' },
      { kind: 'workedHereBefore', scope: 'Box', scopeKey: 'box', value: 'No' },
    ],
  );
});

test('only known kinds can be saved as defaults', () => {
  assert.ok(
    saveDefaultsSchema.safeParse({ defaults: [{ kind: 'workAuthorization', scope: 'Poland', value: 'Yes' }] })
      .success,
  );
  assert.ok(
    !saveDefaultsSchema.safeParse({ defaults: [{ kind: 'email', scope: '', value: 'x@y.z' }] }).success,
  );
  assert.ok(!saveDefaultsSchema.safeParse({ defaults: [] }).success);
});

test('the extension may set fillable profile values but not name or email', () => {
  assert.ok(extensionProfileSchema.safeParse({ phone: '+48 600 000 000' }).success);
  assert.ok(!extensionProfileSchema.safeParse({ email: 'someone@else.com' }).success);
  assert.ok(!extensionProfileSchema.safeParse({ firstName: 'Mallory' }).success);
  assert.ok(!extensionProfileSchema.safeParse({}).success);
  assert.ok(!extensionProfileSchema.safeParse({ phone: '   ' }).success);
});

test('types of work are stored as known kinds in a fixed order', async () => {
  const { normalizeWorkArrangements } = await import('../src/modules/profiles/domain/contact');
  assert.equal(normalizeWorkArrangements('On-site, Remote'), 'remote,onsite');
  assert.equal(normalizeWorkArrangements('hybrid,hybrid,office'), 'hybrid,onsite');
  assert.equal(normalizeWorkArrangements('anywhere'), '');
  assert.ok(extensionProfileSchema.safeParse({ workArrangements: 'remote,hybrid' }).success);
  assert.ok(
    saveDefaultsSchema.safeParse({ defaults: [{ kind: 'willingToRelocate', scope: 'Poland', value: 'Yes' }] })
      .success,
  );
});
