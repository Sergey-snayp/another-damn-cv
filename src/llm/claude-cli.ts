import { spawn } from 'node:child_process';
import { env } from '../config.js';
import type { Llm } from './index.js';

/**
 * Drives the local `claude` CLI, so interactive work runs on your Claude Code
 * subscription instead of metered API credits.
 *
 * Caveat worth knowing: the CLI authenticates against the macOS Keychain, so
 * this provider only works on the host — never inside the container. The
 * container path must use LLM_PROVIDER=api.
 */
export function claudeCli(): Llm {
  return {
    name: 'claude-cli',
    complete(prompt, opts = {}) {
      const args = ['-p', '--output-format', 'text'];
      if (opts.system) args.push('--append-system-prompt', opts.system);
      if (env.model) args.push('--model', env.model);

      return new Promise((resolve, reject) => {
        const child = spawn(env.claudeBin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
        let out = '', err = '';
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { err += d; });
        child.on('error', (e) =>
          reject(new Error(
            `claude CLI not runnable at "${env.claudeBin}" (${e.message}). ` +
            `Install it (npm i -g @anthropic-ai/claude-code), point CLAUDE_BIN at the binary, ` +
            `or set LLM_PROVIDER=api.`)));
        child.on('close', (code) =>
          code === 0 ? resolve(out.trim())
                     : reject(new Error(`claude CLI exited ${code}: ${err.slice(0, 500)}`)));
        child.stdin.end(prompt);
      });
    },
  };
}
