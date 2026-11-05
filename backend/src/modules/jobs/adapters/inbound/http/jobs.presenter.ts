import type { Job, JobDetail, JobStatusEvent, JobSummary } from '../../../domain/job';

type PublicJob = Omit<Job, 'userId' | 'canonicalUrl' | 'html' | 'pageText' | 'structuredData'>;

export function presentJob(job: PublicJob) {
  return {
    id: job.id,
    source: job.source,
    status: job.status,
    extraction: job.extraction,
    extractionError: job.extractionError,
    url: job.url,
    title: job.title,
    company: job.company,
    companyLogo: job.companyLogo ?? null,
    location: job.location,
    remote: job.remote,
    employmentType: job.employmentType,
    salary: job.salary,
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    salaryCurrency: job.salaryCurrency ?? null,
    salaryPeriod: job.salaryPeriod ?? null,
    notes: job.notes ?? null,
    postedAt: job.postedAt?.toISOString() ?? null,
    description: job.description,
    pageTitle: job.pageTitle,
    editedFields: job.editedFields,
    capturedAt: job.capturedAt.toISOString(),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    isFavorite: job.isFavorite ?? false,
    archivedAt: job.archivedAt?.toISOString() ?? null,
    appliedAt: job.appliedAt?.toISOString() ?? null,
    applicationResumeId: job.applicationResumeId ?? null,
    applicationSnapshot: job.applicationSnapshot ?? null,
    applicationAnswers: job.applicationAnswers ?? null,
    interview: job.interview ?? null,
  };
}

export function presentStatusEvent(event: JobStatusEvent) {
  return { id: event.id, from: event.from, to: event.to, at: event.at.toISOString() };
}

export function presentJobDetail(detail: JobDetail) {
  return { ...presentJob(detail.job), history: detail.history.map(presentStatusEvent) };
}

export function presentJobSummary(job: JobSummary, tailoredResumeId: string | null) {
  const {
    description: _description,
    applicationAnswers: _answers,
    ...summary
  } = presentJob({ ...job, description: null, applicationAnswers: null });
  return { ...summary, tailoredResumeId };
}
