export interface ImportedExperience {
  company: string;
  title: string;
  /** The client the work was for: "Paymorrow/Verifone | Payment Processing Platform". */
  client?: string;
  location?: string;
  from: string;
  to?: string;
  current?: boolean;
  /** The role's project or framing line ("Project: …" on the CV), without its label. */
  description?: string;
  /** Each point as written; a "Tech stack: …" line is kept as the last one. */
  bullets?: string[];
}

/** One line of the CV's skills section: "Languages: JavaScript, Node.js". */
export interface ImportedSkillGroup {
  category: string;
  skills: string[];
}

export interface ImportedProject {
  name: string;
  role?: string;
  link?: string;
  from?: string;
  to?: string;
  bullets?: string[];
}

export interface ImportedCertification {
  name: string;
  issuer?: string;
  date?: string;
  link?: string;
}

/** Any other section the CV has: languages spoken, awards, publications… */
export interface ImportedSection {
  title: string;
  text?: string;
  bullets?: string[];
}

export interface ImportedEducation {
  institution: string;
  degree: string;
  field?: string;
  from: string;
  to?: string;
}

export interface ImportedProfile {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  preferredName?: string;
  email?: string;
  phone?: string;
  location?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  website?: string;
  /** A professional title under the name. */
  headline?: string;
  /** The CV says the candidate is open to relocation. */
  openToRelocation?: boolean;
  currentCompany?: string;
  currentTitle?: string;
  yearsExperience?: string;
  summary?: string;
  skills?: string[];
  /** The CV's own skills section, grouped as it is written. */
  skillGroups?: ImportedSkillGroup[];
  experience?: ImportedExperience[];
  education?: ImportedEducation[];
  projects?: ImportedProject[];
  certifications?: ImportedCertification[];
  otherSections?: ImportedSection[];
}

export interface ImportProposal {
  id: string;
  proposed: ImportedProfile;
  charsRead: number;
  notFound: string[];
}

export function missingFields(proposed: ImportedProfile): string[] {
  const wanted = ['email', 'phone', 'location', 'linkedin', 'github'] as const;
  return wanted.filter((key) => !proposed[key]);
}
