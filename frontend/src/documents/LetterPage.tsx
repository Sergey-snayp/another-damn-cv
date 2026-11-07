import type { ReactNode } from 'react';
import type { LetterAuthor } from '../coverLetterApi';

/** A US Letter page at 96 dpi, as the server prints it. */
export const LETTER_WIDTH = 816;
export const LETTER_HEIGHT = 1056;

/** The letter's paragraphs: blank lines split them. */
export function paragraphsOf(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

/**
 * The letter as its PDF prints (the server's coverLetterHtml): the name
 * centered in bold, one contact line, then the paragraphs in a serif face.
 * `children` replaces the paragraphs, for the editor's own text area.
 */
export function LetterPage({ text, author, children }: { text: string; author: LetterAuthor | null; children?: ReactNode }) {
  const name = [author?.firstName, author?.lastName].filter(Boolean).join(' ');
  const contact = [author?.phone, author?.email, author?.linkedin].map((part) => part?.trim()).filter(Boolean);
  return (
    <div className="letter-page">
      {(name || contact.length > 0) && (
        <header className="letter-head">
          {name && <h1>{name}</h1>}
          {contact.length > 0 && <p>{contact.join(' | ')}</p>}
        </header>
      )}
      {children ?? paragraphsOf(text).map((paragraph, index) => (
        <p key={index}>
          {paragraph.split('\n').map((line, at) => (
            <span key={at}>{at > 0 && <br />}{line}</span>
          ))}
        </p>
      ))}
    </div>
  );
}
