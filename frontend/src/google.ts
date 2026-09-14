/**
 * Google Identity Services, loaded on demand.
 *
 * Their script is not on npm and must come from Google's own domain, so it is
 * injected once and cached. Loading it lazily keeps it off the critical path
 * for anyone already signed in.
 */

interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleAccounts {
  id: {
    initialize(options: {
      client_id: string;
      callback: (response: GoogleCredentialResponse) => void;
    }): void;
    renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
  };
}

declare global {
  interface Window {
    google?: { accounts: GoogleAccounts };
  }
}

let loader: Promise<GoogleAccounts> | null = null;

export function loadGoogle(): Promise<GoogleAccounts> {
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    if (window.google?.accounts) {
      resolve(window.google.accounts);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      if (window.google?.accounts) resolve(window.google.accounts);
      else reject(new Error('Google script loaded but exposed nothing'));
    };
    script.onerror = () => reject(new Error('Could not load Google Identity Services'));

    document.head.appendChild(script);
  });

  return loader;
}

export async function renderGoogleButton(
  parent: HTMLElement,
  clientId: string,
  onCredential: (credential: string) => void,
): Promise<void> {
  const accounts = await loadGoogle();

  accounts.id.initialize({
    client_id: clientId,
    callback: (response) => onCredential(response.credential),
  });

  accounts.id.renderButton(parent, {
    theme: 'outline',
    size: 'large',
    text: 'continue_with',
    shape: 'pill',
    width: 280,
  });
}
