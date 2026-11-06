import type {
  IdGenerator,
  ProfileDirectory,
  ResumeRepository,
  WorkspaceInput,
} from '../ports/resume-repository';
import { ResumeError } from '../errors';
import { copyOf, isAutomaticTailoredResumeName, tailoredResumeName } from '../../domain/document';
import { careerFrom } from '../../domain/career';
import type { SaveResume } from './save-resume';
import { assertOwned, currentDocument } from './read-resume';

export class ListResumes {
  constructor(
    private readonly repository: ResumeRepository,
    private readonly profiles: ProfileDirectory,
  ) {}
  async execute(input: { userId: string }) {
    return this.repository.list((await this.profiles.ensureProfile(input.userId)).id);
  }
}
export class CreateResume {
  constructor(
    private readonly repository: ResumeRepository,
    private readonly profiles: ProfileDirectory,
  ) {}
  async execute(input: { userId: string; name: string; targetRole?: string }) {
    return this.repository.create({
      profileId: (await this.profiles.ensureProfile(input.userId)).id,
      name: input.name,
      targetRole: input.targetRole,
    });
  }
}
export class GetResumeCareer {
  constructor(
    private readonly repository: ResumeRepository,
    private readonly year: () => number = () => new Date().getFullYear(),
  ) {}
  async execute(input: { userId: string }) {
    return careerFrom(await this.repository.careerRows(input.userId), this.year());
  }
}
export class GetResumeWorkspace {
  constructor(
    private readonly repository: ResumeRepository,
    private readonly profiles: ProfileDirectory,
    private readonly ids: IdGenerator,
    private readonly save: SaveResume,
  ) {}
  async execute(input: WorkspaceInput) {
    const profile = await this.profiles.ensureProfile(input.userId);
    let copy = await this.repository.copyForJob(profile.id, input.job.id);
    if (!copy) {
      const source = await this.repository.pickSource(profile.id, input.sourceResumeId);
      if (!source)
        throw new ResumeError(
          input.sourceResumeId ? 'not-found' : 'invalid',
          input.sourceResumeId ? 'No such resume.' : 'Make a resume first.',
        );
      const from = await currentDocument(this.repository, source.id);
      copy = await this.repository.create({
        profileId: profile.id,
        name: tailoredResumeName(from, input.job, profile),
        targetRole: input.job.title,
        jobId: input.job.id,
        sourceResumeId: source.id,
        theme: source.theme,
      });
      await this.save.execute({
        userId: input.userId,
        id: copy.id,
        changes: copyOf(from, () => this.ids.next()),
        message: `Copied from "${source.name}"`,
      });
    }
    const document = await currentDocument(this.repository, copy.id);
    // Reopening an older automatically named copy adopts the convention too.
    // A name the person chose in the editor is kept.
    const name = tailoredResumeName(document, input.job, profile);
    if (name !== copy.name && isAutomaticTailoredResumeName(copy.name, document, input.job, profile))
      await this.repository.rename(copy.id, name);
    return { id: copy.id, document };
  }
}
export class GetResumeProposal {
  constructor(private readonly repository: ResumeRepository) {}
  async execute(input: { userId: string; id: string }): Promise<unknown> {
    const resume = await this.repository.findOwned(input.userId, input.id);
    if (!resume) throw new ResumeError('not-found', 'No such resume.');
    return resume.tailoring ?? null;
  }
}
export class StoreResumeProposal {
  constructor(private readonly repository: ResumeRepository) {}
  async execute(input: { userId: string; id: string; proposal: unknown }) {
    await assertOwned(this.repository, input.userId, input.id);
    await this.repository.proposal(input.id, input.proposal);
  }
}
export class DiscardResumeProposal {
  constructor(private readonly repository: ResumeRepository) {}
  async execute(input: { userId: string; id: string }) {
    await assertOwned(this.repository, input.userId, input.id);
    await this.repository.proposal(input.id, null);
  }
}
