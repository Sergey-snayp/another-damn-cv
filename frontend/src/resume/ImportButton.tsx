import { useEffect, useRef, useState } from 'react';
import { importCv, draftFromImport, type ImportProposal } from './fromImport';
import type { RenderedResume } from '../resumeApi';

const STAGES = [
  'Reading the file…',
  'Pulling out the text…',
  'Working out the structure…',
  'Separating the roles…',
  'Almost there…',
];

/**
 * Parsing takes over a minute, which is long enough that a spinner alone reads
 * as a hang. Naming the stage is honest and makes the wait legible.
 */
export function ImportButton({ label, onDraft }: {
  label: string;
  onDraft(draft: RenderedResume, proposal: ImportProposal): void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) return;

    setStage(0);
    const timer = setInterval(() => {
      setStage((current) => Math.min(current + 1, STAGES.length - 1));
    }, 15_000);

    return () => clearInterval(timer);
  }, [busy]);

  async function handle(file: File) {
    setBusy(true);
    setError(null);

    try {
      const proposal = await importCv(file);
      onDraft(draftFromImport(proposal), proposal);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.txt,.md"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handle(file);
          e.target.value = '';
        }}
      />

      <button className="ghost" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? STAGES[stage] : label}
      </button>

      {busy && <p className="muted tiny">This takes about a minute. Nothing is saved yet.</p>}
      {error && <p className="error small">{error}</p>}
    </>
  );
}
