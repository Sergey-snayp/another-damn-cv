/** Look of the document. Stored with the resume so it survives a reload. */
export interface ResumeTheme {
  template: 'classic' | 'compact';
  accent: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  sectionGap: number;
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
