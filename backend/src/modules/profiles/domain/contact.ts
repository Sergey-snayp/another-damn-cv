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
  telegram: string;
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
  telegram: '',
  currentCompany: '',
  currentTitle: '',
  yearsExperience: '',
  workAuthorization: '',
  requiresSponsorship: '',
  salaryExpectation: '',
  noticePeriod: '',
};

export const CONTACT_KEYS = Object.keys(EMPTY_CONTACT) as (keyof ContactFields)[];
export type StoredContactKey = Exclude<
  keyof ContactFields,
  'fullName' | 'currentCompany' | 'currentTitle' | 'yearsExperience'
>;
export type StoredContact = Record<StoredContactKey, string | null> & {
  firstName: string;
  lastName: string;
  email: string;
};

export interface StoredProfile extends StoredContact {
  id: string;
  userId: string;
  pronouns: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CareerFields {
  currentCompany: string;
  currentTitle: string;
  yearsExperience: string;
}
