import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { renderGoogleButton } from './google';
import { useAuth } from './AuthContext';

export function Login() {
  const { signIn } = useAuth();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function mount() {
      try {
        const { googleClientId, configured } = await api.authConfig();

        if (!configured) {
          setError('The server has no GOOGLE_CLIENT_ID configured.');
          return;
        }

        if (cancelled || !buttonRef.current) return;

        await renderGoogleButton(buttonRef.current, googleClientId, (credential) => {
          signIn(credential).catch((err: Error) => setError(err.message));
        });
      } catch (err) {
        setError((err as Error).message);
      }
    }

    void mount();
    return () => { cancelled = true; };
  }, [signIn]);

  return (
    <div className="login">
      <h1>CV Platform</h1>
      <p className="muted">
        An evidence-backed job application system. Every claim traces to a
        repository, a commit or a migration.
      </p>

      <div ref={buttonRef} className="google-button" />

      {error && <p className="error">{error}</p>}

      <p className="fine">
        We ask Google only who you are. Nothing is posted on your behalf.
      </p>
    </div>
  );
}
