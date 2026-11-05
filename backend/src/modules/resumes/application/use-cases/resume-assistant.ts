import type { ResumesApi } from '../../contracts';
import type { TailoringJobReader } from '../ports/tailoring';
import { ResumeError } from '../errors';
import { scoreResume, type ResumeScore } from '../../domain/resume-score';
import {
  aiSettingsFrom,
  checkedSuggestions,
  settingsForPrompt,
  type AiSettings,
  type ChatMessage,
  type ChatSuggestion,
  type RawSuggestion,
} from '../../domain/resume-assistant';
import type { RenderedResume } from '../../domain/resume';

/** The job to score or chat about: one from the tracker, or a title and description typed in. */
export type JobChoice = { jobId: string } | { title?: string; description: string };

export interface AiSettingsStore {
  aiSettings(resumeId: string): Promise<unknown>;
  setAiSettings(resumeId: string, settings: AiSettings): Promise<void>;
}

export interface ResumeChatModel {
  answer(input: {
    resume: RenderedResume;
    job: { title: string; description: string } | null;
    messages: ChatMessage[];
    settings: string;
  }): Promise<{ reply: string; suggestions: RawSuggestion[] }>;
}

interface ChosenJob {
  id: string | null;
  title: string;
  company: string | null;
  description: string;
}

/** The editor's right column: the CV's score for a job, the AI chat, and the AI's settings. */
export class ResumeAssistant {
  constructor(
    private readonly resumes: Pick<ResumesApi, 'assertOwned' | 'current'>,
    private readonly jobs: TailoringJobReader,
    private readonly store: AiSettingsStore,
    private readonly model: ResumeChatModel,
  ) {}

  async score(userId: string, id: string, choice: JobChoice): Promise<ResumeScore & { job: Omit<ChosenJob, 'description'> }> {
    const resume = await this.resumes.current(userId, id);
    const job = await this.job(userId, choice);
    const { description: _text, ...about } = job;
    return { ...scoreResume(resume, job.description), job: about };
  }

  async settings(userId: string, id: string): Promise<AiSettings> {
    await this.resumes.assertOwned(userId, id);
    return aiSettingsFrom(await this.store.aiSettings(id));
  }

  async setSettings(userId: string, id: string, settings: AiSettings): Promise<AiSettings> {
    await this.resumes.assertOwned(userId, id);
    const clean = aiSettingsFrom(settings);
    await this.store.setAiSettings(id, clean);
    return clean;
  }

  /** The settings as prompt lines, for the other AI features of the editor. */
  async promptSettings(id: string): Promise<string> {
    return settingsForPrompt(aiSettingsFrom(await this.store.aiSettings(id)));
  }

  async chat(
    userId: string,
    id: string,
    input: { messages: ChatMessage[]; job?: JobChoice },
  ): Promise<{ reply: string; suggestions: ChatSuggestion[] }> {
    const resume = await this.resumes.current(userId, id);
    const job = input.job ? await this.job(userId, input.job) : null;
    const answer = await this.model.answer({
      resume,
      job: job && { title: job.title, description: job.description },
      messages: input.messages,
      settings: await this.promptSettings(id),
    });
    return { reply: answer.reply, suggestions: checkedSuggestions(resume, answer.suggestions) };
  }

  private async job(userId: string, choice: JobChoice): Promise<ChosenJob> {
    if ('jobId' in choice) {
      const job = await this.jobs.getForTailoring(userId, choice.jobId);
      if (!job.description?.trim()) throw new ResumeError('invalid', 'This job has no description yet. Add one in the tracker.');
      return { id: job.id, title: job.title ?? job.pageTitle ?? 'This job', company: job.company, description: job.description };
    }
    return { id: null, title: choice.title?.trim() || 'This job', company: null, description: choice.description };
  }
}
