import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../config';

/**
 * Structuring free text into fields.
 *
 * Uses the local Claude CLI so this runs without an API key. The CLI's own
 * tools are denied by name and it runs in an empty directory, so it sees only
 * the prompt — otherwise it reads the working directory and folds unrelated
 * context into its answer.
 */
@Injectable()
export class LlmService {
  private readonly cwd = mkdtempSync(join(tmpdir(), 'cv-import-'));

  private readonly deniedTools = [
    'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash',
    'WebFetch', 'WebSearch', 'NotebookEdit', 'Task',
  ];

  complete(prompt: string, system: string): Promise<string> {
    const args = [
      '-p', '--output-format', 'text',
      '--model', config.llmModel,
      '--strict-mcp-config',
      '--disallowed-tools', ...this.deniedTools,
      '--exclude-dynamic-system-prompt-sections',
      '--system-prompt', system,
    ];

    return new Promise((resolve, reject) => {
      const child = spawn(config.claudeBin, args, {
        cwd: this.cwd,
        env: this.childEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new ServiceUnavailableException('Parsing the CV took too long.'));
      }, 180_000);

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });

      child.on('error', () => {
        clearTimeout(timer);
        reject(new ServiceUnavailableException(
          `Cannot run "${config.claudeBin}". Set CLAUDE_BIN in .env.`));
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

      child.stdin.end(prompt);
    });
  }

  /** USER is required on macOS or the CLI cannot reach the Keychain. */
  private childEnv(): NodeJS.ProcessEnv {
    const keep = ['PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', '__CF_USER_TEXT_ENCODING'];
    return Object.fromEntries(
      keep.map((key) => [key, process.env[key]]).filter(([, v]) => v !== undefined),
    ) as NodeJS.ProcessEnv;
  }
}
