import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import './ui.css';

export interface PopoverProps {
  open: boolean;
  onToggle(): void;
  onClose(): void;
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
  anchorClassName?: string;
  triggerClassName?: string;
  panelClassName?: string;
  portal?: boolean;
}

export function Popover({
  open,
  onToggle,
  onClose,
  label,
  trigger,
  children,
  className = '',
  anchorClassName = '',
  triggerClassName = '',
  panelClassName = '',
  portal = false,
}: PopoverProps) {
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({
    shift: 0,
    above: false,
    left: 0,
    top: 0,
  });
  const id = useId();
  useLayoutEffect(() => {
    if (!open || !popup.current || !button.current) return;
    function place() {
      if (!popup.current || !button.current) return;
      const box = popup.current.getBoundingClientRect();
      const anchor = button.current.getBoundingClientRect();
      const above =
        anchor.bottom + 8 + box.height > window.innerHeight - 16 &&
        anchor.top > box.height + 24;
      const baseLeft = box.left - position.shift,
        right = box.right - position.shift;
      const shift = portal
        ? 0
        : Math.round(
            baseLeft < 16
              ? 16 - baseLeft
              : right > window.innerWidth - 16
                ? window.innerWidth - 16 - right
                : 0,
          );
      const left = portal
        ? Math.max(
            16,
            Math.min(
              anchor.right - box.width,
              window.innerWidth - box.width - 16,
            ),
          )
        : 0;
      const top = portal
        ? above
          ? anchor.top - box.height - 8
          : anchor.bottom + 8
        : 0;
      setPosition((current) =>
        current.shift === shift &&
        current.above === above &&
        current.left === left &&
        current.top === top
          ? current
          : { shift, above, left, top },
      );
    }
    place();
    window.addEventListener('resize', place);
    if (portal) window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, position, portal]);
  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target) &&
        !popup.current?.contains(event.target)
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
  const panel = (
    <div
      id={id}
      ref={popup}
      role="group"
      aria-label={label}
      className={`ui-popover-panel ${panelClassName}${position.above ? ' is-above' : ''}`}
      style={
        portal
          ? {
              position: 'fixed',
              top: position.top,
              left: position.left,
              right: 'auto',
              bottom: 'auto',
              zIndex: 80,
            }
          : { transform: `translateX(${position.shift}px)` }
      }
    >
      {children}
    </div>
  );
  return (
    <div
      className={`ui-popover-anchor ${anchorClassName} ${className}`}
      ref={container}
      onBlur={(event) => {
        if (
          open &&
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget) &&
          !popup.current?.contains(event.relatedTarget)
        )
          onClose();
      }}
    >
      <button
        type="button"
        ref={button}
        className={`${triggerClassName}${open ? ' is-open' : ''}`}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={onToggle}
      >
        {trigger}
      </button>
      {open && (portal ? createPortal(panel, document.body) : panel)}
    </div>
  );
}
