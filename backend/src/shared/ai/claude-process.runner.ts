import { Injectable, ServiceUnavailableException, type OnModuleDestroy } from '@nestjs/common';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../config/config';

/**
 * Structuring free text into fields.
 *
 * Uses the local Claude CLI so this runs without an API key. The CLI's own
 * tools are denied by name and it runs in an empty directory, so it sees only
 * the prompt — otherwise it reads the working directory and folds unrelated
 * context into its answer.
 */
@Injectable()
export class ClaudeProcessRunner implements OnModuleDestroy {
  private readonly cwd = mkdtempSync(join(tmpdir(), 'cv-import-'));
  private readonly active = new Set<Promise<string>>();
  private stopping = false;

  private readonly deniedTools = [
    'Read',
    'Write',
    'Edit',
    'Glob',
    'Grep',
    'Bash',
    'WebFetch',
    'WebSearch',
    'NotebookEdit',
    'Task',
  ];

  /**
   * One prompt in, text out. Every call is prompt only: no tools, no slash
   * commands, no saved session. The app's AI work is all writing from what the
   * prompt holds, and with tools on the model would go round after round
   * (one summary call grew to about 395,000 input tokens and 7 minutes).
   * `timeoutMs`: a whole-resume tailoring needs longer than reading one page.
   */
  complete(
    prompt: string,
    system: string,
    {
      timeoutMs = 180_000,
      model = config.llmModel,
      maxOutputChars = Infinity,
    }: { timeoutMs?: number; model?: string; maxOutputChars?: number } = {},
  ): Promise<string> {
    if (this.stopping) return Promise.reject(this.cannotRun());
    const args = [
      '-p',
      '--output-format',
      'text',
      '--model',
      model,
      '--strict-mcp-config',
      '--disallowed-tools',
      ...this.deniedTools,
      '--exclude-dynamic-system-prompt-sections',
      '--system-prompt',
      system,
      '--restricted',
      '--tools',
      '',
      '--disable-slash-commands',
      '--no-session-persistence',
      '--permission-mode',
      'dontAsk',
      '--no-chrome',
    ];

    const completion = new Promise<string>((resolve, reject) => {
      let child: ChildProcessWithoutNullStreams;
      try {
        child = this.launch(config.claudeBin, args, {
          cwd: this.cwd,
          env: this.childEnv(),
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch {
        reject(this.cannotRun());
        return;
      }

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new ServiceUnavailableException('The AI took too long to answer. Try again.'));
      }, timeoutMs);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        if (stdout.length > maxOutputChars) {
          child.kill('SIGKILL');
          clearTimeout(timer);
          reject(new ServiceUnavailableException('The AI response was too large. Try generating again.'));
        }
      });
      child.stderr.on('data', (chunk) => {
        stderr = (stderr + chunk).slice(0, 4000);
      });

      child.on('error', () => {
        clearTimeout(timer);
        reject(this.cannotRun());
      });

      child.on('close', (code) => {
        clearTimeout(timer);

        if (/not logged in/i.test(stdout)) {
          reject(new ServiceUnavailableException('The Claude CLI is not signed in.'));
          return;
        }
        if (code !== 0) {
          reject(new ServiceUnavailableException(stderr.slice(0, 200) || `exit ${code}`));
          return;
        }

        resolve(stdout.trim());
      });

      // An early CLI exit can close stdin before a long prompt is written.
      // Its process error/close event still provides the existing useful error.
      child.stdin.on('error', () => {});
      child.stdin.end(prompt);
    });
    this.active.add(completion);
    void completion.then(
      () => this.active.delete(completion),
      () => this.active.delete(completion),
    );
    return completion;
  }

  /** Let existing calls finish within their timeout before removing their cwd. */
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    await Promise.allSettled([...this.active]);
    rmSync(this.cwd, { recursive: true, force: true });
  }

  /** A process boundary that tests can replace without launching the real CLI. */
  protected launch(
    command: string,
    args: string[],
    options: ClaudeLaunchOptions,
  ): ChildProcessWithoutNullStreams {
    return spawn(command, args, options);
  }

  private cannotRun(): ServiceUnavailableException {
    return new ServiceUnavailableException(`Cannot run "${config.claudeBin}". Set CLAUDE_BIN in .env.`);
  }

  /** USER is required on macOS or the CLI cannot reach the Keychain. */
  private childEnv(): NodeJS.ProcessEnv {
    const keep = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', '__CF_USER_TEXT_ENCODING'];
    return Object.fromEntries(
      keep.map((key) => [key, process.env[key]]).filter(([, v]) => v !== undefined),
    ) as NodeJS.ProcessEnv;
  }
}

export interface ClaudeLaunchOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdio: ['pipe', 'pipe', 'pipe'];
}
