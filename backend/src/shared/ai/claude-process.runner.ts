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
   * `effort`: how much the model thinks before it answers; left out, the model's own default.
   * `onText`: called with the answer so far while it is written, so a page can show
   * it before the end; the promise still resolves with the whole answer.
   */
  complete(
    prompt: string,
    system: string,
    {
      timeoutMs = 180_000,
      model = config.llmModel,
      maxOutputChars = Infinity,
      effort,
      onText,
    }: {
      timeoutMs?: number;
      model?: string;
      maxOutputChars?: number;
      effort?: 'low' | 'medium' | 'high';
      onText?: (soFar: string) => void;
    } = {},
  ): Promise<string> {
    if (this.stopping) return Promise.reject(this.cannotRun());
    const args = [
      '-p',
      // Streamed, the CLI sends one JSON event per line, the text in small pieces.
      ...(onText
        ? ['--output-format', 'stream-json', '--include-partial-messages', '--verbose']
        : ['--output-format', 'text']),
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
      ...(effort ? ['--effort', effort] : []),
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

      let streamed = '';
      let finalText: string | null = null;
      let pending = '';
      const tooLarge = () => {
        child.kill('SIGKILL');
        clearTimeout(timer);
        reject(new ServiceUnavailableException('The AI response was too large. Try generating again.'));
      };
      /** One line of the CLI's stream: a piece of text, or the whole answer at the end. */
      const readEvent = (line: string) => {
        let event: StreamEvent;
        try {
          event = JSON.parse(line) as StreamEvent;
        } catch {
          return;
        }
        const delta = event.type === 'stream_event' ? event.event?.delta : undefined;
        if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
          streamed += delta.text;
          if (streamed.length > maxOutputChars) return tooLarge();
          try {
            onText?.(streamed);
          } catch {
            // A listener's slip never stops the answer.
          }
        } else if (event.type === 'result' && typeof event.result === 'string') finalText = event.result;
      };

      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        if (onText) {
          pending += chunk;
          let end: number;
          while ((end = pending.indexOf('\n')) >= 0) {
            readEvent(pending.slice(0, end));
            pending = pending.slice(end + 1);
          }
          // Kept short: the events are not needed once read.
          stdout = stdout.slice(-4000);
          return;
        }
        if (stdout.length > maxOutputChars) tooLarge();
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

        if (onText) {
          if (pending.trim()) readEvent(pending);
          resolve((finalText ?? streamed).trim());
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

  /**
   * USER is required on macOS or the CLI cannot reach the Keychain. On a server
   * the CLI signs in with CLAUDE_CODE_OAUTH_TOKEN (from `claude setup-token`).
   */
  private childEnv(): NodeJS.ProcessEnv {
    const keep = [
      'PATH',
      'HOME',
      'USER',
      'LOGNAME',
      'SHELL',
      'TMPDIR',
      '__CF_USER_TEXT_ENCODING',
      'CLAUDE_CODE_OAUTH_TOKEN',
    ];
    return Object.fromEntries(
      keep.map((key) => [key, process.env[key]]).filter(([, v]) => v !== undefined),
    ) as NodeJS.ProcessEnv;
  }
}

/** The parts of the CLI's stream-json events that are read. */
interface StreamEvent {
  type?: string;
  event?: { delta?: { type?: string; text?: unknown } };
  result?: unknown;
}

export interface ClaudeLaunchOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdio: ['pipe', 'pipe', 'pipe'];
}
