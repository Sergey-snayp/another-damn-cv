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
  /** "off" stops the server from printing CV PDFs (integration tests use a stand-in). */
  pdfRendering: optional('PDF_RENDERING', 'on'),
  /** Chrome the server prints CV PDFs with (puppeteer-core brings none of its own). */
  chromePath: optional(
    'CHROME_PATH',
    process.platform === 'darwin'
      ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
      : '/usr/bin/google-chrome',
  ),

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
  interviewModel: optional('INTERVIEW_MODEL', optional('LLM_MODEL', 'claude-sonnet-5')),
};
