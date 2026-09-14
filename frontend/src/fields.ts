import type { CandidateProfile } from './api';

export type ContactKey = Exclude<keyof CandidateProfile, 'experience' | 'education'>;

export interface FieldSpec {
  key: ContactKey;
  label: string;
  placeholder?: string;
  /** Half-width on the grid. */
  half?: boolean;
}

/**
 * Grouped the way an application form groups them, so filling this in feels
 * like filling in the thing it replaces.
 */
export const SECTIONS: { title: string; hint?: string; fields: FieldSpec[] }[] = [
  {
    title: 'Personal',
    fields: [
      { key: 'firstName', label: 'First name', half: true },
      { key: 'lastName', label: 'Last name', half: true },
      { key: 'preferredName', label: 'Preferred name', half: true },
      { key: 'email', label: 'Email', half: true },
      { key: 'phone', label: 'Phone', half: true, placeholder: '+1 672 000 0000' },
    ],
  },
  {
    title: 'Location',
    fields: [
      { key: 'location', label: 'Location', placeholder: 'Vancouver, BC, Canada' },
      { key: 'city', label: 'City', half: true },
      { key: 'state', label: 'State / province', half: true },
      { key: 'country', label: 'Country', half: true },
      { key: 'postalCode', label: 'Postal code', half: true },
    ],
  },
  {
    title: 'Links',
    fields: [
      { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/…' },
      { key: 'github', label: 'GitHub', placeholder: 'https://github.com/…' },
      { key: 'portfolio', label: 'Portfolio', half: true },
      { key: 'website', label: 'Website', half: true },
    ],
  },
  {
    title: 'Eligibility',
    hint: 'Answered as the form words it — usually Yes or No.',
    fields: [
      { key: 'workAuthorization', label: 'Authorised to work', half: true, placeholder: 'Yes' },
      { key: 'requiresSponsorship', label: 'Needs sponsorship', half: true, placeholder: 'No' },
      { key: 'salaryExpectation', label: 'Salary expectation', half: true },
      { key: 'noticePeriod', label: 'Notice period', half: true, placeholder: '2 weeks' },
    ],
  },
];
