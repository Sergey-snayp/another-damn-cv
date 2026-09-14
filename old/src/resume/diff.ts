import { parse } from 'yaml';
import type { TailoredResume } from '../types.js';

interface MasterRole {
  company: string; title: string;
  context?: string;
  highlights?: string[];
}
interface Master {
  identity?: { headline?: string };
  summary?: string;
  skills?: Record<string, string[]>;
  experience?: MasterRole[];
}

const STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'across', 'using', 'used',
  'over', 'via', 'per', 'was', 'were', 'are', 'has', 'have', 'had', 'its', 'their', 'them',
  'while', 'when', 'where', 'which', 'also', 'both', 'each', 'more', 'than', 'such', 'been',
]);

/** Distinctive words only — the shared scaffolding of resume prose carries no signal. */
const tokens = (s: string): Set<string> =>
  new Set((s.toLowerCase().match(/[a-z0-9][a-z0-9+.#/-]{2,}/g) ?? []).filter((w) => !STOP.has(w)));

/** A master highlight counts as kept if a bullet reuses enough of its distinctive words. */
function isRepresented(highlight: string, bullets: string[]): boolean {
  const h = tokens(highlight);
  if (h.size === 0) return true;
  return bullets.some((b) => {
    const t = tokens(b);
    let hit = 0;
    for (const w of h) if (t.has(w)) hit++;
    return hit / h.size >= 0.3;
  });
}

export interface RoleDiff {
  company: string; title: string; context?: string;
  masterBullets: number; usedBullets: number; kept: number;
  dropped: string[];
}

export interface ResumeDiff {
  headlineFrom: string; headlineTo: string; headlineChanged: boolean;
  roles: RoleDiff[];
  rolesOmitted: string[];
  skillsTotal: number; skillsShown: number;
  skillsOmitted: string[];
  /** Skills in the output that are absent from the master — should always be empty. */
  skillsAdded: string[];
}

/** Mean share of each highlight's distinctive words that survive into the bullets. */
function overlapScore(highlights: string[], bullets: string[]): number {
  if (highlights.length === 0) return 0;
  const pooled = tokens(bullets.join(' '));
  let sum = 0;
  for (const h of highlights) {
    const t = tokens(h);
    if (t.size === 0) continue;
    let hit = 0;
    for (const w of t) if (pooled.has(w)) hit++;
    sum += hit / t.size;
  }
  return sum / highlights.length;
}

export function diffAgainstMaster(r: TailoredResume, masterRaw: string): ResumeDiff {
  const m = parse(masterRaw) as Master;
  const masterRoles = m.experience ?? [];

  const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const roles: RoleDiff[] = [];
  const rolesOmitted: string[] = [];

  // One-to-one assignment. A profile can hold two spells at the same employer under
  // the same title; matching by name alone would pair both against one entry and
  // report a full role as deleted.
  const unclaimed = r.experience.map((_, i) => i);

  for (const mr of masterRoles) {
    const highlights = mr.highlights ?? [];
    const sameCompany = unclaimed.filter((i) => norm(r.experience[i]!.company) === norm(mr.company));
    if (sameCompany.length === 0) {
      rolesOmitted.push(`${mr.company} — ${mr.title}`);
      continue;
    }

    let best = sameCompany[0]!;
    let bestScore = -1;
    for (const i of sameCompany) {
      const e = r.experience[i]!;
      const titleBonus = norm(e.title) === norm(mr.title) ? 0.05 : 0;
      const score = overlapScore(highlights, e.bullets) + titleBonus;
      if (score > bestScore) { bestScore = score; best = i; }
    }
    unclaimed.splice(unclaimed.indexOf(best), 1);

    const match = r.experience[best]!;
    const dropped = highlights.filter((h) => !isRepresented(h, match.bullets));
    roles.push({
      company: mr.company,
      title: mr.title,
      context: mr.context,
      masterBullets: highlights.length,
      usedBullets: match.bullets.length,
      kept: highlights.length - dropped.length,
      dropped,
    });
  }

  const masterSkills = Object.values(m.skills ?? {}).flat();
  const masterSet = new Map(masterSkills.map((s) => [norm(s), s]));
  const shown = r.skillGroups.flatMap((g) => g.items);
  const shownSet = new Set(shown.map(norm));

  return {
    headlineFrom: m.identity?.headline ?? '',
    headlineTo: r.headline,
    headlineChanged: norm(m.identity?.headline ?? '') !== norm(r.headline),
    roles,
    rolesOmitted,
    skillsTotal: masterSkills.length,
    skillsShown: shown.length,
    skillsOmitted: [...masterSet].filter(([k]) => !shownSet.has(k)).map(([, v]) => v),
    skillsAdded: shown.filter((s) => !masterSet.has(norm(s))),
  };
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Trim to a word boundary so labels don't end mid-word. */
function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > max * 0.6 ? cut.lastIndexOf(' ') : max)}…`;
}

/** Two spells at one employer need the project to tell them apart. */
const roleLabel = (r: RoleDiff): string =>
  r.context ? `${esc(r.company)} <i>(${esc(shorten(r.context, 38))})</i>` : esc(r.company);

/** Telegram HTML summary of what the tailorer changed and, more usefully, removed. */
export function formatDiff(d: ResumeDiff): string {
  const out: string[] = ['📝 <b>Changes from your Master CV</b>'];

  if (d.headlineChanged) {
    out.push(`\n<b>Headline</b>\n<s>${esc(d.headlineFrom)}</s>\n→ ${esc(d.headlineTo)}`);
  }

  const trimmed = d.roles.filter((r) => r.dropped.length > 0);
  const kept = d.roles.filter((r) => r.dropped.length === 0);
  if (trimmed.length) {
    out.push('\n<b>Experience trimmed</b>');
    for (const r of trimmed) {
      const b = `${r.usedBullets} bullet${r.usedBullets === 1 ? '' : 's'}`;
      out.push(`\n<b>${roleLabel(r)}</b> — kept ${r.kept} of ${r.masterBullets}, written as ${b}`);
      for (const dr of r.dropped.slice(0, 3)) {
        out.push(`  ✂️ <i>${esc(shorten(dr, 110))}</i>`);
      }
      if (r.dropped.length > 3) out.push(`  <i>…and ${r.dropped.length - 3} more</i>`);
    }
  }
  if (kept.length) {
    out.push(`\n<b>Kept in full:</b> ${kept.map(roleLabel).join(', ')}`);
  }
  if (d.rolesOmitted.length) {
    out.push(`\n⚠️ <b>Roles left out entirely:</b>\n${d.rolesOmitted.map((x) => `• ${esc(x)}`).join('\n')}`);
  }

  out.push(`\n<b>Skills</b> — ${d.skillsShown} of ${d.skillsTotal} shown`);
  if (d.skillsOmitted.length) {
    const head = d.skillsOmitted.slice(0, 14).map(esc).join(', ');
    out.push(`<i>Held back: ${head}${d.skillsOmitted.length > 14 ? `, +${d.skillsOmitted.length - 14} more` : ''}</i>`);
  }
  if (d.skillsAdded.length) {
    out.push(`\n🚨 <b>Not in your Master CV:</b> ${d.skillsAdded.map(esc).join(', ')}\n<i>Remove these or add them to your profile — do not send as is.</i>`);
  }

  out.push('\n<i>Nothing was invented: content is only reordered, reworded or cut.</i>');
  return out.join('\n');
}
