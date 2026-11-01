import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobFromJsonLd } from '../src/jobs/structured-data';
import { htmlToText } from '../src/jobs/html-text';

const greenhouseStyle = {
  '@context': 'https://schema.org',
  '@type': 'JobPosting',
  title: 'Senior Backend Engineer',
  datePosted: '2026-10-20',
  employmentType: 'FULL_TIME',
  hiringOrganization: { '@type': 'Organization', name: 'Acme &amp; Co' },
  jobLocation: [
    { '@type': 'Place', address: { addressLocality: 'Toronto', addressRegion: 'ON', addressCountry: 'CA' } },
    {
      '@type': 'Place',
      address: { addressLocality: 'Vancouver', addressRegion: 'BC', addressCountry: { name: 'Canada' } },
    },
  ],
  jobLocationType: 'TELECOMMUTE',
  baseSalary: {
    '@type': 'MonetaryAmount',
    currency: 'CAD',
    value: { '@type': 'QuantitativeValue', minValue: 140000, maxValue: 170000, unitText: 'YEAR' },
  },
  description:
    '&lt;p&gt;We build &lt;strong&gt;payments&lt;/strong&gt;.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Node.js&lt;/li&gt;&lt;li&gt;Postgres&lt;/li&gt;&lt;/ul&gt;',
};

test('reads a full JobPosting', () => {
  const job = jobFromJsonLd([greenhouseStyle]);
  assert.deepEqual(job, {
    title: 'Senior Backend Engineer',
    company: 'Acme & Co',
    location: 'Toronto, ON, CA · Vancouver, BC, Canada',
    remote: true,
    employmentType: 'Full time',
    salary: 'CAD 140,000–170,000 / year',
    postedAt: '2026-10-20T00:00:00.000Z',
    description: 'We build payments.\n\n• Node.js\n• Postgres',
  });
});

test('finds the posting inside @graph among other blocks', () => {
  const blocks = [
    { '@type': 'BreadcrumbList', itemListElement: [] },
    {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage' },
        { '@type': ['JobPosting'], title: 'Platform Engineer', hiringOrganization: 'Globex' },
      ],
    },
  ];
  const job = jobFromJsonLd(blocks);
  assert.equal(job?.title, 'Platform Engineer');
  assert.equal(job?.company, 'Globex');
});

test('no JobPosting, or an empty one, means none', () => {
  assert.equal(jobFromJsonLd([{ '@type': 'Organization', name: 'Acme' }]), null);
  assert.equal(jobFromJsonLd([{ '@type': 'JobPosting' }]), null);
  assert.equal(jobFromJsonLd([]), null);
});

test('htmlToText keeps paragraphs and bullets readable', () => {
  assert.equal(
    htmlToText('<h2>About</h2><p>Line one<br>line two</p><ul><li>A</li><li>B &ndash; C</li></ul>'),
    'About\n\nLine one\nline two\n\n• A\n• B – C',
  );
});
