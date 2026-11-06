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
  kind: string;
  apply(next: string, draft: RenderedResume): void;
}

export interface ResumeDocumentProps {
  resume: RenderedResume;
  theme: ResumeTheme;
  onChange(change: (draft: RenderedResume) => void): void;
  readOnly?: boolean;
  resumeId?: string;
  changes?: Change[];
  onTailor?(target: RewriteTarget, anchor: HTMLElement): void;
}

/** The CV in its design. There is one for now ("professional"); new designs are added here. */
export function ResumeDocument(props: ResumeDocumentProps) {
  return <ProfessionalDocument {...props} />;
}
