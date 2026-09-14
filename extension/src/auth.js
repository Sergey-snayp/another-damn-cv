/**
 * Google sign-in from inside the extension.
 *
 * chrome.identity.launchWebAuthFlow opens Google's consent screen in a managed
 * popup and catches the redirect back to
 * https://<extension-id>.chromiumapp.org/ — a URL Chrome reserves for exactly
 * this and never actually loads.
 *
 * We ask Google for `response_type=id_token`, so the token arrives directly in
 * the URL fragment. No code to exchange, therefore no client secret: the same
 * reason the web app needs none.
 */

const API_URL = 'http://localhost:3001';
const CLIENT_ID = '426705646151-f8k8g9qqi1jjf789c2r8p5hfde6lh47r.apps.googleusercontent.com';

/** Random, echoed back by Google, so a token from another request cannot be replayed. */
function nonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function redirectUri() {
  return chrome.identity.getRedirectURL();
}

function buildAuthUrl(expectedNonce) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'id_token',
    redirect_uri: redirectUri(),
    scope: 'openid email profile',
    nonce: expectedNonce,
    prompt: 'select_account',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function getGoogleIdToken() {
  const expectedNonce = nonce();

  const redirect = await chrome.identity.launchWebAuthFlow({
    url: buildAuthUrl(expectedNonce),
    interactive: true,
  });

  if (!redirect) throw new Error('Sign-in was cancelled.');

  // The token comes back in the fragment, never the query string — fragments
  // are not sent to servers or written to logs.
  const fragment = new URLSearchParams(new URL(redirect).hash.slice(1));

  const idToken = fragment.get('id_token');
  if (!idToken) {
    throw new Error(fragment.get('error') ?? 'Google returned no token.');
  }

  return idToken;
}

/**
 * Signs in and stores the bearer token the backend issues.
 *
 * The ID token is verified on the server, not here: a client checking its own
 * credential proves nothing.
 */
export async function signIn() {
  const idToken = await getGoogleIdToken();

  const response = await fetch(`${API_URL}/api/auth/extension`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: idToken }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Server returned ${response.status}.`);
  }

  const { user, syncToken } = await response.json();
  await chrome.storage.local.set({ auth: { user, syncToken, signedInAt: new Date().toISOString() } });

  return user;
}

export async function signOut() {
  await chrome.storage.local.remove('auth');
}

export async function currentUser() {
  const { auth } = await chrome.storage.local.get('auth');
  return auth?.user ?? null;
}

/** Pulls the profile using the stored bearer token. */
export async function pullProfile() {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.syncToken) throw new Error('Not signed in.');

  const response = await fetch(`${API_URL}/api/profile/sync`, {
    headers: { Authorization: `Bearer ${auth.syncToken}` },
  });

  if (response.status === 401) {
    await signOut();
    throw new Error('Session expired. Sign in again.');
  }
  if (!response.ok) throw new Error(`Server returned ${response.status}.`);

  const incoming = await response.json();

  // Merge: the resume PDF lives only here and must survive a pull.
  const { profile: existing = {} } = await chrome.storage.local.get('profile');
  const profile = { ...existing, ...incoming };

  await chrome.storage.local.set({
    profile,
    sync: { lastSyncedAt: new Date().toISOString(), source: 'extension' },
  });

  return profile;
}
