import type { ReactNode } from "react";
import { blocksOf, spansOf, type Span } from "./marks";

/** One span with its styles: bold, italic, underline, link. */
export function SpanView({ span, linkAsText = false }: { span: Span; linkAsText?: boolean }): ReactNode {
  let node: ReactNode = span.text;
  if (span.href && linkAsText) node = <span className="marked-link">{node}</span>;
  else if (span.href)
    node = (
      <a href={span.href} target="_blank" rel="noreferrer noopener">
        {node}
      </a>
    );
  if (span.underline) node = <u>{node}</u>;
  if (span.italic) node = <i>{node}</i>;
  if (span.bold) node = <b>{node}</b>;
  return node;
}

/** A line with its marks, read only. */
export function MarkedLine({ text, linkAsText = false }: { text: string; linkAsText?: boolean }) {
  return (
    <>
      {spansOf(text).map((span, index) => (
        <SpanView key={index} span={span} linkAsText={linkAsText} />
      ))}
    </>
  );
}

/** Text with its marks, read only: paragraphs as lines, "- " lines as a list. */
export function Marked({ text }: { text: string }) {
  return (
    <>
      {blocksOf(text).map((block, index) =>
        block.list ? (
          <ul key={index} className="marked-list">
            {block.lines.map((line, at) => (
              <li key={at}>
                <MarkedLine text={line} />
              </li>
            ))}
          </ul>
        ) : (
          block.lines.map((line, at) => (
            <span key={`${index}:${at}`} className="marked-line">
              <MarkedLine text={line} />
            </span>
          ))
        ),
      )}
    </>
  );
}
