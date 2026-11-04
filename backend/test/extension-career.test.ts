import assert from 'node:assert/strict';
import { test } from 'node:test';
import { autofillCareerFields, fullSections } from '../src/modules/profiles/domain/career-profile';
import { GetExtensionCareer } from '../src/modules/profiles/application/use-cases/get-extension-career';
import { ResumeSectionsAdapter } from '../src/modules/profiles/adapters/outbound/resume-sections.reader';
import type { RenderedResume } from '../src/modules/resumes/contracts';

const role = (company: string, from: string, current = false) => ({
  company,
  title: `Engineer at ${company}`,
  client: '',
  location: '',
  from,
  to: current ? '' : '2023-10',
  current,
  description: '',
  bullets: [],
});

test('Autofill takes the current role, years and the latest education', () => {
  const fields = autofillCareerFields(
    {
      summary: '',
      experiences: [role('Ciklum', '2023-11', true), role('Acme', '2016-03')],
      educations: [
        { institution: 'School', degree: 'Diploma', field: '', from: '2009', to: '2013' },
        {
          institution: 'Dnipro Institute',
          degree: "Bachelor's",
          field: 'Computer Science',
          from: '2013',
          to: '2016-06',
        },
      ],
      skills: [],
    },
    2026,
  );
  assert.deepEqual(fields, {
    currentCompany: 'Ciklum',
    currentTitle: 'Engineer at Ciklum',
    yearsExperience: '10',
    school: 'Dnipro Institute',
    degree: "Bachelor's",
    fieldOfStudy: 'Computer Science',
    graduationYear: '2016',
  });
});

test('a profile without imported sections shows empty ones', () => {
  assert.deepEqual(fullSections({}), { summary: '', experiences: [], educations: [], skills: [] });
});

test('a CV reads as the same sections Profile → Import would take', async () => {
  const cv = {
    snapshot: 2,
    contact: null,
    summaries: { default: 'Backend engineer.' },
    experiences: [
      {
        company: 'Acme',
        client: null,
        title: 'Engineer',
        location: 'Remote',
        from: '2020-01',
        to: null,
        current: true,
        blurb: null,
        achievements: [{ bullet: 'Shipped payments' }],
      },
    ],
    educations: [{ institution: 'KPI', degree: 'BSc', field: null, from: '2010', to: '2014' }],
    skills: [{ name: 'Node.js' }],
  } as unknown as RenderedResume;
  const reader = new ResumeSectionsAdapter({ current: () => Promise.resolve(cv) });
  const view = await new GetExtensionCareer(
    {
      read: () => Promise.resolve({ revision: 0, data: {} }),
      import: () => Promise.reject(new Error('unused')),
    },
    reader,
    () => 2026,
  ).fromResume('user', 'cv');
  assert.equal(view.summary, 'Backend engineer.');
  assert.deepEqual(view.experiences[0].bullets, ['Shipped payments']);
  assert.equal(view.experiences[0].location, 'Remote');
  assert.deepEqual(view.skills, ['Node.js']);
  assert.equal(view.fields.currentCompany, 'Acme');
  assert.equal(view.fields.school, 'KPI');
});
