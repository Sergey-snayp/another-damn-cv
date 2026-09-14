import { env } from '../config.js';
import { claudeCli } from './claude-cli.js';
import { anthropicApi } from './anthropic-api.js';

export interface Llm {
  readonly name: string;
  /** Returns raw model text. Callers parse it. */
  complete(prompt: string, opts?: { system?: string; maxTokens?: number }): Promise<string>;
}

export function getLlm(): Llm {
  return env.llmProvider === 'api' ? anthropicApi() : claudeCli();
}

/**
 * Models like to wrap JSON in prose or fences. Pull out the first balanced
 * object/array rather than trusting the whole response to be clean.
 */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced?.[1] ?? text;
  const start = body.search(/[[{]/);
  if (start === -1) throw new Error(`No JSON found in model output: ${text.slice(0, 300)}`);
  const open = body[start] as '[' | '{';
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === open) depth++;
    else if (ch === close && --depth === 0) return JSON.parse(body.slice(start, i + 1)) as T;
  }
  throw new Error(`Unbalanced JSON in model output: ${text.slice(0, 300)}`);
}
