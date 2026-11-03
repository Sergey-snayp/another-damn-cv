import { useEffect, useState } from "react";
import {
  resumeApi,
  type RenderedResume,
  type ResumeSummary,
} from "../resumeApi";

/** Profile currently reads career history from the primary CV. It does not copy or edit it. */
export function usePrimaryResume() {
  const [primary, setPrimary] = useState<ResumeSummary | null>(null);
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [document, setDocument] = useState<RenderedResume | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setPrimary(null);
    setDocument(null);
    void (async () => {
      const rows = await resumeApi.list();
      const row = rows.find((item) => item.isPrimary) ?? null;
      if (!active) return;
      setResumes(rows);
      setPrimary(row);
      if (row?.currentSnapshotId) {
        const cv = await resumeApi.read(row.id);
        if (active) setDocument(cv);
      }
    })()
      .catch((err: unknown) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "Could not load your primary CV.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  return {
    primary,
    /** Every CV, for Profile's Change list. */
    resumes,
    document,
    loading,
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}
