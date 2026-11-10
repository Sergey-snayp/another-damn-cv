import type { ResumesApi } from '../../contracts';
import { practiceHintText, practiceHints } from '../../domain/job-practices';
import type { TailoringJobReader } from '../ports/tailoring';
import { repeatsAny } from '../../domain/role-bullets';
import { ResumeError } from '../errors';
import { scoreResume, type ResumeScore } from '../../domain/resume-score';
import {
  aiSettingsFrom,
  checkedSkillGroups,
  checkedStack,
  checkedSuggestions,
  settingsForPrompt,
  type AiSettings,
  type ChatMessage,
  type ChatSuggestion,
  type RawSuggestion,
  type SkillGroupInput,
  type SkillGroupSuggestion,
} from '../../domain/resume-assistant';
import { resumeText } from '../../domain/resume-score';
import {
  BULLET_RULES,
  DESCRIPTION_RULES,
  HEADLINE_RULES,
  withoutAddedPurpose,
} from '../../domain/cv-writing-guide';
import type { RenderedResume } from '../../domain/resume';
import type { LineRewriter, RewriteResult } from './rewrite-resume-line';
import { experienceRecord } from '../../domain/summary-checks';
import { writeCheckedSummary, type CheckedSummary, type SummaryWriter } from './tailor-summary';

const TAILOR_LINE = `Tailor this line for the job below, so a recruiter for this job sees the match at once:
- Lead with the part of the line this job cares about most.
- Use the job's own words for what the line already shows (if the job says "event-driven"
  and the line describes services fed by Kafka events, say event-driven; if it says
  "observability" and the line has CloudWatch alarms and dashboards, say observability).
  Name the practice; keep the line's own tools and numbers next to it.
- Keep it as written where it already shows the work: swap in the job's word only where it
  means the same thing, and never shorten away its mechanism, reason, before and after,
  ownership or counts. Tighten only filler.
- Keep every number, technology and fact the line has. Add none it does not have:
  no new technology, number, scale or responsibility.
Return your best tailored version. Return the line unchanged only if no honest
improvement for this job exists, and say why in cannotDo.`;

/** A job's tech stack is a list of tools, not a line of prose. */
const TAILOR_TECH_STACK = `This is the job's tech stack: a list of the tools it used, printed under its bullets.
Tailor it for the job below:
- Return a comma-separated list of tool names only: no "Tech stack:" label, no sentence,
  no full stop at the end.
- Put the tools this job posting asks for first, then the rest in their current order.
- Keep every tool the list has, spelled as it is, unless the candidate asks for a shorter list.
- You may add a tool only when this job's own lines in <cv_facts> name it. Never add a tool
  the job posting asks for that those lines do not show, and never a tool from another job.
Return the list unchanged only if no honest improvement for this job exists, and say why
in cannotDo.`;

/** What each kind of line is told: the shared tailoring rules, then the guide for that kind. */
const TAILOR_BY_KIND = {
  techStack: TAILOR_TECH_STACK,
  bullet: `${TAILOR_LINE}\n\n${BULLET_RULES}`,
  blurb: `${TAILOR_LINE}\n\n${DESCRIPTION_RULES}`,
  headline: `${TAILOR_LINE}\n\n${HEADLINE_RULES}`,
} as const;

/**
 * The person's own request from the card ("shorter", "stress the payments
 * work"), added to the instruction. It can steer the wording, never the facts:
 * the honesty rules of the system prompt still apply.
 */
function withRequest(instruction: string, request?: string): string {
  const asked = request?.trim();
  return asked
    ? `${instruction}\n\nThe candidate's request for this change (follow it within the rules above): ${asked}`
    : instruction;
}

/** The job to score or chat about: one from the tracker, or a title and description typed in. */
export type JobChoice = { jobId: string } | { title?: string; description: string };

export interface AiSettingsStore {
  aiSettings(resumeId: string): Promise<unknown>;
  setAiSettings(resumeId: string, settings: AiSettings): Promise<void>;
}

export interface SkillTailor {
  tailor(input: {
    job: { title: string; description: string };
    evidence: string;
    groups: SkillGroupInput[];
    elsewhere: string[];
    settings: string;
  }): Promise<{ groups: Array<{ category?: string; add?: string[] }>; cannotDo: string[] }>;
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
    private readonly rewriter: LineRewriter,
    private readonly skillTailor?: SkillTailor,
    private readonly summaryWriter?: SummaryWriter,
  ) {}

  /**
   * Quick tailoring of the summary: written from the summary instructions with
   * the posting and the experience record, checked in code, and sent back for
   * a fix at most twice. Returns the best version with any checks it still fails.
   */
  async tailorSummary(
    userId: string,
    id: string,
    input: { instruction?: string; job: JobChoice },
  ): Promise<CheckedSummary & { original: string }> {
    if (!this.summaryWriter) throw new ResumeError('invalid', 'Summary writing is not available.');
    const resume = await this.resumes.current(userId, id);
    const job = await this.job(userId, input.job);
    const record = experienceRecord(resume);
    const written = await writeCheckedSummary(
      this.summaryWriter,
      {
        job: [
          job.title && `Job title: ${job.title}`,
          job.company && `Company: ${job.company}`,
          job.description.slice(0, 20_000),
        ]
          .filter(Boolean)
          .join('\n'),
        experience: record.text,
        request: input.instruction,
      },
      record,
    );
    return { ...written, original: resume.summaries.default ?? '' };
  }

  /**
   * Quick tailoring of skills lines: only skills the CV shows elsewhere are added,
   * at the end of a line; nothing is reordered or dropped. Every name is checked.
   */
  async tailorSkills(
    userId: string,
    id: string,
    input: { groups: SkillGroupInput[]; elsewhere: string[]; instruction?: string; job: JobChoice },
  ): Promise<{ groups: SkillGroupSuggestion[]; cannotDo: string[] }> {
    if (!this.skillTailor) throw new ResumeError('invalid', 'Skills tailoring is not available.');
    const resume = await this.resumes.current(userId, id);
    const job = await this.job(userId, input.job);
    const evidence = resumeText(resume);
    const answer = await this.skillTailor.tailor({
      job: { title: job.title, description: job.description },
      evidence,
      groups: input.groups,
      elsewhere: input.elsewhere,
      settings: withRequest(await this.promptSettings(id), input.instruction),
    });
    return {
      groups: checkedSkillGroups(input.groups, answer.groups, evidence, input.elsewhere),
      cannotDo: answer.cannotDo.slice(0, 8),
    };
  }

  /** Quick tailoring: one line of the CV reworded for the job, for the person to accept or not. */
  async tailorLine(
    userId: string,
    id: string,
    input: {
      text: string;
      kind: 'bullet' | 'blurb' | 'headline' | 'techStack';
      context?: string;
      /** The job's other lines: the rewrite must not repeat them. */
      others?: string[];
      instruction?: string;
      job: JobChoice;
    },
  ): Promise<RewriteResult> {
    const job = await this.job(userId, input.job);
    const jobText = `The job: ${job.title}${job.company ? ` at ${job.company}` : ''}\n${job.description.slice(0, 8_000)}`;
    await this.resumes.assertOwned(userId, id);
    if (!input.text.trim()) throw new ResumeError('invalid', 'There is nothing to tailor yet.');
    if (input.kind === 'techStack') {
      // The job's own lines are the only facts a tool may come from, and the answer is checked against them.
      const own = (input.context ?? '').slice(0, 8_000);
      const result = await this.rewriter.rewrite({
        text: input.text,
        kind: 'techStack',
        instruction: withRequest(TAILOR_BY_KIND.techStack, input.instruction),
        context: [`<cv_facts>\n${own}\n</cv_facts>`, jobText, await this.promptSettings(id)]
          .filter(Boolean)
          .join('\n\n'),
      });
      const checked = checkedStack(result.suggestion, input.text, own);
      return { ...result, suggestion: checked.list, cannotDo: [...result.cannotDo, ...checked.notes] };
    }
    const others = (input.others ?? [])
      .map((line) => line.trim())
      .filter((line) => line && line !== input.text.trim());
    const neighbours = others.length
      ? `<other_lines>\nThe job's other lines on this CV. Do not repeat what they say, their phrases or their opening verb.\n${others.map((line) => `- ${line}`).join('\n')}\n</other_lines>`
      : '';
    const context = [input.context?.slice(0, 1_000), neighbours, jobText, await this.promptSettings(id)]
      .filter(Boolean)
      .join('\n\n');
    // The posting's words for practices this line already shows ("observability" for CloudWatch alarms).
    const hints = practiceHintText(practiceHints(job.description, input.text));
    const result = await this.rewriter.rewrite({
      text: input.text,
      kind: input.kind,
      instruction: withRequest(
        hints ? `${TAILOR_BY_KIND[input.kind]}\n\n${hints}` : TAILOR_BY_KIND[input.kind],
        input.instruction,
      ),
      context,
    });
    // A benefit the line and its job do not state ("…to reduce risk") is cut.
    const suggestion = withoutAddedPurpose(result.suggestion, `${input.text}\n${input.context ?? ''}`);
    // A rewrite that says what another line of the job already says is not offered.
    if (repeatsAny(suggestion, others) && !repeatsAny(input.text, others))
      return {
        ...result,
        suggestion: input.text,
        cannotDo: [
          ...result.cannotDo,
          'The rewrite repeated another bullet of this job, so the line is kept as it is.',
        ],
      };
    return { ...result, suggestion };
  }

  async score(
    userId: string,
    id: string,
    choice: JobChoice,
  ): Promise<ResumeScore & { job: Omit<ChosenJob, 'description'> }> {
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
      if (!job.description?.trim())
        throw new ResumeError('invalid', 'This job has no description yet. Add one in the tracker.');
      return {
        id: job.id,
        title: job.title ?? job.pageTitle ?? 'This job',
        company: job.company,
        description: job.description,
      };
    }
    return {
      id: null,
      title: choice.title?.trim() || 'This job',
      company: null,
      description: choice.description,
    };
  }
}
