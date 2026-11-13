/** Look of the document. Stored with the resume so it survives a reload. */
export interface ResumeTheme {
  /** One design for now; more can be added here later. */
  template: 'professional';
  accent: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  sectionGap: number;
  /** The name's size at the top of the CV, in points. */
  nameSize?: number;
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

/** The one design every CV has: the candidate's own layout, "professional". */
export const DEFAULT_THEME: ResumeTheme = {
  template: 'professional',
  accent: '#000000',
  fontFamily: 'Roboto, Arial, sans-serif',
  fontSize: 10,
  lineHeight: 1.3,
  sectionGap: 12,
  nameSize: 20,
  sectionOrder: ['summary', 'experience', 'projects', 'skills', 'education', 'certifications'],
};

export const NAME_SIZES = { min: 16, max: 48, step: 1 } as const;

/**
 * Every CV has the one design: a saved design keeps only its section order and
 * hidden sections and the name's size; its look (an older template, font or
 * size) is replaced.
 */
export function designOf(saved?: Partial<ResumeTheme> | null): ResumeTheme {
  return {
    ...DEFAULT_THEME,
    ...(saved?.sectionOrder ? { sectionOrder: saved.sectionOrder } : {}),
    ...(saved?.hiddenSections ? { hiddenSections: saved.hiddenSections } : {}),
    ...(typeof saved?.nameSize === 'number' && saved.nameSize >= NAME_SIZES.min && saved.nameSize <= NAME_SIZES.max
      ? { nameSize: saved.nameSize } : {}),
  };
}

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
    '--r-name': `${theme.nameSize ?? DEFAULT_THEME.nameSize}pt`,
  } as React.CSSProperties;
}
