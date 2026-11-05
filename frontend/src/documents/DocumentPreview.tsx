import { useEffect, useRef, useState } from 'react';
import {
  resumeApi,
  type RenderedResume,
  type ResumeSummary,
} from '../resumeApi';
import { ResumeDocument } from '../resume/ResumeDocument';
import { useResumeTheme } from '../resume/useResumeTheme';
import { DocumentIcon } from './DocumentIcon';
import '../resume/document.css';

const documents = new Map<string, Promise<RenderedResume>>();

function readDocument(row: ResumeSummary) {
  const key = `${row.id}:${row.currentSnapshotId}:${row.updatedAt}`;
  let pending = documents.get(key);
  if (!pending) {
    pending = resumeApi.read(row.id).catch((error: unknown) => {
      documents.delete(key);
      throw error;
    });
    documents.set(key, pending);
  }
  return pending;
}

function localDraft(id: string): RenderedResume | null {
  try {
    const stored = sessionStorage.getItem(`resume-draft:${id}`);
    return stored ? (JSON.parse(stored) as RenderedResume) : null;
  } catch {
    return null;
  }
}

/** Uses the editor's actual document and theme; only fetches near the viewport. */
export function DocumentPreview({ row }: { row: ResumeSummary }) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.28);
  const [resume, setResume] = useState<RenderedResume | null>(() =>
    localDraft(row.id),
  );
  const [failed, setFailed] = useState(false);
  const theme = useResumeTheme(row.id);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(entry.contentRect.width / 794);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!row.currentSnapshotId) return;
    const element = frame.current;
    if (!element) return;
    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void readDocument(row)
          .then((document) => {
            if (active) setResume(document);
          })
          .catch(() => {
            if (active) setFailed(true);
          });
      },
      { rootMargin: '200px' },
    );
    observer.observe(element);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [row.id, row.currentSnapshotId, row.updatedAt]);

  return (
    <div className="documents-preview" ref={frame} aria-hidden="true">
      {resume ? (
        <div
          className="documents-preview-paper"
          style={{ transform: `scale(${scale})` }}
          ref={(element) => {
            if (element) element.inert = true;
          }}
        >
          <ResumeDocument
            resume={resume}
            theme={theme}
            readOnly
            onChange={() => {}}
          />
        </div>
      ) : !row.currentSnapshotId || failed ? (
        <div className="documents-preview-empty">
          <DocumentIcon name="file" size={30} />
          <span>{failed ? 'Preview unavailable' : 'Start writing'}</span>
        </div>
      ) : (
        <div className="documents-preview-skeleton">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
  );
}
