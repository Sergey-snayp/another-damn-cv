import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '../config.js';
import type { RawJob, ScoredJob, JobStatus } from '../types.js';

mkdirSync(dirname(env.dbPath), { recursive: true });
export const db = new Database(env.dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT PRIMARY KEY,
  source       TEXT NOT NULL,
  company      TEXT NOT NULL,
  title        TEXT NOT NULL,
  location     TEXT NOT NULL,
  remote       INTEGER NOT NULL DEFAULT 0,
  description  TEXT NOT NULL,
  url          TEXT NOT NULL,
  posted_at    TEXT,
  compensation TEXT,
  score        INTEGER,
  verdict      TEXT,
  matches      TEXT,
  gaps         TEXT,
  status       TEXT NOT NULL DEFAULT 'new',
  first_seen   TEXT NOT NULL DEFAULT (datetime('now')),
  scored_at    TEXT,
  notes        TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_score  ON jobs(score DESC);

CREATE TABLE IF NOT EXISTS resumes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id     TEXT NOT NULL REFERENCES jobs(id),
  pdf_path   TEXT NOT NULL,
  tex_path   TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_resumes_job ON resumes(job_id);
`);

const insertJob = db.prepare(`
INSERT INTO jobs (id, source, company, title, location, remote, description, url, posted_at, compensation)
VALUES (@id, @source, @company, @title, @location, @remote, @description, @url, @postedAt, @compensation)
ON CONFLICT(id) DO NOTHING`);

/**
 * Refresh the posting's own fields on re-fetch. Deliberately leaves score,
 * verdict and status alone: a better parse should correct what we display
 * without silently discarding the user's applied/skipped decisions.
 */
const refreshJob = db.prepare(`
UPDATE jobs SET source=@source, company=@company, title=@title, location=@location,
  remote=@remote, description=@description, url=@url, posted_at=@postedAt,
  compensation=@compensation
WHERE id=@id`);

const jobExists = db.prepare('SELECT 1 FROM jobs WHERE id = ?');

/** Returns only the jobs that were genuinely new — the dedupe boundary. */
export function upsertJobs(jobs: RawJob[]): RawJob[] {
  const fresh: RawJob[] = [];
  const tx = db.transaction((batch: RawJob[]) => {
    for (const j of batch) {
      const row = { ...j, remote: j.remote ? 1 : 0 };
      if (jobExists.get(j.id)) {
        refreshJob.run(row);
      } else {
        insertJob.run(row);
        fresh.push(j);
      }
    }
  });
  tx(jobs);
  return fresh;
}

const saveScoreStmt = db.prepare(`
UPDATE jobs SET score=?, verdict=?, matches=?, gaps=?, scored_at=datetime('now') WHERE id=?`);

export function saveScore(s: ScoredJob): void {
  saveScoreStmt.run(s.score, s.verdict, JSON.stringify(s.matches), JSON.stringify(s.gaps), s.id);
}

export const setStatus = (id: string, status: JobStatus): void => {
  db.prepare(`UPDATE jobs SET status=? WHERE id=?`).run(status, id);
};

export const getJob = (id: string): ScoredJob | undefined => {
  const r = db.prepare(`SELECT * FROM jobs WHERE id=?`).get(id) as Record<string, unknown> | undefined;
  return r ? rowToScored(r) : undefined;
};

/** Top unsent jobs above the score floor, best first. */
export function pickDigest(minScore: number, limit: number): ScoredJob[] {
  const rows = db.prepare(
    `SELECT * FROM jobs WHERE status='new' AND score >= ? ORDER BY score DESC, posted_at DESC LIMIT ?`
  ).all(minScore, limit) as Record<string, unknown>[];
  return rows.map(rowToScored);
}

export const unscored = (): RawJob[] =>
  (db.prepare(`SELECT * FROM jobs WHERE score IS NULL AND status='new'`).all() as Record<string, unknown>[])
    .map(rowToRaw);

function rowToRaw(r: Record<string, unknown>): RawJob {
  return {
    id: String(r.id), source: String(r.source), company: String(r.company),
    title: String(r.title), location: String(r.location), remote: Number(r.remote) === 1,
    description: String(r.description), url: String(r.url),
    postedAt: (r.posted_at as string) ?? null, compensation: (r.compensation as string) ?? null,
  };
}

function rowToScored(r: Record<string, unknown>): ScoredJob {
  const parse = (v: unknown): string[] => { try { return JSON.parse(String(v ?? '[]')); } catch { return []; } };
  return {
    ...rowToRaw(r),
    score: Number(r.score ?? 0), verdict: String(r.verdict ?? ''),
    matches: parse(r.matches), gaps: parse(r.gaps),
  };
}

export function recordResume(jobId: string, pdfPath: string, texPath: string, content: unknown): void {
  db.prepare(`INSERT INTO resumes (job_id, pdf_path, tex_path, content) VALUES (?,?,?,?)`)
    .run(jobId, pdfPath, texPath, JSON.stringify(content));
}

export function stats(): Record<string, number> {
  const rows = db.prepare(`SELECT status, COUNT(*) n FROM jobs GROUP BY status`).all() as
    { status: string; n: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r.n;
  out.total = (db.prepare(`SELECT COUNT(*) n FROM jobs`).get() as { n: number }).n;
  out.resumes = (db.prepare(`SELECT COUNT(*) n FROM resumes`).get() as { n: number }).n;
  return out;
}
