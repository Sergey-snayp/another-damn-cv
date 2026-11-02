import { Logger, type Provider } from '@nestjs/common';
import { ClaudeProcessRunner } from '../../shared/ai/claude-process.runner';
import type { JobRepository } from './application/ports/job-repository';
import type { JobReadingRepository } from './application/ports/job-reading-repository';
import type {
  JobPageExtractor,
  JobReadScheduler,
  StructuredJobReader,
} from './application/ports/job-page-reader';
import type { ResumeLinkReader } from './application/ports/resume-link-reader';
import { CaptureJob } from './application/use-cases/capture-job';
import { CreateManualJob } from './application/use-cases/create-manual-job';
import { DeleteJob } from './application/use-cases/delete-job';
import { GetJob } from './application/use-cases/get-job';
import { ListJobs } from './application/use-cases/list-jobs';
import { ReadJobPage } from './application/use-cases/read-job-page';
import { RereadJob } from './application/use-cases/reread-job';
import { UndoJobStatus } from './application/use-cases/undo-job-status';
import { UpdateJob } from './application/use-cases/update-job';
import { JobReadWorker } from './adapters/inbound/worker/job-read.worker';
import { ClaudeJobPageExtractor } from './adapters/outbound/ai/claude-job-page.extractor';
import { JsonLdJobReader } from './adapters/outbound/documents/json-ld-job.reader';
import { InProcessJobReadScheduler } from './adapters/outbound/scheduling/in-process-job-read.scheduler';
import {
  JOB_PAGE_EXTRACTOR,
  JOB_READ_SCHEDULER,
  JOB_REPOSITORY,
  RESUME_LINK_READER,
  STRUCTURED_JOB_READER,
} from './jobs.tokens';

export const jobsProviders: Provider[] = [
  JobReadWorker,
  {
    provide: STRUCTURED_JOB_READER,
    useFactory: () => new JsonLdJobReader(),
  },
  {
    provide: JOB_PAGE_EXTRACTOR,
    useFactory: (runner: ClaudeProcessRunner) => new ClaudeJobPageExtractor(runner),
    inject: [ClaudeProcessRunner],
  },
  {
    provide: ReadJobPage,
    useFactory: (repository: JobReadingRepository, extractor: JobPageExtractor) =>
      new ReadJobPage(repository, extractor),
    inject: [JOB_REPOSITORY, JOB_PAGE_EXTRACTOR],
  },
  {
    provide: JOB_READ_SCHEDULER,
    useFactory: (read: ReadJobPage) => new InProcessJobReadScheduler(read, new Logger('JobReaderService')),
    inject: [ReadJobPage],
  },
  {
    provide: GetJob,
    useFactory: (repository: JobRepository) => new GetJob(repository),
    inject: [JOB_REPOSITORY],
  },
  {
    provide: ListJobs,
    useFactory: (repository: JobRepository, resumes: ResumeLinkReader) => new ListJobs(repository, resumes),
    inject: [JOB_REPOSITORY, RESUME_LINK_READER],
  },
  {
    provide: UpdateJob,
    useFactory: (repository: JobRepository) => new UpdateJob(repository),
    inject: [JOB_REPOSITORY],
  },
  {
    provide: UndoJobStatus,
    useFactory: (repository: JobRepository) => new UndoJobStatus(repository),
    inject: [JOB_REPOSITORY],
  },
  {
    provide: DeleteJob,
    useFactory: (repository: JobRepository) => new DeleteJob(repository),
    inject: [JOB_REPOSITORY],
  },
  {
    provide: CaptureJob,
    useFactory: (repository: JobRepository, structured: StructuredJobReader, scheduler: JobReadScheduler) =>
      new CaptureJob(repository, structured, scheduler),
    inject: [JOB_REPOSITORY, STRUCTURED_JOB_READER, JOB_READ_SCHEDULER],
  },
  {
    provide: CreateManualJob,
    useFactory: (repository: JobRepository, scheduler: JobReadScheduler) =>
      new CreateManualJob(repository, scheduler),
    inject: [JOB_REPOSITORY, JOB_READ_SCHEDULER],
  },
  {
    provide: RereadJob,
    useFactory: (repository: JobRepository, structured: StructuredJobReader, scheduler: JobReadScheduler) =>
      new RereadJob(repository, structured, scheduler),
    inject: [JOB_REPOSITORY, STRUCTURED_JOB_READER, JOB_READ_SCHEDULER],
  },
];
