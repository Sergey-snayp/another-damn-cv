import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import 'dotenv/config';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function yaml<T>(rel: string): T {
  const p = join(ROOT, rel);
  if (!existsSync(p)) throw new Error(`Missing config file: ${rel}`);
  return parse(readFileSync(p, 'utf8')) as T;
}

export interface SearchPrefs {
  titles_include: string[];
  titles_exclude: string[];
  stack_required_any: string[];
  locations: { allow: string[]; deny_remote_scoped_to: string[] };
  freshness_days: number;
  min_score: number;
  daily_digest_limit: number;
  digest_hour: number;
}

export interface CompanyEntry {
  token: string;
  name: string;
  ats: 'greenhouse' | 'lever' | 'ashby' | 'unknown';
}

export const loadSearch = () => yaml<SearchPrefs>('profile/search.yaml');
export const loadCompanies = () =>
  yaml<{ companies: CompanyEntry[] }>('profile/companies.yaml').companies;
export const loadMasterRaw = () => readFileSync(join(ROOT, 'profile/master.yaml'), 'utf8');

export const env = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? '',
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  /** 'claude-cli' uses your Claude Code subscription; 'api' uses ANTHROPIC_API_KEY. */
  llmProvider: (process.env.LLM_PROVIDER ?? 'claude-cli') as 'claude-cli' | 'api',
  /** Absolute path to the `claude` binary when it isn't on PATH (IDE-only installs). */
  claudeBin: process.env.CLAUDE_BIN || 'claude',
  /** Absolute path to the `tectonic` binary when it isn't on PATH. */
  tectonicBin: process.env.TECTONIC_BIN || 'tectonic',
  model: process.env.LLM_MODEL ?? 'claude-sonnet-5',
  dbPath: process.env.DB_PATH ?? join(ROOT, 'data/jobs.db'),
  outDir: process.env.OUT_DIR ?? join(ROOT, 'out'),
  tz: process.env.TZ ?? 'America/Vancouver',
};
