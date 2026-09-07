import { getLlm, extractJson } from '../llm/index.js';
import { parse } from 'yaml';
import { readFileSync, existsSync } from 'node:fs';
import type { RawJob, TailoredResume } from '../types.js';
import { aliasesOf } from './aliases.js';

/**
 * Screening simulation, modelled on what the mainstream tools actually measure
 * and on what recruiters report doing:
 *
 * - Jobscan scores hard-skill coverage against the posting, weighted by how
 *   central each skill is, and treats ~75% as the practical target.
 * - VMock splits its 0-100 into Impact, Presentation and Competencies.
 * - Resume Worded checks quantified achievements and flags weak openers.
 * - Recruiter surveys: a 10-15 second first pass on title, core skills and the
 *   impact of the most recent role; knockout questions do the real filtering.
 *
 * Deliberately NOT modelled: automatic rejection by an ATS. Greenhouse and Lever
 * do not rank or reject on content, so a score here is about how quickly a human
 * sees the fit — not about clearing a robot.
 */

const WEAK_OPENERS = [
  'assisted', 'helped', 'worked on', 'participated', 'responsible for', 'involved in',
  'supported', 'contributed to', 'familiar with', 'exposure to', 'tasked with',
  'duties included', 'took part in',
];

/** Recruiters scan bullets for %, $ or a count — its absence reads as passenger, not driver. */
const QUANTIFIED = /\d[\d,.]*\s*(%|percent|x\b|k\b|m\b|bn\b|\+)|[$€£]\s*\d|\b\d[\d,.]*\s*(users|customers|requests|rps|req\/s|tps|records|transactions|services|engineers|hours|days|weeks|months|ms|seconds)\b|\b\d+\s*(fold|times)\b/i;

export interface JdRequirements {
  title: string;
  seniority: string;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  yearsRequired: number | null;
  knockouts: string[];
}

export interface AtsReport {
  overall: number;
  /** Flat coverage of every keyword in the posting — the figure Simplify reports. */
  coverage: { rate: number; hit: number; total: number };
  keyword: { rate: number; matchedMust: string[]; missingMust: string[]; missingNice: string[] };
  title: { jdTitle: string; cvHeadline: string; aligned: boolean };
  impact: { bullets: number; quantified: number; rate: number; weakOpeners: string[] };
  presentation: { pages: number | null; issues: string[] };
  brevity: { avgBulletWords: number; longBullets: number };
  knockouts: string[];
  bands: { label: string; score: number; weight: number }[];
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9+#.]/g, '');
const tokenize = (s: string): string[] =>
  (s.toLowerCase().match(/[a-z0-9+#.]+/g) ?? []).filter((t) => t.length > 1);

/**
 * Lexical matching, like the real keyword scanners — but two traps to avoid:
 * a bare substring test matches "Lua" inside "evaluated", and an exact-phrase
 * test misses "REST API design" against a CV that says "REST APIs". So short
 * tokens must hit a whole word, and multi-word skills pass on majority overlap.
 */
function matchesLiterally(skill: string, blob: string, toks: Set<string>): boolean {
  const hit = (t: string): boolean =>
    t.length <= 4 ? toks.has(t) : toks.has(t) || blob.includes(t);

  const parts = tokenize(skill);
  if (parts.length === 0) return false;
  if (parts.length === 1) return hit(parts[0]!);
  if (blob.includes(parts.join(''))) return true;
  return parts.filter(hit).length / parts.length >= 0.6;
}

/** A requirement is met if the CV names it or any accepted synonym of it. */
function present(skill: string, blob: string, toks: Set<string>): boolean {
  return aliasesOf(skill).some((a) => matchesLiterally(a, blob, toks));
}

export async function extractRequirements(job: RawJob): Promise<JdRequirements> {
  const prompt = `<posting>
title: ${job.title}
company: ${job.company}
location: ${job.location}
${job.description.slice(0, 6000)}
</posting>

Extract what this employer will actually screen on. Return ONLY JSON:
{
  "title": "the role title as posted",
  "seniority": "intern|junior|mid|senior|staff|principal|manager",
  "mustHaveSkills": ["hard skills stated as required — technologies, languages, platforms"],
  "niceToHaveSkills": ["hard skills stated as preferred or nice-to-have"],
  "yearsRequired": <number or null>,
  "knockouts": ["binary eligibility gates: work authorization, on-site/location,
                 clearance, certification, degree — phrased as the question a
                 recruiter would ask"]
}

Hard skills only in the skill lists — no soft skills, no responsibilities.
Keep each skill to its canonical short name ("PostgreSQL", not "experience with PostgreSQL").`;

  return extractJson<JdRequirements>(
    await getLlm().complete(prompt, {
      system: 'You extract screening criteria from job postings. Be literal: only what the posting states.',
      maxTokens: 1500,
    }));
}

function countPdfPages(pdfPath: string): number | null {
  try {
    if (!existsSync(pdfPath)) return null;
    const buf = readFileSync(pdfPath, 'latin1');
    const count = buf.match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
    return count > 0 ? count : null;
  } catch { return null; }
}

export function analyse(
  r: TailoredResume, req: JdRequirements, masterRaw: string, pdfPath?: string,
): AtsReport {
  const cvRaw = [
    r.headline, r.summary,
    ...r.skillGroups.flatMap((g) => [g.label, ...g.items]),
    ...r.experience.flatMap((e) => [e.title, e.company, e.context ?? '', ...e.bullets]),
  ].join(' ');
  const cvText = norm(cvRaw);
  const cvTokens = new Set(tokenize(cvRaw));

  const must = req.mustHaveSkills ?? [];
  const nice = req.niceToHaveSkills ?? [];
  const matchedMust = must.filter((s) => present(s, cvText, cvTokens));
  const missingMust = must.filter((s) => !present(s, cvText, cvTokens));
  const missingNice = nice.filter((s) => !present(s, cvText, cvTokens));

  // Jobscan weights required skills far above preferred ones; mirror that 80/20.
  // Simplify reports one flat ratio over all keywords and suggests 70%+.
  const allKeywords = [...must, ...nice];
  const coverageHit = allKeywords.filter((s) => present(s, cvText, cvTokens)).length;
  const coverage = {
    hit: coverageHit,
    total: allKeywords.length,
    rate: allKeywords.length ? Math.round((coverageHit / allKeywords.length) * 100) : 100,
  };

  const mustRate = must.length ? matchedMust.length / must.length : 1;
  const niceRate = nice.length ? (nice.length - missingNice.length) / nice.length : 1;
  const keywordScore = Math.round((mustRate * 0.8 + niceRate * 0.2) * 100);

  const bullets = r.experience.flatMap((e) => e.bullets);
  const quantified = bullets.filter((b) => QUANTIFIED.test(b));
  const weakOpeners = bullets.filter((b) =>
    WEAK_OPENERS.some((w) => b.toLowerCase().trimStart().startsWith(w)));
  const impactRate = bullets.length ? quantified.length / bullets.length : 0;
  // Half of bullets carrying a number is already strong; cap credit there.
  const impactScore = Math.round(Math.min(1, impactRate / 0.5) * 100)
    - Math.min(20, weakOpeners.length * 7);

  const jdTitle = req.title || '';
  const titleWords = new Set(norm(jdTitle).match(/[a-z]+/g) ?? []);
  const cvTitleText = norm(`${r.headline} ${r.experience[0]?.title ?? ''}`);
  const titleHits = [...titleWords].filter((w) => w.length > 3 && cvTitleText.includes(w));
  const titleAligned = titleWords.size === 0 || titleHits.length / Math.max(1, titleWords.size) >= 0.34;

  const master = parse(masterRaw) as { identity?: Record<string, string> };
  const id = master.identity ?? {};
  const issues: string[] = [];
  if (!id.linkedin) issues.push('No LinkedIn URL — recruiters look for it first');
  if (!id.github) issues.push('No GitHub URL — expected for engineering roles');
  if (!id.email) issues.push('No email address');
  const pages = pdfPath ? countPdfPages(pdfPath) : null;
  if (pages && pages > 2) issues.push(`${pages} pages — 2 is the ceiling recruiters expect`);
  const presentationScore = Math.max(0, 100 - issues.length * 18);

  const words = bullets.map((b) => b.trim().split(/\s+/).length);
  const avgBulletWords = words.length
    ? Math.round(words.reduce((a, b) => a + b, 0) / words.length) : 0;
  const longBullets = words.filter((w) => w > 34).length;
  const brevityScore = Math.max(0, 100
    - Math.max(0, avgBulletWords - 26) * 4
    - longBullets * 6);

  const bands = [
    { label: 'Hard-skill match', score: keywordScore, weight: 0.40 },
    { label: 'Impact & metrics', score: Math.max(0, impactScore), weight: 0.25 },
    { label: 'Title alignment', score: titleAligned ? 100 : 45, weight: 0.15 },
    { label: 'Presentation', score: presentationScore, weight: 0.10 },
    { label: 'Brevity & style', score: brevityScore, weight: 0.10 },
  ];
  const overall = Math.round(bands.reduce((n, b) => n + b.score * b.weight, 0));

  return {
    overall,
    coverage,
    keyword: { rate: keywordScore, matchedMust, missingMust, missingNice },
    title: { jdTitle, cvHeadline: r.headline, aligned: titleAligned },
    impact: {
      bullets: bullets.length, quantified: quantified.length,
      rate: Math.round(impactRate * 100),
      weakOpeners: weakOpeners.map((b) => b.slice(0, 60)),
    },
    presentation: { pages, issues },
    brevity: { avgBulletWords, longBullets },
    knockouts: req.knockouts ?? [],
    bands,
  };
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const bar = (n: number): string => '█'.repeat(Math.round(n / 10)) + '░'.repeat(10 - Math.round(n / 10));

export function formatAts(a: AtsReport): string {
  const verdict = a.overall >= 80 ? '🟢 Strong — apply'
    : a.overall >= 65 ? '🟡 Competitive'
    : a.overall >= 50 ? '🟠 Below the usual bar'
    : '🔴 Weak on paper';

  const out: string[] = [
    `🎯 <b>Screening simulation</b>`,
    `<code>${bar(a.overall)}</code> <b>${a.overall}</b>/100 — ${verdict}`,
    `<i>Target is 75+, the match rate Jobscan recommends.</i>`,
    '',
    `🔑 <b>Keyword coverage: ${a.coverage.rate}%</b> (${a.coverage.hit}/${a.coverage.total})` +
      ` — ${a.coverage.rate >= 70 ? '✅ above' : '🔴 below'} Simplify's 70% guideline`,
    '',
    ...a.bands.map((b) => `${b.score >= 75 ? '✅' : b.score >= 55 ? '🟡' : '🔴'} ${b.label}: <b>${b.score}</b> <i>(${Math.round(b.weight * 100)}%)</i>`),
  ];

  if (a.knockouts.length) {
    out.push('', `<b>🚧 Knockout questions to expect</b>`,
      `<i>84% of recruiters screen on these before reading anything.</i>`,
      ...a.knockouts.slice(0, 5).map((k) => `• ${esc(k)}`));
  }

  if (a.keyword.missingMust.length) {
    out.push('', `<b>❌ Required skills not in your CV</b>`,
      esc(a.keyword.missingMust.slice(0, 12).join(', ')),
      `<i>Add only what you genuinely have — the rest is what to expect to be asked about.</i>`);
  } else if (a.keyword.matchedMust.length) {
    out.push('', `✅ <b>Every required skill is covered</b> (${a.keyword.matchedMust.length}/${a.keyword.matchedMust.length})`);
  }
  if (a.keyword.missingNice.length) {
    out.push(`<i>Preferred, not present: ${esc(a.keyword.missingNice.slice(0, 8).join(', '))}</i>`);
  }

  out.push('', `<b>📊 Impact</b> — ${a.impact.quantified}/${a.impact.bullets} bullets carry a number (${a.impact.rate}%)`);
  if (a.impact.rate < 40) out.push(`<i>Recruiters scan for %, $ and counts. Under 40% reads as duties, not results.</i>`);
  if (a.impact.weakOpeners.length) {
    out.push(`🔴 <b>Weak openers:</b> ${a.impact.weakOpeners.length}`,
      ...a.impact.weakOpeners.slice(0, 2).map((b) => `  <i>“${esc(b)}…”</i>`));
  }

  if (!a.title.aligned) {
    out.push('', `🟡 <b>Title mismatch</b>: posting says “${esc(a.title.jdTitle)}”, your headline reads “${esc(a.title.cvHeadline)}”`);
  }

  if (a.presentation.issues.length) {
    out.push('', `<b>📄 Presentation</b>`, ...a.presentation.issues.map((i) => `• ${esc(i)}`));
  }
  if (a.presentation.pages) out.push(`<i>${a.presentation.pages} page(s), avg ${a.brevity.avgBulletWords} words per bullet.</i>`);

  out.push('', `<i>No ATS auto-rejects you: Greenhouse and Lever route every applicant to a human. This estimates how fast that human sees the fit.</i>`);
  return out.join('\n');
}
