/** Look of the document. Stored with the resume so it survives a reload. */
export interface ResumeTheme {
  template: 'classic' | 'compact';
  accent: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  sectionGap: number;
  /** The editor's order of the CV's sections (the header always comes first). */
  sectionOrder?: string[];
  /** Sections left out of the CV and its PDF. */
  hiddenSections?: string[];
}

/** The sections every CV has, in their usual order. Custom sections are "custom:<id>". */
export const SECTION_KEYS = ['summary', 'experience', 'projects', 'education', 'certifications', 'skills'] as const;
export type BuiltInSection = (typeof SECTION_KEYS)[number];
export type SectionKey = BuiltInSection | `custom:${string}`;

export const customKey = (lineageId: string): SectionKey => `custom:${lineageId}`;

/**
 * The saved order of the CV's sections. A section the saved order does not
 * mention goes after the section it usually follows, so sections added later
 * land in their usual place; custom sections go at the end.
 */
export function sectionOrder(theme: ResumeTheme, customIds: string[] = []): SectionKey[] {
  const known: SectionKey[] = [...SECTION_KEYS, ...customIds.map(customKey)];
  const order = [...new Set((theme.sectionOrder ?? []).filter((key): key is SectionKey => known.includes(key as SectionKey)))];
  SECTION_KEYS.forEach((key, index) => {
    if (order.includes(key)) return;
    const before = SECTION_KEYS.slice(0, index).reverse().find((previous) => order.includes(previous));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, key);
  });
  for (const key of known) if (!order.includes(key)) order.push(key);
  return order;
}

export const DEFAULT_THEME: ResumeTheme = {
  template: 'classic',
  accent: '#1a3a5c',
  fontFamily: '"Charter", "Georgia", serif',
  fontSize: 10.5,
  lineHeight: 1.42,
  sectionGap: 14,
};

export const FONTS = [
  { label: 'Charter', value: '"Charter", "Georgia", serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Helvetica', value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { label: 'Inter', value: 'Inter, -apple-system, sans-serif' },
  { label: 'Times', value: '"Times New Roman", Times, serif' },
];

export const ACCENTS = ['#1a3a5c', '#0f172a', '#134e4a', '#7c2d12', '#4c1d95', '#831843'];

/**
 * The theme drives CSS custom properties rather than inline styles on every
 * element, so the print stylesheet inherits it for free.
 */
export function themeVars(theme: ResumeTheme): React.CSSProperties {
  return {
    '--r-accent': theme.accent,
    '--r-font': theme.fontFamily,
    '--r-size': `${theme.fontSize}pt`,
    '--r-line': String(theme.lineHeight),
    '--r-gap': `${theme.sectionGap}px`,
  } as React.CSSProperties;
}
