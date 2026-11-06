import { useEffect, useRef, useState } from 'react';
import { DEFAULT_THEME, designOf, type ResumeTheme } from './theme';
import { notifyResumesChanged } from '../extensionBridge';

/**
 * A CV's design, kept on the server with the CV: the server makes the CV's PDF
 * with it (the extension uploads that PDF). A design saved only in this
 * browser before is moved to the server once.
 */
async function loadTheme(id: string): Promise<ResumeTheme> {
  const response = await fetch(`/api/resumes/${encodeURIComponent(id)}/theme`, { credentials: 'include' });
  const server = response.ok ? ((await response.json()) as { theme: Partial<ResumeTheme> | null }).theme : null;
  if (server) return designOf(server);
  let local: Partial<ResumeTheme> | null = null;
  try {
    const stored = localStorage.getItem(`resume-theme:${id}`);
    local = stored ? (JSON.parse(stored) as Partial<ResumeTheme>) : null;
  } catch {
    local = null;
  }
  if (!local) return DEFAULT_THEME;
  const theme = designOf(local);
  await saveTheme(id, theme).catch(() => undefined);
  return theme;
}

function saveTheme(id: string, theme: ResumeTheme) {
  return fetch(`/api/resumes/${encodeURIComponent(id)}/theme`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(theme),
  }).then((response) => {
    if (!response.ok) throw new Error(`${response.status}`);
    // The CV's PDF changes with its design.
    notifyResumesChanged(id);
    try {
      localStorage.removeItem(`resume-theme:${id}`);
    } catch {
      /* nothing to clean */
    }
  });
}

/** The design for showing a CV (read only). */
export function useResumeTheme(id: string | undefined): ResumeTheme {
  const [theme, setTheme] = useState<ResumeTheme>(DEFAULT_THEME);
  useEffect(() => {
    if (!id) return;
    let active = true;
    void loadTheme(id).then((loaded) => active && setTheme(loaded), () => undefined);
    return () => {
      active = false;
    };
  }, [id]);
  return theme;
}

/** The editor's design: changes are saved to the server a moment after the last one. */
export function useEditableResumeTheme(id: string): [ResumeTheme, (theme: ResumeTheme) => void, () => Promise<void>] {
  const [theme, setTheme] = useState<ResumeTheme>(DEFAULT_THEME);
  const loaded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    let active = true;
    loaded.current = false;
    void loadTheme(id).then(
      (next) => {
        if (!active) return;
        setTheme(next);
        loaded.current = true;
      },
      () => {
        loaded.current = true;
      },
    );
    return () => {
      active = false;
      clearTimeout(timer.current);
    };
  }, [id]);
  const change = (next: ResumeTheme) => {
    setTheme(next);
    if (!loaded.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveTheme(id, next).catch(() => undefined), 600);
  };
  const flush = async () => {
    clearTimeout(timer.current);
    await saveTheme(id, theme);
  };
  return [theme, change, flush];
}
