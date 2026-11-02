import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export function DocumentPopover({
  open,
  onToggle,
  onClose,
  label,
  trigger,
  children,
  className = '',
}: {
  open: boolean;
  onToggle(): void;
  onClose(): void;
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ shift: 0, above: false });
  const id = useId();

  useLayoutEffect(() => {
    if (!open || !popup.current || !button.current) return;
    function place() {
      if (!popup.current || !button.current) return;
      const box = popup.current.getBoundingClientRect();
      const anchor = button.current.getBoundingClientRect();
      const left = box.left - position.shift;
      const right = box.right - position.shift;
      const shift =
        left < 16
          ? 16 - left
          : right > window.innerWidth - 16
            ? window.innerWidth - 16 - right
            : 0;
      const above =
        anchor.bottom + 8 + box.height > window.innerHeight - 16 &&
        anchor.top > box.height + 24;
      setPosition((current) =>
        current.shift === shift && current.above === above
          ? current
          : { shift, above },
      );
    }
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      )
        onClose();
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        button.current?.focus();
      }
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', escape);
    };
  }, [open, onClose]);

  return (
    <div
      className={`documents-popover-anchor ${className}`}
      ref={container}
      onBlur={(event) => {
        if (
          open &&
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          onClose();
      }}
    >
      <button
        type="button"
        ref={button}
        className={`documents-control${open ? ' is-open' : ''}`}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={onToggle}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={popup}
          id={id}
          className={`documents-popover${position.above ? ' is-above' : ''}`}
          style={{ transform: `translateX(${position.shift}px)` }}
          role="group"
          aria-label={label}
        >
          {children}
        </div>
      )}
    </div>
  );
}
