/**
 * Answers the extension uses for one kind of question, set from a field's icon.
 *
 * Eligibility answers belong to one country: "Poland: Yes" for sponsorship is
 * never used for a question about Germany. "Worked here before" is one answer
 * for every company (empty scope). An empty scope is the general answer.
 */

export const DEFAULT_KINDS = ['workAuthorization', 'requiresSponsorship', 'workedHereBefore'] as const;
export type DefaultKind = (typeof DEFAULT_KINDS)[number];

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
