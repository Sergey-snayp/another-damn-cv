import { loadSearch } from '../config.js';
import { pickDigest, setStatus } from '../store/db.js';
import type { ScoredJob } from '../types.js';

export function buildDigest(): ScoredJob[] {
  const prefs = loadSearch();
  return pickDigest(prefs.min_score, prefs.daily_digest_limit);
}

export const markDigested = (jobs: ScoredJob[]): void => {
  for (const j of jobs) setStatus(j.id, 'digested');
};

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const bar = (score: number): string => {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
};

/** Telegram HTML for one job card. */
export function formatJob(j: ScoredJob, index: number, total: number): string {
  const comp = j.compensation ? `\n💰 ${esc(j.compensation)}` : '';
  const matches = j.matches.length ? `\n✅ ${esc(j.matches.slice(0, 3).join(' · '))}` : '';
  const gaps = j.gaps.length ? `\n⚠️ ${esc(j.gaps.slice(0, 2).join(' · '))}` : '';
  return `<b>${index}/${total}</b> · <code>${bar(j.score)}</code> <b>${j.score}</b>

<b>${esc(j.title)}</b>
🏢 ${esc(j.company)} · 📍 ${esc(j.location || 'n/a')}${j.remote ? ' · 🌐 remote' : ''}${comp}

<i>${esc(j.verdict)}</i>${matches}${gaps}

<a href="${esc(j.url)}">Open posting →</a>`;
}

/** A raw 0-100 number means little on its own; name the band. */
function band(score: number, min: number): string {
  if (score >= 80) return '🟢 Strong match';
  if (score >= min) return '🟡 Worth applying';
  if (score >= min - 20) return '🟠 Marginal — read the gaps first';
  return '🔴 Weak fit';
}

/**
 * Card for a single posting the user pasted, where there is no "3 of 10" to
 * show and there is room to spell the reasoning out properly.
 */
export function formatSingle(j: ScoredJob): string {
  const min = loadSearch().min_score;
  const comp = j.compensation ? `\n💰 ${esc(j.compensation)}` : '';
  const matches = j.matches.length
    ? `\n\n<b>✅ In your favour</b>\n${j.matches.slice(0, 4).map((m) => `• ${esc(m)}`).join('\n')}`
    : '';
  const gaps = j.gaps.length
    ? `\n\n<b>⚠️ Against you</b>\n${j.gaps.slice(0, 4).map((g) => `• ${esc(g)}`).join('\n')}`
    : '';

  return `<b>${esc(j.title)}</b>
🏢 ${esc(j.company)} · 📍 ${esc(j.location || 'n/a')}${j.remote ? ' · 🌐 remote' : ''}${comp}

<code>${bar(j.score)}</code> <b>${j.score}</b>/100 — ${band(j.score, min)}
<i>${esc(j.verdict)}</i>${matches}${gaps}

<a href="${esc(j.url)}">Open posting →</a>`;
}

export function formatHeader(count: number, report?: { fetched: number; kept: number }): string {
  const when = new Date().toLocaleDateString('en-CA', {
    weekday: 'long', month: 'short', day: 'numeric',
  });
  const scanned = report ? ` — scanned ${report.fetched}, ${report.kept} worth a look` : '';
  return count === 0
    ? `☕ <b>${when}</b>\n\nNothing cleared the bar today${scanned}.`
    : `☀️ <b>${when}</b>\n\n<b>${count}</b> ${count === 1 ? 'role' : 'roles'} for you${scanned}.`;
}
