/**
 * The fact base: a career as verified facts with provenance, not a document.
 *
 * Three fields carry the whole design:
 *   verified  — true only when `evidence` names a repo, commit, file or migration
 *   evidence  — the provenance pointer that makes the base auditable
 *   weight    — 1-5, how much the owner wants this surfaced
 *
 * Nothing may be generated that is not already here. The base grows only by
 * scanning or by explicit human confirmation.
 */

export interface Provenance {
  /** False means self-reported: allowed, but never presented as evidenced. */
  verified: boolean;
  /** Names a repo, commit, file or migration. Required when verified is true. */
  evidence?: string;
}

export type SkillLevel = 'familiar' | 'working' | 'advanced' | 'expert';

export interface Skill extends Provenance {
  name: string;
  category: string;
  years?: number;
  level?: SkillLevel;
  /** Project ids this skill is evidenced in. */
  usedIn?: string[];
  aliases?: string[];
}

/** Interview-depth detail that never appears on a CV. */
export interface Anchor {
  modelling?: string;
  indexing?: string;
  weakSpots?: string;
  talkingPoints?: string[];
}

export interface Achievement extends Provenance {
  id: string;
  problem: string;
  action: string;
  result: string;
  /** The dense one-line CV form. */
  bullet: string;
  technologies: string[];
  keywords: string[];
  /** 1-5. Higher means surface it sooner. */
  weight: number;
  anchor?: Anchor;
  /** Who last wrote `bullet`. Human wording is never overwritten. */
  authoredBy?: 'generator' | 'human';
}

export interface Project {
  id: string;
  name: string;
  employer?: string;
  client?: string;
  start: string;
  end: string | null;
  summary?: string;
  technologies: string[];
  achievements: Achievement[];
}

export interface Contact {
  email: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  website?: string;
}

export interface FactBase {
  meta: { version: string; updatedAt: string };
  profile: {
    name: string;
    headline: string;
    targetRoles: string[];
    yearsOfExperience: number;
    specialisms: string[];
  };
  contact: Contact;
  summaries: Record<string, string>;
  skills: Skill[];
  projects: Project[];
  education: unknown[];
  training: string[];
  languages: unknown[];
}
