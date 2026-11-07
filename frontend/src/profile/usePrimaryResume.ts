import { useEffect, useState } from "react";
import { resumeApi, type ResumeSummary } from "../resumeApi";

/** The Profile CV picker only reads document metadata; career details live in Profile. */
export function usePrimaryResume() {
  const [primary, setPrimary] = useState<ResumeSummary | null>(null);
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setPrimary(null);
    void (async () => {
      const rows = await resumeApi.list();
      const row = rows.find((item) => item.isPrimary) ?? null;
      if (!active) return;
      setResumes(rows);
      setPrimary(row);
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
    loading,
    error,
    retry: () => setAttempt((value) => value + 1),
  };
}
