import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface RewriteResult {
  original: string;
  suggestion: string;
  cannotDo: string[];
}

const SUGGESTIONS = [
  'make it stronger and more concrete',
  'shorter, one line',
  'lead with the outcome',
  'use the posting’s vocabulary',
];

/**
 * Asks the model to reword one line.
 *
 * The suggestion is shown beside the original and applied only if accepted —
 * a silent replacement would let an unnoticed change reach a real application.
 */
export function RewritePopover({ resumeId, text, context, kind, onAccept, onClose }: {
  resumeId: string;
  text: string;
  context?: string;
  kind?: string;
  onAccept(next: string): void;
  onClose(): void;
}) {
  const [instruction, setInstruction] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RewriteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function ask(what: string) {
    if (!what.trim()) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/resumes/${resumeId}/rewrite`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, instruction: what, context, kind }),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.message ?? `${response.status}`);
      }

      setResult(await response.json() as RewriteResult);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const unchanged = result && result.suggestion.trim() === result.original.trim();

  // Drawn at the page's top level, so the zoomed CV preview does not shrink it.
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div className="rewrite" ref={boxRef} onClick={(e) => e.stopPropagation()}>
        <div className="rewrite-head">
          <span>Rewrite with AI</span>
          <button className="doc-remove" style={{ opacity: 1 }} onClick={onClose}>×</button>
        </div>

        {!result && (
          <>
            <textarea
              autoFocus
              rows={2}
              value={instruction}
              placeholder="What should change? e.g. shorter, lead with the result…"
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void ask(instruction);
              }}
            />

            <div className="chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} disabled={busy} onClick={() => { setInstruction(s); void ask(s); }}>
                  {s}
                </button>
              ))}
            </div>

            <button className="primary" disabled={busy || !instruction.trim()}
              onClick={() => void ask(instruction)}>
              {busy ? 'Thinking…' : 'Suggest'}
            </button>

            <p className="muted tiny">
              It may reword what is here. It may not add a fact that is not.
            </p>
          </>
        )}

        {result && (
          <>
            <p className="group">Before</p>
            <p className="rewrite-before">{result.original}</p>

            <p className="group">After</p>
            <p className="rewrite-after">{result.suggestion}</p>

            {result.cannotDo.length > 0 && (
              <div className="rewrite-cannot">
                {result.cannotDo.map((line, i) => <p key={i}>⚠ {line}</p>)}
              </div>
            )}

            <div className="row">
              <button className="primary" disabled={Boolean(unchanged)}
                onClick={() => { onAccept(result.suggestion); onClose(); }}>
                {unchanged ? 'Nothing changed' : 'Use this'}
              </button>
              <button className="ghost" onClick={() => { setResult(null); setInstruction(''); }}>
                Try again
              </button>
            </div>
          </>
        )}

        {error && <p className="error small">{error}</p>}
      </div>
    </>,
    document.fullscreenElement ?? document.body,
  );
}
