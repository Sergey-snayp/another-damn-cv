/**
 * What an application form asks for.
 *
 * Contact details only — the things retyped into every form. Career facts live
 * in a resume, where they are versioned and carry their evidence.
 */

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

export const EMPTY_CONTACT: ContactFields = {
  firstName: '',
  lastName: '',
  fullName: '',
  preferredName: '',
  email: '',
  phone: '',
  location: '',
  city: '',
  state: '',
  country: '',
  postalCode: '',
  linkedin: '',
  github: '',
  portfolio: '',
  website: '',
  currentCompany: '',
  currentTitle: '',
  yearsExperience: '',
  workAuthorization: '',
  requiresSponsorship: '',
  salaryExpectation: '',
  noticePeriod: '',
};

/** Keys the extension fills. Experience and education are not autofilled. */
export const CONTACT_KEYS = Object.keys(EMPTY_CONTACT) as (keyof ContactFields)[];
