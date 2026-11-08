import type { CareerFields, StoredContactKey } from './contact';

export const IMPORT_CONTACT_KEYS = [
  'firstName',
  'lastName',
  'preferredName',
  'email',
  'phone',
  'location',
  'city',
  'state',
  'country',
  'postalCode',
  'linkedin',
  'github',
  'portfolio',
  'website',
] as const;
export type ImportContactKey = (typeof IMPORT_CONTACT_KEYS)[number];
export interface CareerExperience {
  company: string;
  title: string;
  client: string;
  location: string;
  from: string;
  to: string;
  current: boolean;
  description: string;
  bullets: string[];
  /** The job's tools as one line, "Node.js, TypeScript, PostgreSQL". Missing on older saves. */
  techStack?: string;
}
export interface CareerEducation {
  institution: string;
  degree: string;
  field: string;
  from: string;
  to: string;
}
export interface CareerSections {
  summary: string;
  experiences: CareerExperience[];
  educations: CareerEducation[];
  skills: string[];
}
export type CareerSource =
  | { kind: 'file'; name: string }
  | { kind: 'resume'; id: string; snapshot: number }
  | { kind: 'profile' };
export interface CareerSection<T> {
  value: T;
  source: CareerSource;
  importedAt: string;
}
export type CareerData = { [K in keyof CareerSections]?: CareerSection<CareerSections[K]> };
export interface CareerState {
  revision: number;
  data: CareerData;
}
export interface CareerImport {
  expectedRevision: number;
  contact: Partial<Record<ImportContactKey, string>>;
  expectedContact: Partial<Record<ImportContactKey, string>>;
  sections: Partial<CareerSections>;
  source: CareerSource;
}
export class CareerImportError extends Error {
  constructor(
    readonly code: 'invalid' | 'conflict' | 'not-found',
    message: string,
  ) {
    super(message);
  }
}
export function validateCareerImport(input: CareerImport): void {
  const keys = Object.keys(input.contact);
  if (!keys.length && !Object.keys(input.sections).length)
    throw new CareerImportError('invalid', 'Select at least one field or section to import.');
  if (
    keys.length !== Object.keys(input.expectedContact).length ||
    keys.some((key) => !Object.hasOwn(input.expectedContact, key))
  )
    throw new CareerImportError(
      'invalid',
      'Each selected contact field needs its current value. Reload the review.',
    );
}
export function mergeCareer(state: CareerState, input: CareerImport, importedAt: string): CareerState {
  const data = { ...state.data };
  for (const key of Object.keys(input.sections) as (keyof CareerSections)[]) {
    Object.assign(data, { [key]: { value: input.sections[key], source: input.source, importedAt } });
  }
  return { revision: state.revision + 1, data };
}
export const conflict = () =>
  new CareerImportError(
    'conflict',
    'Your profile changed in another session. Close and reopen the editor to review the latest values before saving.',
  );
export function selectedContactChanged(
  existing: Partial<Record<StoredContactKey, string | null>>,
  input: CareerImport,
): boolean {
  return (Object.keys(input.contact) as ImportContactKey[]).some(
    (key) => (existing[key] ?? '') !== input.expectedContact[key],
  );
}
/** Same approximate year display as the legacy CV view; no invented total when dates are missing. */
export function careerFields(roles: CareerExperience[], year: number): CareerFields {
  if (!roles.length) return { currentCompany: '', currentTitle: '', yearsExperience: '' };
  const current =
    roles.find((role) => role.current) ?? [...roles].sort((a, b) => b.from.localeCompare(a.from))[0];
  const first = roles
    .map((role) => role.from)
    .filter(Boolean)
    .sort()[0];
  const start = first ? Number(first.slice(0, 4)) : NaN;
  return {
    currentCompany: current.company,
    currentTitle: current.title,
    yearsExperience: Number.isFinite(start) && start > 1950 ? String(Math.max(0, year - start)) : '',
  };
}

/** Career sections as the extension shows them: every section present, empty when not imported. */
export function fullSections(data: CareerData): CareerSections {
  return {
    summary: data.summary?.value ?? '',
    experiences: data.experiences?.value ?? [],
    educations: data.educations?.value ?? [],
    skills: data.skills?.value ?? [],
  };
}

export interface AutofillCareerFields extends CareerFields {
  school: string;
  degree: string;
  fieldOfStudy: string;
  graduationYear: string;
}

/** Current role and years from the experience, and the latest education, for Autofill. */
export function autofillCareerFields(sections: CareerSections, year: number): AutofillCareerFields {
  const latest = [...sections.educations].sort((a, b) => (b.to || b.from).localeCompare(a.to || a.from))[0];
  return {
    ...careerFields(sections.experiences, year),
    school: latest?.institution ?? '',
    degree: latest?.degree ?? '',
    fieldOfStudy: latest?.field ?? '',
    graduationYear: latest?.to?.slice(0, 4) ?? '',
  };
}
