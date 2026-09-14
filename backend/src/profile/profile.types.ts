/**
 * The candidate profile: what an application form asks for.
 *
 * Deliberately separate from a career *fact*. Nothing here needs evidence or a
 * weight — it is contact details and employment history, the things you retype
 * into every form. The evidenced achievements live elsewhere in the fact base
 * and are what a generated CV draws on.
 */

/** One role. Shaped to match what application forms ask, not what a CV prints. */
export interface ExperienceEntry {
  id: string;
  company: string;
  title: string;
  location?: string;
  /** YYYY-MM. Free text is accepted; forms are inconsistent. */
  from: string;
  /** Empty means current. */
  to: string;
  current: boolean;
  description?: string;
}

export interface EducationEntry {
  id: string;
  institution: string;
  degree: string;
  field: string;
  from: string;
  to: string;
}

/** The flat fields, which are what the extension autofills. */
export interface ContactFields {
  firstName: string;
  lastName: string;
  fullName: string;
  preferredName: string;
  email: string;
  phone: string;
  location: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  linkedin: string;
  github: string;
  portfolio: string;
  website: string;
  currentCompany: string;
  currentTitle: string;
  yearsExperience: string;
  workAuthorization: string;
  requiresSponsorship: string;
  salaryExpectation: string;
  noticePeriod: string;
}

export interface CandidateProfile extends ContactFields {
  experience: ExperienceEntry[];
  education: EducationEntry[];
}

export const EMPTY_CONTACT: ContactFields = {
  firstName: '', lastName: '', fullName: '', preferredName: '',
  email: '', phone: '',
  location: '', city: '', state: '', country: '', postalCode: '',
  linkedin: '', github: '', portfolio: '', website: '',
  currentCompany: '', currentTitle: '', yearsExperience: '',
  workAuthorization: '', requiresSponsorship: '',
  salaryExpectation: '', noticePeriod: '',
};

export const EMPTY_PROFILE: CandidateProfile = {
  ...EMPTY_CONTACT,
  experience: [],
  education: [],
};

/** Keys the extension fills. Experience and education are not autofilled. */
export const CONTACT_KEYS = Object.keys(EMPTY_CONTACT) as (keyof ContactFields)[];
