import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DashboardIcon } from "../jobs/DashboardIcon";
import { EDITOR_CLOSED } from "./RichEditor";
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
      // Gone with its editor: closed, saved or cancelled.
      if (!editor || !editor.isConnected || editor !== editorOf(selection.focusNode) || editor.getAttribute("contenteditable") !== "true") return setPlace(null);
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (!rect.width && !rect.height) return setPlace(null);
      setPlace({
        top: Math.max(8, rect.top - 52),
        left: Math.min(window.innerWidth - 8, Math.max(8, rect.left + rect.width / 2)),
        multiline: editor.hasAttribute("data-multiline"),
      });
    };
    document.addEventListener("selectionchange", update);
    document.addEventListener(EDITOR_CLOSED, update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("selectionchange", update);
      document.removeEventListener(EDITOR_CLOSED, update);
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
      {button("Bold", <DashboardIcon name="bold" size={17} />, () => run("bold"))}
      {button("Italic", <DashboardIcon name="italic" size={17} />, () => run("italic"))}
      {button("Underline", <DashboardIcon name="underline" size={17} />, () => run("underline"))}
      {place.multiline &&
        button(
          "Bulleted list",
          <DashboardIcon name="list" size={17} />,
          () => run("insertUnorderedList"),
        )}
      {button(
        "Link",
        <DashboardIcon name="link" size={17} />,
        link,
      )}
      {button(
        "Clear formatting",
        <DashboardIcon name="clearFormat" size={17} />,
        clear,
      )}
    </div>,
    document.body,
  );
}
