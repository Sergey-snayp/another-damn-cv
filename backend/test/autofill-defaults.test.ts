import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanDefaults, defaultValueProblem, scopeKey } from '../src/modules/answers/domain/defaults';
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

test('work authorization per country: each kind keeps only values it understands', () => {
  const ok = (kind: string, value: string) => saveDefaultsSchema.safeParse({ defaults: [{ kind, scope: 'Canada', value }] }).success;
  assert.ok(ok('workCountry', 'Yes'));
  assert.ok(!ok('workCountry', 'Maybe'));
  assert.ok(ok('citizenship', 'No'));
  assert.ok(!ok('citizenship', 'Sometimes'));
  for (const basis of ['CITIZEN', 'PERMANENT_RESIDENT', 'TEMPORARY_WORK_AUTHORIZATION', 'OTHER', 'NOT_CURRENTLY_AUTHORIZED']) assert.ok(ok('authorizationBasis', basis), basis);
  assert.ok(!ok('authorizationBasis', 'tourist'));
  assert.ok(ok('workPermit', 'OPEN_WORK_PERMIT'));
  assert.ok(!ok('workPermit', 'open permit <script>'));
  assert.ok(ok('workPermitExpiry', '2027-03'));
  assert.ok(ok('workPermitExpiry', '2027-03-31'));
  assert.ok(!ok('workPermitExpiry', '03/2027'));
  assert.ok(ok('citizenship', ''), 'a blank value is dropped when saved, as for every kind');
  assert.equal(defaultValueProblem('workAuthorization', 'Yes, I am'), null, 'the older kinds keep their wording');
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
