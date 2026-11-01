import { ACCENTS, FONTS, type ResumeTheme } from './theme';

export function StylePanel({ theme, onChange }: {
  theme: ResumeTheme;
  onChange(next: ResumeTheme): void;
}) {
  const set = <K extends keyof ResumeTheme>(key: K, value: ResumeTheme[K]) =>
    onChange({ ...theme, [key]: value });

  return (
    <aside className="stylepanel">
      <p className="group">Template</p>
      <div className="segmented">
        {(['classic', 'compact'] as const).map((t) => (
          <button key={t}
            className={theme.template === t ? 'on' : ''}
            onClick={() => set('template', t)}>{t}</button>
        ))}
      </div>

      <p className="group">Accent</p>
      <div className="swatches">
        {ACCENTS.map((colour) => (
          <button key={colour}
            className={theme.accent === colour ? 'swatch on' : 'swatch'}
            style={{ background: colour }}
            onClick={() => set('accent', colour)} />
        ))}
      </div>

      <p className="group">Font</p>
      <select value={theme.fontFamily} onChange={(e) => set('fontFamily', e.target.value)}>
        {FONTS.map((font) => (
          <option key={font.value} value={font.value}>{font.label}</option>
        ))}
      </select>

      <p className="group">Size <span className="muted">{theme.fontSize}pt</span></p>
      <input type="range" min={9} max={12} step={0.5}
        value={theme.fontSize}
        onChange={(e) => set('fontSize', Number(e.target.value))} />

      <p className="group">Line height <span className="muted">{theme.lineHeight}</span></p>
      <input type="range" min={1.2} max={1.7} step={0.02}
        value={theme.lineHeight}
        onChange={(e) => set('lineHeight', Number(e.target.value))} />

      <p className="group">Section spacing <span className="muted">{theme.sectionGap}px</span></p>
      <input type="range" min={8} max={24} step={1}
        value={theme.sectionGap}
        onChange={(e) => set('sectionGap', Number(e.target.value))} />

      <p className="hint" style={{ textAlign: 'left', marginTop: 16 }}>
        One column, real text, no tables — which is what an ATS can actually read.
      </p>
    </aside>
  );
}
