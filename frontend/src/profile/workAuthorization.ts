import type { AutofillDefault } from "./answersApi";

/**
 * Work authorization per country, asked as Jobright asks it: the countries you
 * want to work in, then for each one "Are you a citizen?"; if not, whether you
 * may work there, whether you will need sponsorship, on what basis, and with
 * which permit. Ours also asks when a temporary permit expires (forms such as
 * UBC's ask for it).
 *
 * Stored as default answers per country (kind + country), the same rows the
 * extension already reads for "authorized to work" and "needs sponsorship".
 */

export const COUNTRIES = [
  { code: "US", name: "United States", article: "the United States", flag: "🇺🇸" },
  { code: "CA", name: "Canada", article: "Canada", flag: "🇨🇦" },
  { code: "GB", name: "United Kingdom", article: "the United Kingdom", flag: "🇬🇧" },
  { code: "AU", name: "Australia", article: "Australia", flag: "🇦🇺" },
  { code: "IE", name: "Ireland", article: "Ireland", flag: "🇮🇪" },
  { code: "NZ", name: "New Zealand", article: "New Zealand", flag: "🇳🇿" },
] as const;
export type CountryCode = (typeof COUNTRIES)[number]["code"];
export const countryOf = (code: CountryCode) => COUNTRIES.find((country) => country.code === code)!;

export const BASES = [
  { value: "PERMANENT_RESIDENT", label: "Permanent resident" },
  { value: "TEMPORARY_WORK_AUTHORIZATION", label: "Temporary work authorization" },
  { value: "OTHER", label: "Other" },
] as const;
export type Basis = (typeof BASES)[number]["value"] | "CITIZEN" | "NOT_CURRENTLY_AUTHORIZED";

/** Each country's permits and visas, as Jobright lists them. */
export const PERMITS: Record<CountryCode, { value: string; label: string }[]> = {
  US: [
    { value: "CPT", label: "CPT" }, { value: "E_3", label: "E-3" }, { value: "EAD", label: "EAD" }, { value: "F_1", label: "F-1" },
    { value: "H_1B", label: "H-1B" }, { value: "J_1", label: "J-1" }, { value: "L_1", label: "L-1" }, { value: "O_1", label: "O-1" },
    { value: "OPT", label: "OPT" }, { value: "REFUGEE_OR_ASYLEE", label: "Refugee or Asylee" }, { value: "TN", label: "TN" }, { value: "OTHER", label: "Other" },
  ],
  CA: [
    { value: "EMPLOYER_SPECIFIC_WORK_PERMIT", label: "Employer-specific Work Permit" },
    { value: "OPEN_WORK_PERMIT", label: "Open Work Permit" },
    { value: "STUDY_PERMIT_WITH_WORK_AUTHORIZATION", label: "Study Permit" },
    { value: "OTHER", label: "Other" },
  ],
  GB: [
    { value: "FAMILY_DEPENDANT_VISA_WITH_WORK_PERMISSION", label: "Family / Spouse Visa" },
    { value: "GLOBAL_TALENT_VISA", label: "Global Talent Visa" },
    { value: "GRADUATE_VISA", label: "Graduate Visa" },
    { value: "HIGH_POTENTIAL_INDIVIDUAL_VISA", label: "High Potential Individual Visa (HPI)" },
    { value: "SKILLED_WORKER_HEALTH_AND_CARE_WORKER_VISA", label: "Skilled Worker Visa" },
    { value: "STUDENT_VISA", label: "Student Visa" },
    { value: "UK_ANCESTRY_VISA", label: "UK Ancestry visa" },
    { value: "YOUTH_MOBILITY_SCHEME_VISA", label: "Youth Mobility Visa" },
    { value: "OTHER", label: "Other" },
  ],
  AU: [
    { value: "PARTNER_FAMILY_VISA_WITH_WORK_RIGHTS", label: "Partner / Family Visa (Subclass 820)" },
    { value: "STUDENT_VISA_SUBCLASS_500", label: "Student Visa (Subclass 500)" },
    { value: "TEMPORARY_GRADUATE_VISA_SUBCLASS_485", label: "Temporary Graduate Visa (Subclass 485)" },
    { value: "WORKING_HOLIDAY_WORK_AND_HOLIDAY_VISA_SUBCLASS_417_462", label: "Working Holiday (Subclass 417/462)" },
    { value: "OTHER", label: "Other" },
  ],
  IE: [
    { value: "CRITICAL_SKILLS_EMPLOYMENT_PERMIT_STAMP_1", label: "Critical Skills Employment Permit (CSEP)" },
    { value: "STAMP_1G_GRADUATE", label: "Stamp 1G (Graduate)" },
    { value: "STAMP_1G_SPOUSE_PARTNER", label: "Stamp 1G (Spouse / Partner)" },
    { value: "STAMP_2", label: "Stamp 2" },
    { value: "STAMP_4", label: "Stamp 4" },
    { value: "OTHER", label: "Other" },
  ],
  NZ: [
    { value: "ACCREDITED_EMPLOYER_WORK_VISA", label: "Accredited Employer Work Visa (AEWV)" },
    { value: "PARTNER_WORK_VISA", label: "Family / Partner Visa" },
    { value: "POST_STUDY_WORK_VISA", label: "Post Study Work Visa" },
    { value: "STUDENT_VISA_WITH_WORK_CONDITIONS", label: "Student Visa" },
    { value: "WORKING_HOLIDAY_VISA", label: "Working Holiday Visa" },
    { value: "OTHER", label: "Other" },
  ],
};

export type YesNo = "" | "Yes" | "No";
export interface CountryStatus {
  country: CountryCode;
  citizenship: YesNo;
  authorized: YesNo;
  sponsorship: YesNo;
  basis: "" | Basis;
  permit: string;
  /** When a temporary permit expires: "2027-03" or "2027-03-31". */
  expiry: string;
}

/** The kinds stored per country, and the field of a status each one holds. */
const KINDS = {
  citizenship: "citizenship",
  authorized: "workAuthorization",
  sponsorship: "requiresSponsorship",
  basis: "authorizationBasis",
  permit: "workPermit",
  expiry: "workPermitExpiry",
} as const;
type Field = keyof typeof KINDS;

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const yesNo = (value: string | undefined): YesNo => (/^\s*yes\b/i.test(value ?? "") ? "Yes" : /^\s*no\b/i.test(value ?? "") ? "No" : "");

/** A permit is asked for a temporary or other basis, as Jobright asks it. */
export const needsPermit = (status: CountryStatus) => status.authorized === "Yes" && (status.basis === "TEMPORARY_WORK_AUTHORIZATION" || status.basis === "OTHER");

/**
 * The countries and their answers from the saved rows. Countries chosen in this
 * form are kept as "workCountry"; before any were chosen, a country already
 * answered from the extension ("authorized to work in Canada: Yes") becomes a
 * card with those answers in it, so nothing answered before is lost.
 */
export function readStatuses(rows: AutofillDefault[]): CountryStatus[] {
  const value = (kind: string, country: string) => rows.find((row) => row.kind === kind && same(row.scope, country))?.value ?? "";
  const chosen = COUNTRIES.filter((country) => value("workCountry", country.name) === "Yes");
  const anyChosen = rows.some((row) => row.kind === "workCountry");
  const answered = COUNTRIES.filter((country) => (["workAuthorization", "requiresSponsorship", "citizenship"] as const).some((kind) => value(kind, country.name)));
  const countries = anyChosen ? chosen : answered;
  return countries.map((country) => {
    const basis = value("authorizationBasis", country.name) as CountryStatus["basis"];
    return {
      country: country.code,
      citizenship: yesNo(value("citizenship", country.name)),
      authorized: yesNo(value("workAuthorization", country.name)),
      sponsorship: yesNo(value("requiresSponsorship", country.name)),
      basis: BASES.some((option) => option.value === basis) || basis === "CITIZEN" || basis === "NOT_CURRENTLY_AUTHORIZED" ? basis : "",
      permit: value("workPermit", country.name),
      expiry: value("workPermitExpiry", country.name),
    };
  });
}

export const emptyStatus = (country: CountryCode): CountryStatus => ({ country, citizenship: "", authorized: "", sponsorship: "", basis: "", permit: "", expiry: "" });

/**
 * One answer changed, and what follows from it, as Jobright works it out:
 * a citizen may work there and needs no sponsorship; someone not authorized
 * has no basis to choose; a new basis clears the permit.
 */
export function answer(status: CountryStatus, field: Field, next: string): CountryStatus {
  const updated = { ...status, [field]: next } as CountryStatus;
  if (field === "citizenship") return next === "Yes" ? { ...updated, authorized: "Yes", sponsorship: "No", basis: "CITIZEN", permit: "", expiry: "" } : { ...updated, basis: status.basis === "CITIZEN" ? "" : status.basis };
  if (field === "authorized") return { ...updated, basis: next === "No" ? "NOT_CURRENTLY_AUTHORIZED" : status.basis === "NOT_CURRENTLY_AUTHORIZED" ? "" : status.basis, permit: "", expiry: next === "No" ? "" : status.expiry };
  if (field === "basis") return { ...updated, permit: "", expiry: next === "TEMPORARY_WORK_AUTHORIZATION" ? status.expiry : "" };
  return updated;
}

/** The questions a card still needs answered (the expiry date is asked, never required). */
export function missingOf(status: CountryStatus): Field[] {
  if (!status.citizenship) return ["citizenship"];
  if (status.citizenship === "Yes") return [];
  const missing: Field[] = [];
  if (!status.authorized) missing.push("authorized");
  if (!status.sponsorship) missing.push("sponsorship");
  if (status.authorized === "Yes" && !status.basis) missing.push("basis");
  if (needsPermit(status) && !status.permit) missing.push("permit");
  return missing;
}

/** Whether the whole work authorization is answered: at least one country, each card complete. */
export const workComplete = (statuses: CountryStatus[]) => statuses.length > 0 && statuses.every((status) => missingOf(status).length === 0);

/**
 * The rows to write for these cards, and the ids of rows to remove: a country
 * no longer chosen loses its "workCountry" row only, so the answers the
 * extension uses for it stay.
 */
export function rowsFor(statuses: CountryStatus[], rows: AutofillDefault[]) {
  const save: { kind: string; scope: string; value: string }[] = [];
  const remove: string[] = [];
  const existing = (kind: string, country: string) => rows.find((row) => row.kind === kind && same(row.scope, country));
  for (const status of statuses) {
    const name = countryOf(status.country).name;
    save.push({ kind: "workCountry", scope: name, value: "Yes" });
    for (const [field, kind] of Object.entries(KINDS) as [Field, string][]) {
      const value = status[field];
      const row = existing(kind, name);
      if (value) { if (row?.value !== value) save.push({ kind, scope: name, value }); }
      else if (row) remove.push(row.id);
    }
  }
  for (const country of COUNTRIES) {
    if (statuses.some((status) => status.country === country.code)) continue;
    const row = existing("workCountry", country.name);
    if (row) remove.push(row.id);
  }
  return { save, remove };
}

/** What Profile shows for a card: each question asked and its answer ("" when not answered). */
export function summaryOf(status: CountryStatus): { question: string; answer: string }[] {
  const { name, article } = countryOf(status.country);
  const lines: { question: string; answer: string }[] = [{ question: `Are you a citizen of ${article}?`, answer: status.citizenship }];
  if (status.citizenship === "Yes") return lines;
  lines.push(
    { question: `Are you legally authorized to work in ${article}?`, answer: status.authorized },
    { question: `Will you now or in the future require employer sponsorship in ${article}?`, answer: status.sponsorship },
  );
  if (status.authorized === "Yes") lines.push({ question: `${name}: Authorization basis`, answer: BASES.find((option) => option.value === status.basis)?.label ?? "" });
  if (needsPermit(status)) lines.push({ question: `${name}: Work permit or visa type`, answer: PERMITS[status.country].find((option) => option.value === status.permit)?.label ?? status.permit });
  if (status.basis === "TEMPORARY_WORK_AUTHORIZATION") lines.push({ question: `${name}: Permit expires`, answer: status.expiry });
  return lines;
}
