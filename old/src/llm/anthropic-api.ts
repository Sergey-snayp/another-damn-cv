import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config.js';
import type { Llm } from './index.js';

/** Metered API path. Required for unattended runs and for the container. */
export function anthropicApi(): Llm {
  if (!env.anthropicKey) {
    throw new Error('LLM_PROVIDER=api but ANTHROPIC_API_KEY is unset. Add it to .env.');
  }
  const client = new Anthropic({ apiKey: env.anthropicKey });
  return {
    name: 'anthropic-api',
    async complete(prompt, opts = {}) {
      const res = await client.messages.create({
        model: env.model,
        max_tokens: opts.maxTokens ?? 4096,
        ...(opts.system ? { system: opts.system } : {}),
        messages: [{ role: 'user', content: prompt }],
      });
      return res.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text).join('').trim();
    },
  };
}
