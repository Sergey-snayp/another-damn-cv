import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { coverLetterApi, letterTitle, type ListedCoverLetter } from '../coverLetterApi';
import { DocumentIcon } from '../documents/DocumentIcon';
import { DocumentKindSwitch } from '../documents/DocumentKindSwitch';
import { DocumentPopover } from '../documents/DocumentPopover';
import { LETTER_WIDTH, LetterPage } from '../documents/LetterPage';
import { NewCoverLetterDialog } from '../documents/NewCoverLetterDialog';
import { timeAgo } from './Documents';
import '../documents/documents.css';

/** A letter's first page, scaled to its card. */
function LetterPreview({ row }: { row: ListedCoverLetter }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.28);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => { if (entry) setScale(entry.contentRect.width / LETTER_WIDTH); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="documents-preview letter-preview" ref={frame} aria-hidden="true">
      <div className="letter-preview-paper" style={{ transform: `scale(${scale})` }}>
        <LetterPage text={row.text} author={row.author} />
      </div>
    </div>
  );
}

/** Documents → Cover Letters: one letter per saved job, written from a CV. */
export function CoverLetters() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ListedCoverLetter[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [panel, setPanel] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let active = true;
    coverLetterApi.list().then((list) => { if (active) setRows(list); }, (err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Could not load your cover letters.'); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (rows ?? []).filter((row) => {
      const haystack = `${row.job.company ?? ''} ${row.job.title ?? ''} ${row.text}`.toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  }, [rows, query]);

  async function remove(row: ListedCoverLetter) {
    setPanel(null);
    if (!window.confirm(`Delete the cover letter for ${letterTitle(row.job)}? This cannot be undone.`)) return;
    try {
      await coverLetterApi.remove(row.jobId);
      setRows((current) => current?.filter((item) => item.jobId !== row.jobId) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the letter.');
    }
  }

  return (
    <section className="documents-page" aria-label="Cover letters">
      <h1 className="documents-sr-only">Cover letters</h1>
      <div className="documents-toolbar">
        <label className="documents-search">
          <DocumentIcon name="search" />
          <span className="documents-sr-only">Search cover letters</span>
          <input type="search" placeholder="Search cover letters" value={query} onChange={(event) => setQuery(event.target.value)} />
          {query && (
            <button type="button" className="documents-icon-button" aria-label="Clear search" onClick={() => setQuery('')}>
              <DocumentIcon name="close" size={17} />
            </button>
          )}
        </label>
        <DocumentKindSwitch />
        <button type="button" className="documents-control documents-add-letter" onClick={() => setAdding(true)}>
          <DocumentIcon name="plus" /> Add
        </button>
      </div>

      {error && <div className="documents-error" role="alert">{error}</div>}

      <div className="documents-grid" aria-busy={rows === null && !error}>
        <button type="button" className="documents-new-card" onClick={() => setAdding(true)}>
          <span className="documents-new-page letter-new-page"><DocumentIcon name="plus" size={30} /></span>
          <span className="documents-card-title">New Cover Letter</span>
        </button>
        {rows === null && !error && [0, 1, 2].map((key) => (
          <div className="documents-card documents-loading-card" key={key} aria-hidden="true">
            <div className="documents-preview letter-preview"><div className="documents-preview-skeleton"><span /><span /><span /><span /><span /></div></div>
            <span className="documents-loading-label" />
            <span className="documents-loading-label short" />
          </div>
        ))}
        {visible.map((row) => {
          const title = letterTitle(row.job);
          const to = `/documents/cover-letters/${encodeURIComponent(row.jobId)}`;
          return (
            <article className="documents-card" key={row.jobId}>
              <Link className="documents-preview-link" to={to} aria-label={`Open the cover letter for ${title}`}>
                <LetterPreview row={row} />
              </Link>
              <div className="documents-card-info">
                <Link className="documents-card-title" to={to} title={title}>{title}</Link>
                <DocumentPopover open={panel === row.jobId} onToggle={() => setPanel(panel === row.jobId ? null : row.jobId)}
                  onClose={() => setPanel(null)} label={`More actions for ${title}`} className="documents-card-more"
                  trigger={<DocumentIcon name="more" size={18} />}>
                  <Link className="documents-menu-item" to={to}><DocumentIcon name="file" /><span>Edit letter</span></Link>
                  <a className="documents-menu-item" href={coverLetterApi.pdfUrl(row.jobId)} target="_blank" rel="noreferrer" onClick={() => setPanel(null)}>
                    <DocumentIcon name="arrow" /><span>Open PDF</span>
                  </a>
                  <Link className="documents-menu-item" to={`/jobs/${encodeURIComponent(row.jobId)}`}><DocumentIcon name="history" /><span>Open the job</span></Link>
                  <div className="documents-menu-divider" />
                  <button type="button" className="documents-menu-item documents-danger" onClick={() => void remove(row)}>
                    <DocumentIcon name="trash" /><span>Delete</span>
                  </button>
                </DocumentPopover>
                <p className="documents-card-meta">
                  <time dateTime={row.updatedAt} title={new Date(row.updatedAt).toLocaleString()}>{timeAgo(row.updatedAt)}</time>
                  <span aria-hidden="true">·</span>
                  <span>Cover letter</span>
                </p>
              </div>
            </article>
          );
        })}
      </div>
      {rows?.length === 0 && !query && (
        <p className="letter-empty">No cover letters yet. Write one for a saved job here, or from the extension while you apply.</p>
      )}
      {rows !== null && rows.length > 0 && visible.length === 0 && <p className="letter-empty">No cover letters match “{query}”.</p>}

      {adding && (
        <NewCoverLetterDialog existing={new Set((rows ?? []).map((row) => row.jobId))} onClose={() => setAdding(false)}
          onWritten={(letter) => navigate(`/documents/cover-letters/${encodeURIComponent(letter.jobId)}`, { state: { written: letter } })} />
      )}
    </section>
  );
}
