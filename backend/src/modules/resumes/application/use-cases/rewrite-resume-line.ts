export interface RewriteInput {
  text: string;
  instruction: string;
  context?: string;
  kind?: 'bullet' | 'summary' | 'blurb';
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

/** Returns a suggestion for review; saving it is a separate action. */
export class RewriteResumeLine {
  constructor(
    private readonly access: ResumeAccess,
    private readonly rewriter: LineRewriter,
  ) {}

  async execute(userId: string, resumeId: string, input: RewriteInput): Promise<RewriteResult> {
    await this.access.assertOwned(userId, resumeId);
    return this.rewriter.rewrite(input);
  }
}
