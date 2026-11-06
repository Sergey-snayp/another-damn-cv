import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { resumeApi, type RenderedResume } from '../resumeApi';
import { range } from './dates';

/** Where the CV shows a skill: a job or project, its dates, and the line that names it. */
export interface SkillUse {
  where: string;
  when: string;
  line: string;
}

const escapeTerm = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether the text names the skill as a whole word ("Go" is not in "Google"). */
export function names(text: string, skill: string): boolean {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeTerm(skill.trim())}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}

/** "Tech stack: Node.js | Redis | …": a list of names, not a sentence about the work. */
const isStackList = (text: string) =>
  /^\s*(tech(nology)? stack|stack|technologies|tools)\s*:/i.test(text) || text.split(/[|,]/).length > 6;

/**
 * The jobs and projects whose text names the skill, in CV order. Each shows the
 * sentence that names it; a job that only lists it in its tech stack says so.
 */
export function usesOf(resume: RenderedResume, skill: string): SkillUse[] {
  const uses: SkillUse[] = [];
  const lineFrom = (texts: string[]) => {
    const naming = texts.filter((text) => text && names(text, skill));
    if (!naming.length) return null;
    return naming.find((text) => !isStackList(text)) ?? 'Listed in the tech stack';
  };
  for (const role of resume.experiences ?? []) {
    const line = lineFrom([role.blurb ?? '', ...role.achievements.map((achievement) => achievement.bullet)]);
    if (line) uses.push({ where: [role.title, role.company].filter(Boolean).join(' · '), when: range(role.from, role.to, role.current), line });
  }
  for (const project of resume.projects ?? []) {
    const line = lineFrom(project.bullets) ?? (names(project.name, skill) ? project.name : null);
    if (line) uses.push({ where: project.name, when: range(project.from, project.to, project.current), line });
  }
  return uses;
}

/**
 * Pointing at a skill or keyword, anywhere in the editors: after a short pause
 * its card opens. \`card\` is rendered by the caller; nothing shows without a CV id.
 */
export function useSkillCard(resumeId: string | null, resume: RenderedResume | null): {
  point(name: string, anchor: HTMLElement, options?: { notWhileTyping?: boolean }): void;
  leave(): void;
  card: ReactNode;
} {
  const [pointed, setPointed] = useState<{ name: string; anchor: HTMLElement } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const leave = () => { window.clearTimeout(timer.current); setPointed(null); };
  const point = (name: string, anchor: HTMLElement, options?: { notWhileTyping?: boolean }) => {
    window.clearTimeout(timer.current);
    if (!name.trim() || !resumeId) return;
    timer.current = window.setTimeout(() => {
      if (options?.notWhileTyping && anchor.contains(document.activeElement)) return;
      setPointed({ name: name.trim(), anchor });
    }, 400);
  };
  useEffect(() => {
    if (!pointed) return;
    // The card is drawn over the page: scrolling would leave it behind.
    window.addEventListener('scroll', leave, true);
    return () => window.removeEventListener('scroll', leave, true);
  }, [pointed]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const card = pointed && resumeId && pointed.anchor.isConnected
    ? <SkillInfo resumeId={resumeId} name={pointed.name} anchor={pointed.anchor} uses={resume ? usesOf(resume, pointed.name) : []} />
    : null;
  return { point, leave, card };
}

/** The part of a line around the skill, so a long bullet still fits the card. */
function around(line: string, skill: string): string {
  const text = line.trim();
  if (text.length <= 140) return text;
  const at = Math.max(0, text.toLowerCase().indexOf(skill.trim().toLowerCase()));
  const start = Math.max(0, Math.min(at - 50, text.length - 140));
  return `${start > 0 ? '…' : ''}${text.slice(start, start + 140).trim()}${start + 140 < text.length ? '…' : ''}`;
}

/** Explanations already asked for in this tab: pointing at a skill again shows it at once. */
const asked = new Map<string, Promise<string>>();
function describe(resumeId: string, name: string): Promise<string> {
  const key = name.trim().toLowerCase();
  let answer = asked.get(key);
  if (!answer) {
    answer = resumeApi.technology(resumeId, name).then((note) => note.description);
    answer.catch(() => asked.delete(key));
    asked.set(key, answer);
  }
  return answer;
}

/**
 * The card shown while pointing at a skill on the CV: what the technology is
 * (written once by the AI and saved on the server) and where the CV uses it.
 * It is drawn over the page, outside the scaled document, and never printed.
 */
export function SkillInfo({ resumeId, name, anchor, uses }: {
  resumeId: string; name: string; anchor: HTMLElement; uses: SkillUse[];
}) {
  const [description, setDescription] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    let live = true;
    setDescription(null);
    setFailed(false);
    describe(resumeId, name).then((text) => { if (live) setDescription(text); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [resumeId, name]);

  // Under the skill, or above it when there is no room below; always inside the window.
  useLayoutEffect(() => {
    const box = card.current;
    if (!box) return;
    const at = anchor.getBoundingClientRect();
    const { width, height } = box.getBoundingClientRect();
    const below = at.bottom + 8;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, at.top - 8 - height) : below;
    const left = Math.min(Math.max(8, at.left), window.innerWidth - width - 8);
    setPlace({ top, left });
  }, [anchor, description, failed]);

  return createPortal(
    <div ref={card} className="skill-info" role="tooltip"
      style={place ? { top: place.top, left: place.left } : { top: -9999, left: -9999 }}>
      <p className="skill-info-name">{name}</p>
      <p className="skill-info-text">
        {description ?? (failed ? 'Could not load a description. Point at it again to retry.' : <span className="skill-info-loading">Looking it up…</span>)}
      </p>
      <p className="skill-info-label">{uses.length ? 'Used in' : 'Not in your jobs or projects yet'}</p>
      {uses.length > 0 && (
        <ul className="skill-info-uses">
          {uses.slice(0, 4).map((use, index) => (
            <li key={index}>
              <span className="skill-info-where"><b>{use.where}</b>{use.when && <span>{use.when}</span>}</span>
              <span className="skill-info-line">{around(use.line, name)}</span>
            </li>
          ))}
          {uses.length > 4 && <li className="skill-info-more">and {uses.length - 4} more</li>}
        </ul>
      )}
    </div>,
    document.body,
  );
}
