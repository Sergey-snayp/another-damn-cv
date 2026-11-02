export interface ImportedExperience {
  company: string;
  title: string;
  from: string;
  to?: string;
  current?: boolean;
  description?: string;
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
  currentCompany?: string;
  currentTitle?: string;
  yearsExperience?: string;
  summary?: string;
  skills?: string[];
  experience?: ImportedExperience[];
  education?: ImportedEducation[];
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
