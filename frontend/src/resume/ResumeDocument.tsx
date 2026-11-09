import type { Change, RenderedResume } from '../resumeApi';
import type { ResumeTheme } from './theme';
import { ProfessionalDocument } from './templates/ProfessionalDocument';

/**
 * The resume, rendered as the page it will become — and editable in place.
 *
 * Deliberately single column with real text and no tables: that is what an ATS
 * can parse, and it is what the whole project promises.
 */
/** Which line the rewrite popover is open on, if any. */
export interface RewriteTarget {
  text: string;
  context?: string;
  /** "bullet", "summary", "headline", or "skills" for one line of the skills section. */
  kind: string;
  /** What the line is, in a list of suggestions: "Bullet 2", "Project", "Core". */
  label?: string;
  /** The line's data-edit-key on the page, so its new version can be shown in its place. */
  key?: string;
  /** A job's bullet: which job, so its bullets can be chosen from the Profile's full list. */
  role?: { company: string; title: string; from: string; client?: string; description?: string; techStack?: string; position?: number };
  /** A skills line: its category and skills, tailored together. */
  skills?: { category: string; names: string[] };
  /** Puts the suggestion in the draft; for skills, `next` is the JSON list of names. */
  apply(next: string, draft: RenderedResume): void;
  /** A job's bullet: adds a new bullet after the job's last one (a job may gain bullets for a posting). */
  append?(next: string, draft: RenderedResume): void;
}

export interface ResumeDocumentProps {
  resume: RenderedResume;
  theme: ResumeTheme;
  onChange(change: (draft: RenderedResume) => void): void;
  readOnly?: boolean;
  resumeId?: string;
  changes?: Change[];
  /** One line, or every line of a section at once. */
  onTailor?(target: RewriteTarget | RewriteTarget[], anchor: HTMLElement): void;
  /** Takes a whole section ("summary", "skills", "custom:<id>") off the CV; it can be shown again. */
  onHideSection?(key: string): void;
}

/** The CV in its design. There is one for now ("professional"); new designs are added here. */
export function ResumeDocument(props: ResumeDocumentProps) {
  return <ProfessionalDocument {...props} />;
}
