import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { htmlToMarks, marksToHtml } from "./marks";
import "./rich-text.css";

/**
 * A text box that shows its formatting: select text and the format toolbar
 * appears (bold, italic, underline, link, clear; a list where lines are allowed).
 * Its value is plain text with marks, as every field stores it.
 */
export function RichEditor({
  value,
  onChange,
  label,
  placeholder,
  multiline = false,
  autoFocus = false,
  className = "",
  onKeyDown,
}: {
  value: string;
  onChange(next: string): void;
  label: string;
  placeholder?: string;
  /** Several lines (and lists) allowed; otherwise one paragraph. */
  multiline?: boolean;
  autoFocus?: boolean;
  className?: string;
  onKeyDown?(event: KeyboardEvent<HTMLDivElement>): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  /** The last value this box sent out: a new value from outside is drawn again. */
  const sent = useRef<string | null>(null);

  useLayoutEffect(() => {
    const element = box.current;
    if (!element || value === sent.current) return;
    element.innerHTML = value ? marksToHtml(value) : "";
    sent.current = value;
  }, [value]);

  useEffect(() => {
    const element = box.current;
    if (!autoFocus || !element) return;
    element.focus();
    // The caret at the end, ready to type.
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [autoFocus]);

  return (
    <div
      ref={box}
      className={`rich-editor${className ? ` ${className}` : ""}`}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-multiline={multiline}
      aria-label={label}
      data-placeholder={placeholder}
      data-rich-editor=""
      data-multiline={multiline ? "" : undefined}
      spellCheck
      onInput={(event) => {
        const next = htmlToMarks(event.currentTarget);
        sent.current = next;
        if (!event.currentTarget.textContent?.trim()) event.currentTarget.innerHTML = "";
        onChange(next);
      }}
      onPaste={(event) => {
        // Plain text only: formatting is set with the toolbar, so it prints as it looks.
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, multiline ? text : text.replace(/\s*\n\s*/g, " "));
      }}
      onKeyDown={(event) => {
        if (!multiline && event.key === "Enter" && event.shiftKey) event.preventDefault();
        onKeyDown?.(event);
      }}
    />
  );
}
