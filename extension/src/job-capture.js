const text = value => typeof value === 'string' ? value.trim() : '';
const escape = value => text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function postingIn(blocks) {
  const queue = [...(blocks ?? [])];
  for (let seen = 0; queue.length && seen < 5000; seen++) {
    const item = queue.shift();
    if (Array.isArray(item)) { queue.push(...item); continue; }
    if (!item || typeof item !== 'object') continue;
    if ([].concat(item['@type'] ?? []).includes('JobPosting')) return item;
    queue.push(...Object.values(item).filter(value => value && typeof value === 'object'));
  }
  return null;
}

/**
 * Save the posting, not the form. A LinkedIn Apply handoff is the original
 * description; an ATS reader can also recover it from the board's overview.
 * All three backend sources agree, so the description is available immediately
 * and a later page reader cannot replace it with application fields.
 */
export function captureWithDescription(capture, details = {}, linkedIn = null, applicationForm = false) {
  if (capture.matched === 'LinkedIn') return capture;
  const existing = postingIn(capture.jsonLd);
  if (!text(linkedIn?.description) && text(existing?.description)) return capture;
  const description = text(linkedIn?.description) || text(details.description);
  if (!description) {
    if (applicationForm) return {
      ...capture, url: text(details.url) || capture.url,
      html: '', text: '', jsonLd: [], description: '', descriptionMissing: true,
      hints: { ...capture.hints, title: text(details.title), company: text(details.company), location: text(details.location) },
    };
    return capture;
  }
  const title = text(linkedIn?.title) || text(existing?.title) || text(details.title) || text(capture.hints?.title) || text(capture.pageTitle);
  const company = text(linkedIn?.company) || text(details.company) || text(existing?.hiringOrganization?.name) || text(capture.hints?.company);
  const location = text(linkedIn?.location) || text(details.location) || text(capture.hints?.location);
  const url = text(details.url) || capture.url;
  const body = description.slice(0, 190000).split(/\n\s*\n/).map(part => `<p>${escape(part).replace(/\n/g, '<br>')}</p>`).join('\n');
  const posting = {
    ...existing,
    '@context': 'https://schema.org', '@type': 'JobPosting', url, title, description: body,
    ...(company && { hiringOrganization: { ...(typeof existing?.hiringOrganization === 'object' ? existing.hiringOrganization : {}), '@type': 'Organization', name: company } }),
    ...(location && { jobLocation: { '@type': 'Place', name: location } }),
    ...(details.employmentType && !existing?.employmentType && { employmentType: details.employmentType }),
    ...(linkedIn?.url && { isBasedOn: linkedIn.url }),
  };
  return {
    ...capture, url, pageTitle: [title, company].filter(Boolean).join(' at ').slice(0, 500),
    text: [title, company, location, description].filter(Boolean).join('\n\n').slice(0, 190000),
    html: `<article><h1>${escape(title)}</h1><p>${escape(company)}</p><p>${escape(location)}</p><section>${body}</section></article>`,
    jsonLd: [posting], description,
    hints: { ...capture.hints, ...(title && { title }), ...(company && { company }), ...(location && { location }) },
    matched: linkedIn?.description ? 'LinkedIn Apply posting' : 'job description',
  };
}
