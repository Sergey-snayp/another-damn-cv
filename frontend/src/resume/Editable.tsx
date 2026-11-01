import { useEffect, useRef } from 'react';

/**
 * A field that looks like document text until you click it.
 *
 * A styled input rather than contentEditable: contentEditable fights React over
 * the DOM, mangles paste, and loses the caret on re-render. An input that
 * inherits the surrounding typography gives the same feel with none of that.
 */
export function Editable({ value, onChange, placeholder, className, multiline }: {
  value: string;
  onChange(next: string): void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Textareas do not grow on their own; keep the height at the content.
  useEffect(() => {
    const el = ref.current;
    if (!el || !multiline) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, multiline]);

  if (multiline) {
    return (
      <textarea
        ref={ref}
        className={`editable ${className ?? ''}`}
        rows={1}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <input
      className={`editable ${className ?? ''}`}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      size={Math.max(value.length || placeholder?.length || 8, 4)}
    />
  );
}
