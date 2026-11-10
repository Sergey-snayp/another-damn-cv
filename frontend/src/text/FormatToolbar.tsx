import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./rich-text.css";

/** Where the toolbar sits: above the selected text. */
interface Place {
  top: number;
  left: number;
  multiline: boolean;
}

const editorOf = (node: Node | null): HTMLElement | null =>
  (node instanceof HTMLElement ? node : node?.parentElement)?.closest<HTMLElement>("[data-rich-editor], .pro-edit") ?? null;

/**
 * The format toolbar: shown over text selected in any rich text box (a Profile
 * editor or a line of a CV), with Bold, Italic, Underline, List, Link and Clear.
 * Mounted once for the whole app.
 */
export function FormatToolbar() {
  const [place, setPlace] = useState<Place | null>(null);

  useEffect(() => {
    const update = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) return setPlace(null);
      const editor = editorOf(selection.anchorNode);
      if (!editor || editor !== editorOf(selection.focusNode) || editor.getAttribute("contenteditable") !== "true") return setPlace(null);
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (!rect.width && !rect.height) return setPlace(null);
      setPlace({
        top: Math.max(8, rect.top - 52),
        left: Math.min(window.innerWidth - 8, Math.max(8, rect.left + rect.width / 2)),
        multiline: editor.hasAttribute("data-multiline"),
      });
    };
    document.addEventListener("selectionchange", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("selectionchange", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (!place) return null;
  const run = (command: string, value?: string) => {
    document.execCommand("styleWithCSS", false, "false");
    document.execCommand(command, false, value);
  };
  const link = () => {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    const url = window.prompt("Link address", "https://")?.trim();
    if (!url || url === "https://" || !range) return;
    const href = /^(https?:|mailto:)/i.test(url) ? url : url.includes("@") ? `mailto:${url}` : `https://${url}`;
    selection?.removeAllRanges();
    selection?.addRange(range);
    run("createLink", href);
  };
  const clear = () => {
    run("removeFormat");
    run("unlink");
  };
  const button = (label: string, icon: React.ReactNode, action: () => void, extra = "") => (
    <button
      type="button"
      className={`format-tool${extra}`}
      aria-label={label}
      title={label}
      // The selection stays: the button never takes focus.
      onMouseDown={(event) => {
        event.preventDefault();
        action();
      }}
    >
      {icon}
    </button>
  );
  return createPortal(
    <div className="format-toolbar" role="toolbar" aria-label="Format text" style={{ top: place.top, left: place.left }}>
      {button("Bold", <b>B</b>, () => run("bold"))}
      {button("Italic", <i className="format-italic">I</i>, () => run("italic"))}
      {button("Underline", <u>U</u>, () => run("underline"))}
      {place.multiline &&
        button(
          "Bulleted list",
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
          </svg>,
          () => run("insertUnorderedList"),
        )}
      {button(
        "Link",
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="m10 14 4-4m-6.5 3.5-2 2a3.5 3.5 0 0 0 5 5l2-2m3-7 2-2a3.5 3.5 0 0 0-5-5l-2 2" />
        </svg>,
        link,
      )}
      {button(
        "Clear formatting",
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M5 5h12M11 5 8 19m6-4 5 5m0-5-5 5" />
        </svg>,
        clear,
      )}
    </div>,
    document.body,
  );
}
