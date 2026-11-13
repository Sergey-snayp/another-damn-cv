import { useEffect, useId, useState } from 'react';
import { DEFAULT_THEME, NAME_SIZES, type ResumeTheme } from '../theme';
import { DashboardIcon } from '../../jobs/DashboardIcon';

const DEFAULT_SIZE = DEFAULT_THEME.nameSize ?? 30;
const clamp = (value: number) => Math.min(NAME_SIZES.max, Math.max(NAME_SIZES.min, Math.round(value)));

/**
 * Makes the name at the top of the CV bigger or smaller; saved with the CV, so
 * its PDF follows. A stepper as in document editors: every part keeps its place
 * and width whatever the value (Reset is always there, disabled at the
 * default), so nothing around it moves. The number can be typed, or changed
 * with the arrow keys; the CV updates as it changes.
 */
export function NameSizeControl({ theme, onChange }: { theme: ResumeTheme; onChange(next: ResumeTheme): void }) {
  const size = theme.nameSize ?? DEFAULT_SIZE;
  const [typed, setTyped] = useState(String(size));
  const id = useId();
  useEffect(() => setTyped(String(size)), [size]);

  const set = (next: number) => {
    const value = clamp(next);
    if (value !== size) onChange({ ...theme, nameSize: value });
    setTyped(String(value));
  };

  return (
    <div className="name-size" role="group" aria-labelledby={`${id}-label`}>
      <label className="name-size-label" id={`${id}-label`} htmlFor={`${id}-value`}>Name size</label>
      <div className="name-size-row">
        <div className="name-size-stepper">
          <button type="button" aria-label="Smaller name" title="Smaller name" disabled={size <= NAME_SIZES.min} onClick={() => set(size - NAME_SIZES.step)}><DashboardIcon name="minus" size={14} /></button>
          <input
            id={`${id}-value`}
            inputMode="numeric"
            value={typed}
            aria-valuemin={NAME_SIZES.min}
            aria-valuemax={NAME_SIZES.max}
            onChange={(e) => {
              setTyped(e.target.value.replace(/\D/g, '').slice(0, 2));
              const value = Number(e.target.value);
              if (value >= NAME_SIZES.min && value <= NAME_SIZES.max) set(value);
            }}
            onBlur={() => set(Number(typed) || size)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') { e.preventDefault(); set(size + (e.shiftKey ? 4 : 1)); }
              if (e.key === 'ArrowDown') { e.preventDefault(); set(size - (e.shiftKey ? 4 : 1)); }
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          <span className="name-size-unit" aria-hidden>pt</span>
          <button type="button" aria-label="Bigger name" title="Bigger name" disabled={size >= NAME_SIZES.max} onClick={() => set(size + NAME_SIZES.step)}><DashboardIcon name="plus" size={14} /></button>
        </div>
        <input
          className="name-size-slider"
          type="range"
          min={NAME_SIZES.min}
          max={NAME_SIZES.max}
          step={NAME_SIZES.step}
          value={size}
          aria-label="Name size"
          onChange={(e) => set(Number(e.target.value))}
        />
        <button type="button" className="name-size-reset" disabled={size === DEFAULT_SIZE} title={`Back to ${DEFAULT_SIZE}pt`} onClick={() => set(DEFAULT_SIZE)}>
          Reset
        </button>
      </div>
    </div>
  );
}
