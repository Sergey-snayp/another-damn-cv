/**
 * Quick tailoring inside a job page, opened there by Another Damn CV.
 *
 * In a job site's page this app is a third-party frame: the browser does not
 * send its session cookie. The extension's page around it hands over a one-time
 * ticket; the app trades it for a short session token and sends that with every
 * API call. A page that frames the app on its own has no ticket and gets nothing.
 *
 * Only the extension's page may talk to this frame: its parent must be a
 * chrome-extension:// page, and every message is checked against it.
 */

const params = new URLSearchParams(window.location.search);
const parentOrigin = window.location.ancestorOrigins?.[0] ?? '';

/** Running inside Another Damn CV's window on a job page. */
export const embedded = params.get('embed') === '1' && window.parent !== window && parentOrigin.startsWith('chrome-extension://');

const originalFetch = window.fetch.bind(window);
let token = '';

/** Tells the extension's page around this frame; nothing when not embedded. */
export function toParent(message: { type: string; [key: string]: unknown }): void {
  if (embedded) window.parent.postMessage(message, parentOrigin);
}

/** Closes the window on the job page. */
export function closeEmbed(): void {
  toParent({ type: 'cv-embed-close' });
}

/** The app's own API calls carry the embed session; any other request is left alone. */
function installFetch(): void {
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return originalFetch(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set('Authorization', `Embed ${token}`);
    return originalFetch(input, { ...init, headers });
  };
}

/** Waits for the extension's ticket and trades it for this frame's session. */
export function startEmbed(): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('The Another Damn CV extension did not answer. Close this and open Quick tailoring again.'));
    }, 20_000);
    async function onMessage(event: MessageEvent) {
      if (event.source !== window.parent || event.origin !== parentOrigin) return;
      const data = event.data as { type?: string; ticket?: unknown; error?: unknown };
      if (data?.type === 'cv-embed-error') {
        window.clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        reject(new Error(typeof data.error === 'string' ? data.error : 'Quick tailoring could not open.'));
        return;
      }
      if (data?.type !== 'cv-embed-ticket' || typeof data.ticket !== 'string') return;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      try {
        const response = await originalFetch('/api/auth/embed-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket: data.ticket }),
        });
        const body = (await response.json().catch(() => null)) as { token?: string; message?: string } | null;
        if (!response.ok || !body?.token) throw new Error(body?.message ?? 'Quick tailoring could not sign in. Open it again from Another Damn CV.');
        token = body.token;
        installFetch();
        resolve();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
    window.addEventListener('message', onMessage);
    toParent({ type: 'cv-embed-ready' });
  });
}

/**
 * A file from the API, saved as a download. A plain link would not carry the
 * embed session, so the file is fetched with it and handed over as a blob.
 */
export async function downloadFromApi(href: string, fallbackName: string): Promise<void> {
  const response = await window.fetch(href);
  if (!response.ok) throw new Error(`The download failed (${response.status}).`);
  const name = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(response.headers.get('Content-Disposition') ?? '')?.[1];
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name ? decodeURIComponent(name) : fallbackName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
