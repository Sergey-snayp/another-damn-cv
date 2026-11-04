import {
  CONTACT_KEYS,
  normalizeWorkArrangements,
  type ContactFields,
  type StoredContactKey,
  type StoredProfile,
} from './contact';

const COMPUTED = new Set<string>(['fullName', 'currentCompany', 'currentTitle', 'yearsExperience']);

export function contactValues(profile: StoredProfile): ContactFields {
  const contact = Object.fromEntries(
    CONTACT_KEYS.map((key) => [key, (profile as unknown as Record<string, unknown>)[key] ?? '']),
  ) as unknown as ContactFields;
  return { ...contact, fullName: [profile.firstName, profile.lastName].filter(Boolean).join(' ') };
}

/** Keep existing coercion and omitted-field behavior at the API boundary. */
export function storedContactChanges(
  incoming: Partial<ContactFields>,
): Partial<Record<StoredContactKey, string>> {
  const data: Partial<Record<StoredContactKey, string>> = {};
  for (const key of CONTACT_KEYS) {
    if (COMPUTED.has(key)) continue;
    if (incoming[key] === undefined) continue;
    data[key as StoredContactKey] =
      key === 'workArrangements' ? normalizeWorkArrangements(String(incoming[key])) : String(incoming[key]);
  }
  if (incoming.fullName && !incoming.firstName && !incoming.lastName) {
    const [firstName = '', ...rest] = incoming.fullName.split(' ');
    data.firstName = firstName;
    data.lastName = rest.join(' ');
  }
  return data;
}
