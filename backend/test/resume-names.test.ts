import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAutomaticTailoredResumeName, tailoredResumeName } from '../src/modules/resumes/domain/document';
import type { JobForCopy } from '../src/modules/resumes/domain/resume';

const resume = { contact: { firstName: 'Sam', lastName: 'Lee' } };
const job = (title: string | null, company: string | null = 'Acme'): JobForCopy => ({
  id: 'job',
  title,
  company,
  pageTitle: null,
});

test('CV names keep the main role rather than long posting suffixes', () => {
  const posting = job('Software Engineer III, Content Creation (Remote) | Careers');
  assert.equal(tailoredResumeName(resume, posting), 'Sam_Lee_CV_Acme_Software_Engineer_III');
  assert.equal(posting.title, 'Software Engineer III, Content Creation (Remote) | Careers');
  for (const suffix of [' — London', ' – Remote', ' - Full time', '\nApply now']) {
    assert.equal(
      tailoredResumeName(resume, job(`Senior Backend Engineer${suffix}`)),
      'Sam_Lee_CV_Acme_Senior_Backend_Engineer',
    );
  }
});

test('spaces, punctuation, symbols and control characters become single underscores in every component', () => {
  assert.equal(
    tailoredResumeName(
      { contact: { firstName: ' Sam J. ', lastName: 'O’Neil' } },
      job('Senior Front-End Engineer [m/f/d] (Remote)', 'ACME / R&D: Europe™'),
    ),
    'Sam_J_O_Neil_CV_ACME_R_D_Europe_Senior_Front_End_Engineer',
  );
  const name = tailoredResumeName(resume, job('C++ / C# & .NET Developer!?', '../Acme\\<Labs>:*?"\u0000🚀'));
  assert.equal(name, 'Sam_Lee_CV_Acme_Labs_C_C_NET_Developer');
  assert.doesNotMatch(name, /__|^_|_$/);
});

test('names preserve international letters while normalising equivalent Unicode spellings', () => {
  assert.equal(
    tailoredResumeName(
      { contact: { firstName: 'Jose\u0301', lastName: 'Коваль' } },
      job('Développeur Java', 'Acme'),
    ),
    'José_Коваль_CV_Acme_Développeur_Java',
  );
});

test('long components are bounded independently and complete role words stay readable', () => {
  const name = tailoredResumeName(
    { contact: { firstName: 'A'.repeat(200), lastName: 'B'.repeat(200) } },
    job('Developer'.repeat(200), 'C'.repeat(200)),
  );
  assert.ok(Array.from(name).length <= 120);
  assert.match(name, /_CV_C+_Developer/);
  assert.match(name, /^[\p{L}\p{M}\p{N}]+(?:_[\p{L}\p{M}\p{N}]+)*$/u);
  assert.equal(
    tailoredResumeName(resume, job('Senior Software Engineer for Internal Developer Tools and Runtime')),
    'Sam_Lee_CV_Acme_Senior_Software_Engineer_for_Internal',
  );
});

test('missing or unusable values have useful fallbacks', () => {
  assert.equal(tailoredResumeName({}, job(null, null)), 'CV_Job');
  assert.equal(
    tailoredResumeName(resume, { ...job('🚀!?', '///'), pageTitle: 'Backend Engineer (Remote)' }),
    'Sam_Lee_CV_Backend_Engineer',
  );
  assert.equal(tailoredResumeName(resume, job('(Remote) [m/f/d]')), 'Sam_Lee_CV_Acme_Job');
});

test('a missing CV name uses the profile name and retains CV, company and role', () => {
  const profile = { firstName: 'Sergey', lastName: 'Proniuk' };
  const posting = job('Software Engineer III, Content Creation', 'Box');
  assert.equal(tailoredResumeName({}, posting, profile), 'Sergey_Proniuk_CV_Box_Software_Engineer_III');
  assert.equal(
    tailoredResumeName({ contact: { firstName: 'Sergey', lastName: ' ' } }, posting, profile),
    'Sergey_Proniuk_CV_Box_Software_Engineer_III',
  );
  assert.equal(isAutomaticTailoredResumeName('CV_Box_Software_Engineer_III', {}, posting, profile), true);
});

test('older automatic names can be upgraded while custom names are preserved', () => {
  const posting = job('Engineer (Remote) | Careers', 'ACME / R&D');
  for (const name of [
    'Engineer (Remote) | Careers — ACME / R&D',
    'Sam_Lee_CV_ACME_/_R&D_Engineer_(Remote)_|_Careers',
    'Sam_Lee_CV_ACME_R_D_Engineer',
  ])
    assert.equal(isAutomaticTailoredResumeName(name, resume, posting), true);
  assert.equal(isAutomaticTailoredResumeName('My reviewed application CV', resume, posting), false);
  assert.equal(isAutomaticTailoredResumeName('Sam_Lee_CV_My_Custom_Role', resume, posting), false);
});
