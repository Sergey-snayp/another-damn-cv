export interface RewriteInput {
  text: string;
  instruction: string;
  context?: string;
  kind?: 'bullet' | 'summary' | 'blurb' | 'headline';
}

export interface RewriteResult {
  original: string;
  suggestion: string;
  cannotDo: string[];
}

export interface LineRewriter {
  rewrite(input: RewriteInput): Promise<RewriteResult>;
}

export interface ResumeAccess {
  assertOwned(userId: string, resumeId: string): Promise<void>;
}

/** The CV's AI Settings, as lines for the prompt. */
export interface RewriteSettings {
  promptSettings(resumeId: string): Promise<string>;
}

/** Returns a suggestion for review; saving it is a separate action. */
export class RewriteResumeLine {
  constructor(
    private readonly access: ResumeAccess,
    private readonly rewriter: LineRewriter,
    private readonly settings?: RewriteSettings,
  ) {}

  async execute(userId: string, resumeId: string, input: RewriteInput): Promise<RewriteResult> {
    await this.access.assertOwned(userId, resumeId);
    const settings = await this.settings?.promptSettings(resumeId);
    if (!settings) return this.rewriter.rewrite(input);
    return this.rewriter.rewrite({ ...input, context: [input.context, settings].filter(Boolean).join('\n\n') });
  }
}
