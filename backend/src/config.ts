import { resolve } from 'node:path';
import 'dotenv/config';

/**
 * Validated once at boot.
 *
 * A missing variable should stop the process with a clear message, not surface
 * as `undefined` inside a request three days later.
 */
function required(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}. See .env.example.`);
  }

  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const config = {
  port: Number(optional('PORT', '3001')),
  databaseUrl: required('DATABASE_URL'),
  sessionSecret: required('SESSION_SECRET'),
  frontendUrl: optional('FRONTEND_URL', 'http://localhost:5173'),

  /**
   * Only the client id is needed. We use Google's ID-token flow: the browser
   * receives a JWT signed by Google and we verify that signature against
   * Google's published public keys. Verifying a signature requires no secret —
   * a client secret is only needed to CALL Google's token endpoint, which the
   * authorization-code flow does and we do not.
   */
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    get configured(): boolean {
      return Boolean(this.clientId);
    },
  },

  claudeBin: optional('CLAUDE_BIN', 'claude'),
  llmModel: optional('LLM_MODEL', 'claude-sonnet-5'),

  // Legacy single-user paths, kept for seeding the fact base into Postgres.
  factBasePath: optional('FACTBASE_PATH',
    resolve(process.env.HOME ?? '', 'Projects/CVs/sergey_proniuk_cv.json')),
  dataDir: resolve(optional('DATA_DIR', './data')),
  scanRoot: optional('SCAN_ROOT', resolve(process.env.HOME ?? '', 'Projects')),
};
