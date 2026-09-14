/** What a caller sends to save(). Anything omitted is left alone. */
export interface ResumeChanges {
  contact?: ContactInput;
  experiences?: ExperienceInput[];
  achievements?: AchievementInput[];
  educations?: EducationInput[];
  skills?: SkillInput[];
  summaries?: SummaryInput[];
}

/**
 * lineageId identifies the logical entry across all its versions.
 *
 * Omit it to create something new; supply it to edit. Omitting an entry that
 * exists is how a deletion is expressed — the row is closed and no successor
 * is written.
 */
export interface Versioned {
  lineageId?: string;
}

export interface ContactInput extends Versioned {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  website?: string;
}

export interface ExperienceInput extends Versioned {
  company: string;
  client?: string;
  title: string;
  location?: string;
  from: string;
  to?: string;
  current?: boolean;
  blurb?: string;
  position?: number;
}

export interface AchievementInput extends Versioned {
  experienceLineageId: string;
  problem?: string;
  action?: string;
  result?: string;
  bullet: string;
  verified?: boolean;
  evidence?: string;
  weight?: number;
  authoredBy?: string;
  position?: number;
}

export interface EducationInput extends Versioned {
  institution: string;
  fullName?: string;
  degree: string;
  field?: string;
  from: string;
  to?: string;
  position?: number;
}

export interface SkillInput extends Versioned {
  name: string;
  category?: string;
  level?: string;
  years?: number;
  verified?: boolean;
  evidence?: string;
  weight?: number;
  aliases?: string[];
}

export interface SummaryInput extends Versioned {
  variant: string;
  text: string;
}

/** The materialised shape stored in Resume.current and returned by reads. */
export interface RenderedResume {
  snapshot: number;
  contact: Record<string, unknown> | null;
  experiences: RenderedExperience[];
  educations: Record<string, unknown>[];
  skills: Record<string, unknown>[];
  summaries: Record<string, string>;
}

export interface RenderedExperience extends Record<string, unknown> {
  lineageId: string;
  achievements: Record<string, unknown>[];
}
