/**
 * Talking to the browser extension.
 *
 * Push, not poll. The extension cannot usefully poll the API — its service
 * worker runs on a chrome-extension:// origin that the SameSite session cookie
 * will not reach, so it would need a credential. But this page is already
 * authenticated, and the extension injects a content script here, so the moment
 * anything changes we can simply hand it over.
 *
 * The result is that a save in the web app lands in the extension immediately,
 * with no token, no polling interval and nothing to press.
 */

const PROFILE = 'CV_PLATFORM_PROFILE';
const ACK = 'CV_PLATFORM_PROFILE_ACK';
const READY = 'CV_PLATFORM_EXTENSION_READY';
const PING = 'CV_PLATFORM_PING';

let installed = false;

const listeners = new Set<(installed: boolean) => void>();

window.addEventListener('message', (event: MessageEvent) => {
  if (event.source !== window) return;

  const data = event.data as { type?: string };
  if (data?.type === READY && !installed) {
    installed = true;
    listeners.forEach((listener) => listener(true));
  }
});

/**
 * Announcements are easy to miss: the content script may run before React has
 * attached its listener, or after. So rather than relying on hearing the
 * extension speak, we ask — a few times, briefly, until it answers.
 */
function ping(): void {
  window.postMessage({ type: PING }, window.location.origin);
}

export function onExtensionDetected(listener: (installed: boolean) => void): () => void {
  listeners.add(listener);
  listener(installed);

  if (!installed) {
    let attempts = 0;
    const timer = setInterval(() => {
      if (installed || attempts++ > 10) {
        clearInterval(timer);
        return;
      }
      ping();
    }, 250);
    ping();
  }

  return () => listeners.delete(listener);
}

export function isExtensionInstalled(): boolean {
  return installed;
}

/**
 * Sends the profile and waits for the bridge to confirm it stored it.
 *
 * Resolves false rather than throwing when no extension is listening — this is
 * called after every save, and a missing extension is normal, not an error.
 */
export function pushProfile(profile: unknown, timeoutMs = 1500): Promise<boolean> {
  if (!installed) return Promise.resolve(false);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      window.removeEventListener('message', onAck);
      resolve(false);
    }, timeoutMs);

    function onAck(event: MessageEvent) {
      if (event.source !== window) return;

      const data = event.data as { type?: string; ok?: boolean };
      if (data?.type !== ACK) return;

      clearTimeout(timer);
      window.removeEventListener('message', onAck);
      resolve(Boolean(data.ok));
    }

    window.addEventListener('message', onAck);
    window.postMessage({ type: PROFILE, profile }, window.location.origin);
  });
}
