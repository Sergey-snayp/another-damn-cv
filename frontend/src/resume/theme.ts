export type HeaderAlign = 'left' | 'center' | 'right';
export type PageMargins = 'narrow' | 'normal' | 'wide';
export type PageSize = 'a4' | 'letter';
/** short "Jan 2024", numeric "01/2024", year "2024", long "January 2024". */
export type DateFormat = 'short' | 'numeric' | 'year' | 'long';
export type BulletIcon = 'bullet' | 'dash' | 'arrow';
export type EducationLayout = 'two-lines' | 'one-line';

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
  headerAlign: HeaderAlign;
  margins: PageMargins;
  pageSize: PageSize;
  /** The name in capitals. */
  nameCaps: boolean;
  dateFormat: DateFormat;
  /** A job's place on its first line (beside the company) and its dates on the second. */
  locationAboveDates: boolean;
  /** "Vancouver, BC, Canada" rather than "Vancouver, BC". */
  showCountry: boolean;
  bulletIcon: BulletIcon;
  /** Each skills line with a bullet mark, like the bullets. */
  skillsListed: boolean;
  /** Each education entry on two lines (school and dates, then degree) or on one. */
  educationLayout: EducationLayout;
  /** 2: saved by the Design panel, so its font, size and line height are the person's choice. */
  version: 2;
}

/** The fonts a CV can use: each prints the same in the PDF (Google Fonts, or on every computer). */
export const FONTS = [
  { label: 'Roboto', css: 'Roboto, Arial, sans-serif', google: 'Roboto' },
  { label: 'Inter', css: 'Inter, Arial, sans-serif', google: 'Inter' },
  { label: 'Open Sans', css: '"Open Sans", Arial, sans-serif', google: 'Open Sans' },
  { label: 'Lato', css: 'Lato, Arial, sans-serif', google: 'Lato' },
  { label: 'Source Sans 3', css: '"Source Sans 3", Arial, sans-serif', google: 'Source Sans 3' },
  { label: 'Merriweather', css: 'Merriweather, Georgia, serif', google: 'Merriweather' },
  { label: 'EB Garamond', css: '"EB Garamond", Georgia, serif', google: 'EB Garamond' },
  { label: 'Arial', css: 'Arial, Helvetica, sans-serif', google: null },
  { label: 'Georgia', css: 'Georgia, serif', google: null },
  { label: 'Times New Roman', css: '"Times New Roman", Times, serif', google: null },
] as const;
export const FONT_SIZES = [9, 9.5, 10, 10.5, 11, 11.5, 12] as const;
export const LINE_HEIGHTS = { min: 1, max: 2, step: 0.05 } as const;
/** The page's side margins, and its top and bottom margins on every sheet. */
export const MARGINS: Record<PageMargins, string> = { narrow: '0.25in', normal: '0.5in', wide: '0.75in' };
/** Width and height in CSS pixels (96 per inch). A4 is 210mm × 297mm. */
export const PAGE_SIZES: Record<PageSize, { width: string; height: number }> = {
  a4: { width: '210mm', height: (297 * 96) / 25.4 },
  letter: { width: '8.5in', height: 11 * 96 },
};

const loadedFonts = new Map<string, Promise<void>>();
/** Loads the font's styles from Google Fonts once; resolves when they can be used (or at once for a system font). */
export function loadFont(css: string): Promise<void> {
  const font = FONTS.find((item) => item.css === css);
  if (!font?.google || typeof document === 'undefined') return Promise.resolve();
  const family = font.google;
  if (family === 'Roboto') return Promise.resolve(); // index.html loads it.
  let loading = loadedFonts.get(family);
  if (!loading) {
    loading = new Promise<void>((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:ital,wght@0,400;0,700;1,400;1,700&display=block`;
      link.onload = () => resolve();
      link.onerror = () => resolve();
      document.head.appendChild(link);
    });
    loadedFonts.set(family, loading);
  }
  return loading;
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
  headerAlign: 'center',
  margins: 'narrow',
  pageSize: 'a4',
  nameCaps: true,
  dateFormat: 'short',
  locationAboveDates: false,
  showCountry: true,
  bulletIcon: 'dash',
  skillsListed: true,
  educationLayout: 'two-lines',
  version: 2,
};

export const NAME_SIZES = { min: 16, max: 48, step: 1 } as const;

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;
const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

/**
 * The saved design as the editor offers it: each setting kept when it is one the
 * editor has, the default otherwise. A font, size or colour from an older design
 * the editor never offered (saved before these settings) goes back to the default.
 * The result always has `version: 2`, so the next save keeps what is shown.
 */
export function designOf(saved?: Partial<ResumeTheme> | null): ResumeTheme {
  // Before the Design panel every CV had the one look; a font or size saved then was never chosen.
  const chosen = saved?.version === 2;
  const lineHeight = chosen ? saved?.lineHeight : undefined;
  return {
    ...DEFAULT_THEME,
    ...(saved?.sectionOrder ? { sectionOrder: saved.sectionOrder } : {}),
    ...(saved?.hiddenSections ? { hiddenSections: saved.hiddenSections } : {}),
    ...(typeof saved?.nameSize === 'number' && saved.nameSize >= NAME_SIZES.min && saved.nameSize <= NAME_SIZES.max
      ? { nameSize: saved.nameSize } : {}),
    fontFamily: chosen && FONTS.some((font) => font.css === saved?.fontFamily) ? saved!.fontFamily! : DEFAULT_THEME.fontFamily,
    fontSize: chosen && (FONT_SIZES as readonly number[]).includes(saved?.fontSize as number) ? saved!.fontSize! : DEFAULT_THEME.fontSize,
    lineHeight: typeof lineHeight === 'number' && lineHeight >= LINE_HEIGHTS.min && lineHeight <= LINE_HEIGHTS.max
      ? Math.round(lineHeight * 100) / 100 : DEFAULT_THEME.lineHeight,
    headerAlign: oneOf(saved?.headerAlign, ['left', 'center', 'right'], DEFAULT_THEME.headerAlign),
    margins: oneOf(saved?.margins, ['narrow', 'normal', 'wide'], DEFAULT_THEME.margins),
    pageSize: oneOf(saved?.pageSize, ['a4', 'letter'], DEFAULT_THEME.pageSize),
    nameCaps: flag(saved?.nameCaps, DEFAULT_THEME.nameCaps),
    dateFormat: oneOf(saved?.dateFormat, ['short', 'numeric', 'year', 'long'], DEFAULT_THEME.dateFormat),
    locationAboveDates: flag(saved?.locationAboveDates, DEFAULT_THEME.locationAboveDates),
    showCountry: flag(saved?.showCountry, DEFAULT_THEME.showCountry),
    bulletIcon: oneOf(saved?.bulletIcon, ['bullet', 'dash', 'arrow'], DEFAULT_THEME.bulletIcon),
    skillsListed: flag(saved?.skillsListed, DEFAULT_THEME.skillsListed),
    educationLayout: oneOf(saved?.educationLayout, ['two-lines', 'one-line'], DEFAULT_THEME.educationLayout),
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
    '--r-margin': MARGINS[theme.margins ?? DEFAULT_THEME.margins],
    '--r-page-w': PAGE_SIZES[theme.pageSize ?? DEFAULT_THEME.pageSize].width,
    '--r-page-h': `${PAGE_SIZES[theme.pageSize ?? DEFAULT_THEME.pageSize].height}px`,
  } as React.CSSProperties;
}
