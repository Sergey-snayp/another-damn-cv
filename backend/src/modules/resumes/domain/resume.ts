export const VERSIONED_TABLES = [
  'contactInformation',
  'experienceEntry',
  'achievement',
  'educationEntry',
  'skillEntry',
  'summaryVariant',
  'projectEntry',
  'certificationEntry',
  'customSection',
] as const;
export type VersionedTable = (typeof VERSIONED_TABLES)[number];
export interface VersionedRow {
  id: string;
  lineageId: string;
  resumeId: string;
  createdInSnapshot: number;
  supersededInSnapshot: number | null;
  [column: string]: unknown;
}
export interface Contact extends VersionedRow {
  firstName: string;
  lastName: string;
  email: string;
  headline?: string | null;
  /** Shows "Open for relocation" after the location. */
  openToRelocation?: boolean;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  github: string | null;
  website: string | null;
}
export interface Project extends VersionedRow {
  name: string;
  role: string | null;
  link: string | null;
  from: string | null;
  to: string | null;
  current: boolean;
  bullets: string[];
  position: number;
}
export interface Certification extends VersionedRow {
  name: string;
  issuer: string | null;
  date: string | null;
  link: string | null;
  position: number;
}
export interface CustomSection extends VersionedRow {
  title: string;
  text: string | null;
  bullets: string[];
  position: number;
}
export interface Experience extends VersionedRow {
  company: string;
  client: string | null;
  title: string;
  location: string | null;
  from: string;
  to: string | null;
  current: boolean;
  blurb: string | null;
  position: number;
}
export interface Achievement extends VersionedRow {
  experienceLineageId: string;
  problem: string | null;
  action: string | null;
  result: string | null;
  bullet: string;
  verified: boolean;
  evidence: string | null;
  weight: number;
  authoredBy: string;
  position: number;
}
export interface Education extends VersionedRow {
  institution: string;
  fullName: string | null;
  degree: string;
  field: string | null;
  from: string;
  to: string | null;
  position: number;
}
export interface Skill extends VersionedRow {
  name: string;
  category: string;
  level: string | null;
  years: number | null;
  verified: boolean;
  evidence: string | null;
  weight: number;
  aliases: string[];
  position: number;
}
export interface Summary extends VersionedRow {
  variant: string;
  text: string;
}
export type RenderedExperience = Experience & { achievements: Achievement[] };
export interface RenderedResume {
  snapshot: number;
  contact: Contact | null;
  experiences: RenderedExperience[];
  educations: Education[];
  skills: Skill[];
  summaries: Record<string, string>;
  /** Missing on CVs saved before these sections existed. */
  projects?: Project[];
  certifications?: Certification[];
  customSections?: CustomSection[];
}
type Entry = { lineageId?: string };
export interface ResumeChanges {
  contact?: Entry & {
    firstName: string;
    lastName: string;
    email: string;
    headline?: string | null;
    openToRelocation?: boolean;
    phone?: string | null;
    location?: string | null;
    linkedin?: string | null;
    github?: string | null;
    website?: string | null;
  };
  experiences?: Array<
    Entry & {
      company: string;
      client?: string | null;
      title: string;
      location?: string | null;
      from: string;
      to?: string | null;
      current?: boolean;
      blurb?: string | null;
      position?: number;
    }
  >;
  achievements?: Array<
    Entry & {
      experienceLineageId: string;
      problem?: string | null;
      action?: string | null;
      result?: string | null;
      bullet: string;
      verified?: boolean;
      evidence?: string | null;
      weight?: number;
      authoredBy?: string;
      position?: number;
    }
  >;
  educations?: Array<
    Entry & {
      institution: string;
      fullName?: string | null;
      degree: string;
      field?: string | null;
      from: string;
      to?: string | null;
      position?: number;
    }
  >;
  skills?: Array<
    Entry & {
      name: string;
      category?: string;
      level?: string | null;
      years?: number | null;
      verified?: boolean;
      evidence?: string | null;
      weight?: number;
      aliases?: string[];
      position?: number;
    }
  >;
  summaries?: Array<Entry & { variant: string; text: string }>;
  projects?: Array<
    Entry & {
      name: string;
      role?: string | null;
      link?: string | null;
      from?: string | null;
      to?: string | null;
      current?: boolean;
      bullets?: string[];
      position?: number;
    }
  >;
  certifications?: Array<
    Entry & {
      name: string;
      issuer?: string | null;
      date?: string | null;
      link?: string | null;
      position?: number;
    }
  >;
  customSections?: Array<
    Entry & { title: string; text?: string | null; bullets?: string[]; position?: number }
  >;
}
export interface SectionRows {
  contact: Contact | null;
  experiences: Experience[];
  achievements: Achievement[];
  educations: Education[];
  skills: Skill[];
  summaries: Summary[];
  projects: Project[];
  certifications: Certification[];
  customSections: CustomSection[];
}
export interface ResumeRecord {
  id: string;
  profileId: string;
  name: string;
  targetRole: string | null;
  isPrimary: boolean;
  jobId: string | null;
  sourceResumeId: string | null;
  tailoring: unknown;
  currentSnapshotId: string | null;
  current: unknown;
  theme?: unknown;
  materialisedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface ResumeSummary {
  id: string;
  name: string;
  targetRole: string | null;
  isPrimary: boolean;
  currentSnapshotId: string | null;
  createdAt: Date;
  updatedAt: Date;
  jobId: string | null;
  sourceResumeId: string | null;
  hasTailoring: boolean;
}
export interface Snapshot {
  id: string;
  resumeId: string;
  number: number;
  message: string | null;
  createdAt: Date;
}
export interface CareerFields {
  currentCompany: string;
  currentTitle: string;
  yearsExperience: string;
}
export interface JobForCopy {
  id: string;
  title: string | null;
  company: string | null;
  pageTitle: string | null;
}
