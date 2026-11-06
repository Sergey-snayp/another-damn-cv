import type { ResumesApi } from '../contracts';
import type { JobForCopy, ResumeChanges } from '../domain/resume';
import type { IdGenerator, ProfileDirectory, ResumeRepository } from './ports/resume-repository';
import {
  GetResume,
  GetResumeDiff,
  GetResumeHistory,
  GetResumeSnapshot,
  GetResumeSnapshots,
  assertOwned,
} from './use-cases/read-resume';
import { RebuildResume, RevertResume, SaveResume } from './use-cases/save-resume';
import {
  CreateResume,
  DiscardResumeProposal,
  GetResumeCareer,
  GetResumeProposal,
  GetResumeWorkspace,
  ListResumes,
  StoreResumeProposal,
} from './use-cases/manage-resumes';

export function createResumesApi(
  repository: ResumeRepository,
  profiles: ProfileDirectory,
  ids: IdGenerator,
): ResumesApi {
  const read = new GetResume(repository),
    snapshot = new GetResumeSnapshot(repository),
    history = new GetResumeHistory(repository),
    snapshots = new GetResumeSnapshots(repository),
    diff = new GetResumeDiff(repository);
  const save = new SaveResume(repository, ids),
    revert = new RevertResume(repository, save),
    rebuild = new RebuildResume(repository);
  const list = new ListResumes(repository, profiles),
    create = new CreateResume(repository, profiles),
    career = new GetResumeCareer(repository),
    workspace = new GetResumeWorkspace(repository, profiles, ids, save);
  const pending = new GetResumeProposal(repository),
    store = new StoreResumeProposal(repository),
    discard = new DiscardResumeProposal(repository);
  return {
    assertOwned: (userId, id) => assertOwned(repository, userId, id),
    list: (userId) => list.execute({ userId }),
    create: (userId, name, targetRole) => create.execute({ userId, name, targetRole }),
    remove: async (userId, id) => {
      await assertOwned(repository, userId, id);
      await repository.remove(id);
    },
    current: (userId, id) => read.execute({ userId, id }),
    atSnapshot: (userId, id, number) => snapshot.execute({ userId, id, number }),
    history: (userId, id, table, lineageId) => history.execute({ userId, id, table, lineageId }),
    snapshots: (userId, id) => snapshots.execute({ userId, id }),
    diff: (userId, id, number) => diff.execute({ userId, id, number }),
    save: (userId, id, changes: ResumeChanges, message) => save.execute({ userId, id, changes, message }),
    revertTo: (userId, id, number) => revert.execute({ userId, id, number }),
    rebuild: (userId, id) => rebuild.execute({ userId, id }),
    career: (userId) => career.execute({ userId }),
    latestIdsForJobs: (userId, jobIds) => repository.latestIdsForJobs(userId, jobIds),
    workspaceForJob: (userId, job: JobForCopy, sourceResumeId) =>
      workspace.execute({ userId, job, sourceResumeId }),
    pending: (userId, id) => pending.execute({ userId, id }),
    storeProposal: (userId, id, proposal) => store.execute({ userId, id, proposal }),
    discardProposal: (userId, id) => discard.execute({ userId, id }),
  };
}
