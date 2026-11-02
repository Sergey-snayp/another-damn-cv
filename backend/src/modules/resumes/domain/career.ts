import type { CareerFields, Experience } from './resume';
export function careerFrom(roles: Experience[], year: number): CareerFields {
  if (!roles.length) return { currentCompany: '', currentTitle: '', yearsExperience: '' };
  const current =
    roles.find((role) => role.current) ??
    [...roles].sort((a, b) => (b.from ?? '').localeCompare(a.from ?? ''))[0];
  const earliest = roles
    .map((role) => role.from)
    .filter(Boolean)
    .sort()[0];
  const startYear = earliest ? Number(earliest.slice(0, 4)) : NaN;
  return {
    currentCompany: current.company,
    currentTitle: current.title,
    yearsExperience:
      Number.isFinite(startYear) && startYear > 1950 ? String(Math.max(0, year - startYear)) : '',
  };
}
