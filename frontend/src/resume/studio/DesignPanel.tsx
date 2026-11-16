import { useId, useState, type ReactNode } from 'react';
import {
  FONT_SIZES, FONTS, LINE_HEIGHTS,
  type BulletIcon, type DateFormat, type EducationLayout, type HeaderAlign, type PageMargins, type PageSize, type ResumeTheme, type SectionKey,
} from '../theme';
import { NameSizeControl } from './NameSizeControl';
import { DashboardIcon } from '../../jobs/DashboardIcon';

const svg = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const ICONS = {
  template: <svg {...svg}><path d="M12 22a10 10 0 1 1 10-10c0 2.2-1.8 3-3.5 3H16a2 2 0 0 0-1.5 3.3A2 2 0 0 1 12 22Z" /><circle cx="7.5" cy="10.5" r="1" /><circle cx="12" cy="7.5" r="1" /><circle cx="16.5" cy="10.5" r="1" /></svg>,
  sections: <svg {...svg}><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="13" width="18" height="7" rx="2" /></svg>,
  layout: <svg {...svg}><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></svg>,
  typography: <svg {...svg}><path d="M3 18 8 6l5 12" /><path d="M5 14h6" /><path d="M20 18v-5.5a2.5 2.5 0 0 0-4.5-1.5" /><path d="M20 15.5c-1-1-4.5-1-4.5 1s3.5 2 4.5 0" /></svg>,
  content: <svg {...svg}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h4" /></svg>,
  chevron: <svg {...svg} width={20} height={20}><path d="m6 9 6 6 6-6" /></svg>,
  check: <svg {...svg} width={14} height={14} strokeWidth={3}><path d="M20 6 9 17l-5-5" /></svg>,
};
const alignIcon = (align: HeaderAlign) => (
  <svg {...svg} width={16} height={16}>
    <path d="M4 6h16" />
    <path d={align === 'left' ? 'M4 10h10' : align === 'center' ? 'M7 10h10' : 'M10 10h10'} />
    <path d="M4 14h16" />
    <path d={align === 'left' ? 'M4 18h10' : align === 'center' ? 'M7 18h10' : 'M10 18h10'} />
  </svg>
);

/** One folding group: its icon and name, a chevron, and its settings when open. */
function Group({ id, icon, title, open, onToggle, children }: { id: string; icon: ReactNode; title: string; open: boolean; onToggle(): void; children: ReactNode }) {
  return (
    <section className={`dp-group${open ? ' open' : ''}`}>
      <h3>
        <button type="button" aria-expanded={open} aria-controls={`dp-${id}`} onClick={onToggle}>
          <span className="dp-icon">{icon}</span>
          <span className="dp-title">{title}</span>
          <span className="dp-chevron">{ICONS.chevron}</span>
        </button>
      </h3>
      {open && <div className="dp-body" id={`dp-${id}`}>{children}</div>}
    </section>
  );
}

/** A row of choices, one picked: a radio group drawn as buttons. */
function Choices<T extends string>({ label, value, options, onChange, columns }: {
  label: string; value: T; columns?: number;
  options: Array<{ value: T; label: ReactNode; hint?: string; aria?: string }>;
  onChange(next: T): void;
}) {
  const id = useId();
  return (
    <div className="dp-field">
      <p className="dp-label" id={id}>{label}</p>
      <div className="dp-choices" role="radiogroup" aria-labelledby={id} style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}>
        {options.map((option) => (
          <button key={option.value} type="button" role="radio" aria-checked={value === option.value} aria-label={option.aria}
            className={`dp-choice${value === option.value ? ' on' : ''}${option.hint ? ' tall' : ''}`} onClick={() => onChange(option.value)}>
            <span className="dp-choice-main">{option.label}</span>
            {option.hint && <span className="dp-choice-hint">{option.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange(next: boolean): void }) {
  return (
    <label className="dp-toggle">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="dp-switch" aria-hidden="true" />
    </label>
  );
}

/**
 * The full editor's Design tab: template, sections, page layout, type and how dates,
 * places, bullets and skills are written. Every change shows on the CV at once and is
 * saved with it, so its PDF looks the same.
 */
export function DesignPanel({ theme, onChange, order, hidden, labelOf, onOrder, onToggleHidden }: {
  theme: ResumeTheme;
  onChange(next: ResumeTheme): void;
  order: SectionKey[];
  hidden: ReadonlySet<string>;
  labelOf(key: SectionKey): string;
  onOrder(next: SectionKey[]): void;
  onToggleHidden(key: SectionKey): void;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => setOpen((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const set = <K extends keyof ResumeTheme>(key: K, value: ResumeTheme[K]) => onChange({ ...theme, [key]: value });
  const move = (index: number, by: -1 | 1) => {
    const next = [...order];
    [next[index + by], next[index]] = [next[index]!, next[index + by]!];
    onOrder(next);
  };
  const lineHeightId = useId();
  const fontId = useId();
  const sizeId = useId();
  const lineHeight = theme.lineHeight;
  const filled = ((lineHeight - LINE_HEIGHTS.min) / (LINE_HEIGHTS.max - LINE_HEIGHTS.min)) * 100;

  return (
    <div className="design-panel">
      <Group id="template" icon={ICONS.template} title="Template" open={open.has('template')} onToggle={() => toggle('template')}>
        <div className="dp-choices" role="radiogroup" aria-label="Template" style={{ gridTemplateColumns: '1fr' }}>
          <button type="button" role="radio" aria-checked className="dp-choice on dp-template">
            <span className="dp-choice-main">Professional</span>
            <span className="dp-choice-hint">One column, headings over a rule. The only template for now.</span>
            <span className="dp-check">{ICONS.check}</span>
          </button>
        </div>
      </Group>

      <Group id="sections" icon={ICONS.sections} title="Section Order & Display" open={open.has('sections')} onToggle={() => toggle('sections')}>
        <ul className="dp-sections">
          {order.map((key, index) => (
            <li key={key} className={hidden.has(key) ? 'off' : undefined}>
              <label>
                <input type="checkbox" checked={!hidden.has(key)} onChange={() => onToggleHidden(key)} />
                {labelOf(key)}
              </label>
              <span className="dp-move">
                <button type="button" title="Move up" aria-label={`Move ${labelOf(key)} up`} disabled={index === 0} onClick={() => move(index, -1)}><DashboardIcon name="arrowUp" size={14} /></button>
                <button type="button" title="Move down" aria-label={`Move ${labelOf(key)} down`} disabled={index === order.length - 1} onClick={() => move(index, 1)}><DashboardIcon name="arrowDown" size={14} /></button>
              </span>
            </li>
          ))}
        </ul>
      </Group>

      <Group id="layout" icon={ICONS.layout} title="Layout" open={open.has('layout')} onToggle={() => toggle('layout')}>
        <Choices<HeaderAlign> label="Header Alignment" value={theme.headerAlign} onChange={(value) => set('headerAlign', value)} options={[
          { value: 'left', label: <>{alignIcon('left')}Left</> },
          { value: 'center', label: <>{alignIcon('center')}Center</> },
          { value: 'right', label: <>{alignIcon('right')}Right</> },
        ]} />
        <Choices<PageMargins> label="Margins" value={theme.margins} onChange={(value) => set('margins', value)} options={[
          { value: 'narrow', label: 'Narrow' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Wide' },
        ]} />
        <Choices<PageSize> label="Page Size" value={theme.pageSize} onChange={(value) => set('pageSize', value)} options={[
          { value: 'letter', label: 'Letter', hint: '8.5" × 11"' },
          { value: 'a4', label: 'A4', hint: '210 × 297 mm' },
        ]} />
      </Group>

      <Group id="typography" icon={ICONS.typography} title="Typography" open={open.has('typography')} onToggle={() => toggle('typography')}>
        <div className="dp-field">
          <label className="dp-label" htmlFor={fontId}>Font Family</label>
          <select id={fontId} className="dp-select" value={theme.fontFamily} onChange={(event) => set('fontFamily', event.target.value)}>
            {FONTS.map((font) => <option key={font.label} value={font.css}>{font.label}</option>)}
          </select>
        </div>
        <div className="dp-field">
          <label className="dp-label" htmlFor={sizeId}>Font Size</label>
          <select id={sizeId} className="dp-select" value={theme.fontSize} onChange={(event) => set('fontSize', Number(event.target.value))}>
            {FONT_SIZES.map((size) => <option key={size} value={size}>{size} pt</option>)}
          </select>
        </div>
        <div className="dp-field">
          <div className="dp-label-row">
            <label className="dp-label" htmlFor={lineHeightId}>Line Height</label>
            <output className="dp-value" htmlFor={lineHeightId}>{lineHeight.toFixed(lineHeight * 10 % 1 ? 2 : 1)}</output>
          </div>
          <input id={lineHeightId} className="dp-range" type="range" min={LINE_HEIGHTS.min} max={LINE_HEIGHTS.max} step={LINE_HEIGHTS.step}
            value={lineHeight} style={{ '--filled': `${filled}%` } as React.CSSProperties}
            onChange={(event) => set('lineHeight', Math.round(Number(event.target.value) * 100) / 100)} />
          <div className="dp-range-ends" aria-hidden="true"><span>1.0</span><span>2.0</span></div>
        </div>
        <NameSizeControl theme={theme} onChange={onChange} />
        <Toggle label="Full Name Capitalization" checked={theme.nameCaps} onChange={(value) => set('nameCaps', value)} />
      </Group>

      <Group id="content" icon={ICONS.content} title="Content Format" open={open.has('content')} onToggle={() => toggle('content')}>
        <Choices<DateFormat> label="Date Format" value={theme.dateFormat} columns={2} onChange={(value) => set('dateFormat', value)} options={[
          { value: 'short', label: 'Jan 2024' }, { value: 'numeric', label: '01/2024' },
          { value: 'year', label: '2024' }, { value: 'long', label: 'January 2024' },
        ]} />
        <Toggle label="Show experience location above dates" checked={theme.locationAboveDates} onChange={(value) => set('locationAboveDates', value)} />
        <Toggle label="Show country in locations" checked={theme.showCountry} onChange={(value) => set('showCountry', value)} />
        <Choices<BulletIcon> label="Bullet Icon" value={theme.bulletIcon} onChange={(value) => set('bulletIcon', value)} options={[
          { value: 'bullet', label: <><span className="dp-mark" aria-hidden="true">•</span>Bullet</> },
          { value: 'dash', label: <><span className="dp-mark" aria-hidden="true">-</span>Dash</> },
          { value: 'arrow', label: <><span className="dp-mark" aria-hidden="true">»</span>Arrow</> },
        ]} />
        <div className="dp-field">
          <p className="dp-label" id={`${fontId}-skills`}>Skills Layout</p>
          <div className="dp-choices" role="radiogroup" aria-labelledby={`${fontId}-skills`} style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            {([false, true] as const).map((listed) => (
              <button key={String(listed)} type="button" role="radio" aria-checked={theme.skillsListed === listed}
                className={`dp-choice dp-skills${theme.skillsListed === listed ? ' on' : ''}`} onClick={() => set('skillsListed', listed)}>
                <span className="dp-skills-head">{listed ? 'Listed' : 'Not Listed'}{theme.skillsListed === listed && <span className="dp-check">{ICONS.check}</span>}</span>
                <span className={`dp-skills-sample${listed ? ' listed' : ''}`} aria-hidden="true">
                  <span><b>Category:</b> Skill, Skill, Skill</span>
                  <span><b>Category:</b> Skill, Skill, Skill</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <Choices<EducationLayout> label="Education Layout" value={theme.educationLayout} columns={2} onChange={(value) => set('educationLayout', value)} options={[
          { value: 'two-lines', label: 'Two Lines' }, { value: 'one-line', label: 'One Line' },
        ]} />
      </Group>
    </div>
  );
}
