/**
 * Answers the extension uses for one kind of question, set from a field's icon.
 *
 * Eligibility answers belong to one country: "Poland: Yes" for sponsorship is
 * never used for a question about Germany. "Worked here before" is one answer
 * for every company (empty scope). "Willing to relocate" is per country, like
 * eligibility. An empty scope is the general answer.
 */

export const DEFAULT_KINDS = [
  'workAuthorization',
  'requiresSponsorship',
  'workedHereBefore',
  'willingToRelocate',
  // Work authorization per country, as Jobright asks it (its "Equal Employment" step):
  // a country you want to work in, whether you are its citizen, on what basis you may
  // work there and with which permit, and (ours) when that permit expires.
  'workCountry',
  'citizenship',
  'authorizationBasis',
  'workPermit',
  'workPermitExpiry',
] as const;
export type DefaultKind = (typeof DEFAULT_KINDS)[number];

/** On what basis a person may work in a country. A citizen needs no basis; "not authorized" is set for them. */
export const AUTHORIZATION_BASES = ['CITIZEN', 'PERMANENT_RESIDENT', 'TEMPORARY_WORK_AUTHORIZATION', 'OTHER', 'NOT_CURRENTLY_AUTHORIZED'] as const;

/** Why a default's value cannot be kept, or null. Yes/No kinds keep the wording a form used before ("Yes, I am"). */
export function defaultValueProblem(kind: DefaultKind, value: string): string | null {
  const text = value.trim();
  if (kind === 'workCountry' && text !== 'Yes') return 'A country you want to work in is saved as "Yes".';
  if (kind === 'citizenship' && !['Yes', 'No'].includes(text)) return 'Citizenship is "Yes" or "No".';
  if (kind === 'authorizationBasis' && !(AUTHORIZATION_BASES as readonly string[]).includes(text)) return 'Unknown authorization basis.';
  if (kind === 'workPermit' && !/^[A-Z0-9_]{1,60}$/.test(text)) return 'Unknown work permit type.';
  if (kind === 'workPermitExpiry' && !/^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/.test(text)) return 'A permit expiry date is YYYY-MM or YYYY-MM-DD.';
  return null;
}

export interface AutofillDefault {
  id: string;
  kind: DefaultKind;
  scope: string;
  value: string;
  updatedAt: Date;
}

export interface NewDefault {
  kind: DefaultKind;
  scope: string;
  value: string;
}

export class DefaultNotFoundError extends Error {
  constructor() {
    super('No such default answer.');
    this.name = 'DefaultNotFoundError';
  }
}

/** A value that does not fit its kind ("Maybe" for citizenship). */
export class DefaultValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DefaultValueError';
  }
}

/** "  poland " and "Poland" are one scope. */
export function scopeKey(scope: string): string {
  return scope.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Trims each default and keeps the last one per kind and scope. Blank values are left out. */
export function cleanDefaults(items: NewDefault[]): (NewDefault & { scopeKey: string })[] {
  const byKey = new Map<string, NewDefault & { scopeKey: string }>();
  for (const item of items) {
    const value = item.value.trim();
    if (!value) continue;
    const scope = item.scope.trim().replace(/\s+/g, ' ');
    byKey.set(`${item.kind}|${scopeKey(scope)}`, {
      kind: item.kind,
      scope,
      scopeKey: scopeKey(scope),
      value,
    });
  }
  return [...byKey.values()];
}
