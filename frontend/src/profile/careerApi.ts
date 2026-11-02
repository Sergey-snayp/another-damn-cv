import type { ContactFields } from "../api";
import type { RenderedResume } from "../resumeApi";
import type { ImportProposal } from "../resume/fromImport";

export const IMPORT_CONTACT_LABELS = {
  firstName: "First name",
  lastName: "Last name",
  preferredName: "Preferred name",
  email: "Email",
  phone: "Phone",
  location: "Location",
  city: "City",
  state: "State / province",
  country: "Country",
  postalCode: "Postal code",
  linkedin: "LinkedIn",
  github: "GitHub",
  portfolio: "Portfolio",
  website: "Website",
} as const;
export type ImportContactKey = keyof typeof IMPORT_CONTACT_LABELS;
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
  | { kind: "file"; name: string }
  | { kind: "resume"; id: string; snapshot: number };
export interface CareerSection<T> {
  value: T;
  source: CareerSource;
  importedAt: string;
}
export type CareerData = {
  [K in keyof CareerSections]?: CareerSection<CareerSections[K]>;
};
export interface CareerState {
  revision: number;
  data: CareerData;
}
export interface ProfileImportDraft {
  contact: Partial<Record<ImportContactKey, string>>;
  sections: CareerSections;
  source: CareerSource;
}
export interface ProfileImportInput {
  expectedRevision: number;
  expectedContact: Partial<Record<ImportContactKey, string>>;
  contact: Partial<Record<ImportContactKey, string>>;
  sections: Partial<CareerSections>;
  source: CareerSource;
}
async function request<T>(suffix: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/profile/career${suffix}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(
      typeof detail?.message === "string"
        ? detail.message
        : `Could not import profile information (${response.status}).`,
    );
  }
  return response.json() as Promise<T>;
}
export const careerApi = {
  read: () => request<CareerState>(""),
  apply: (input: ProfileImportInput) =>
    request<CareerState>("/import", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};

const text = (value: unknown, max = 12000): string => {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > max)
    throw new Error(
      "Some CV fields could not be read. Try another file or correct the CV in Documents.",
    );
  return value.trim();
};
const list = (value: unknown, max: number): unknown[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > max)
    throw new Error(
      "This CV contains too many entries or unreadable sections. Choose a shorter CV.",
    );
  return value;
};
const row = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("A CV entry could not be read. Try another file.");
  return value as Record<string, unknown>;
};
export function profileDraftFromFile(
  proposal: ImportProposal,
  name: string,
): ProfileImportDraft {
  const p = row(proposal.proposed);
  const contact: ProfileImportDraft["contact"] = {};
  for (const key of Object.keys(IMPORT_CONTACT_LABELS) as ImportContactKey[]) {
    const value = text(p[key], 2000);
    if (value) contact[key] = value;
  }
  if (!contact.firstName && !contact.lastName && text(p.fullName)) {
    const [first, ...rest] = text(p.fullName).split(/\s+/);
    contact.firstName = first;
    if (rest.length) contact.lastName = rest.join(" ");
  }
  return {
    contact,
    source: { kind: "file", name },
    sections: {
      summary: text(p.summary, 10000),
      experiences: list(p.experience, 100).map((value) => {
        const r = row(value);
        if (r.current !== undefined && typeof r.current !== "boolean")
          throw new Error(
            "A role has an unreadable current-job value. Try another file.",
          );
        return {
          company: text(r.company, 2000),
          title: text(r.title, 2000),
          client: text(r.client, 2000),
          location: text(r.location, 2000),
          from: text(r.from, 80),
          to: text(r.to, 80),
          current: r.current === true,
          description: text(r.description),
          bullets: list(r.bullets, 100)
            .map((value) => text(value, 4000))
            .filter(Boolean),
        };
      }),
      educations: list(p.education, 50).map((value) => {
        const r = row(value);
        return {
          institution: text(r.institution, 2000),
          degree: text(r.degree, 2000),
          field: text(r.field, 2000),
          from: text(r.from, 80),
          to: text(r.to, 80),
        };
      }),
      skills: [
        ...new Set(
          list(p.skills, 400)
            .map((value) => text(value, 200))
            .filter(Boolean),
        ),
      ],
    },
  };
}
export function profileDraftFromResume(
  cv: RenderedResume,
  id: string,
): ProfileImportDraft {
  const parsed = profileDraftFromFile(
    {
      id: "",
      charsRead: 0,
      notFound: [],
      proposed: {
        firstName: cv.contact?.firstName,
        lastName: cv.contact?.lastName,
        email: cv.contact?.email,
        phone: cv.contact?.phone || "",
        location: cv.contact?.location || "",
        linkedin: cv.contact?.linkedin || "",
        github: cv.contact?.github || "",
        website: cv.contact?.website || "",
        summary:
          cv.summaries.default || Object.values(cv.summaries).find(Boolean),
        experience: cv.experiences.map((r) => ({
          company: r.company,
          title: r.title,
          client: r.client || "",
          location: r.location || "",
          from: r.from,
          to: r.to || "",
          current: r.current === true,
          description: r.blurb || "",
          bullets: r.achievements.map((b) => b.bullet),
        })),
        education: cv.educations.map((r) => ({
          institution: r.institution,
          degree: r.degree,
          field: r.field || "",
          from: r.from,
          to: r.to || "",
        })),
        skills: cv.skills.map((s) => s.name),
      },
    },
    "",
  );
  return { ...parsed, source: { kind: "resume", id, snapshot: cv.snapshot } };
}
export function importInput(
  draft: ProfileImportDraft,
  selectedContact: ImportContactKey[],
  selectedSections: (keyof CareerSections)[],
  profile: ContactFields,
  revision: number,
): ProfileImportInput {
  return {
    expectedRevision: revision,
    source: draft.source,
    contact: Object.fromEntries(
      selectedContact.map((key) => [key, draft.contact[key] ?? ""]),
    ),
    expectedContact: Object.fromEntries(
      selectedContact.map((key) => [key, profile[key] ?? ""]),
    ),
    sections: Object.fromEntries(
      selectedSections.map((key) => [key, draft.sections[key]]),
    ),
  };
}
