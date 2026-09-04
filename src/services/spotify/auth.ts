import { readSetting, writeSetting } from '../../db/repositories';

/**
 * Spotify sign-in via Authorization Code with PKCE.
 *
 * Measured against a real playlist, a client-credentials token cannot read
 * playlist contents at all: `/playlists/{id}/tracks` returns 403, and the
 * playlist object comes back with its `tracks` key stripped entirely. A user
 * token is not subject to that, so the connection has to be the listener's own.
 *
 * PKCE needs no client secret, so this runs entirely in the browser and there
 * is no server in the path. The client id is public by design.
 *
 * Tokens live in IndexedDB on this device only. They are never synced: a
 * refresh token is a credential, and copying it between devices through the
 * account would widen its blast radius for no benefit.
 */

const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

/** Public playlists need no scope; these let you import your own private ones. */
const SCOPES = ['playlist-read-private', 'playlist-read-collaborative'];

const TOKEN_KEY = 'spotify.tokens';
const VERIFIER_KEY = 'weave.spotify.verifier';
const STATE_KEY = 'weave.spotify.state';

/**
 * A dedicated path, not the app root. Supabase magic links also come back with
 * a `code` parameter, and having two flows read the same query string is a
 * confusion waiting to happen.
 */
export const SPOTIFY_CALLBACK_PATH = '/spotify-callback';

interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  /** Epoch ms. */
  expiresAt: number;
}

const listeners = new Set<(connected: boolean) => void>();
let connected: boolean | null = null;

export function getSpotifyClientId(): string | undefined {
  const value = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
  return value && value.trim() ? value.trim() : undefined;
}

export function isSpotifyConfigured(): boolean {
  return Boolean(getSpotifyClientId());
}

export function redirectUri(): string {
  return `${window.location.origin}${SPOTIFY_CALLBACK_PATH}`;
}

export function subscribeToSpotifyAuth(
  listener: (connected: boolean) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: boolean): void {
  connected = next;
  for (const listener of listeners) listener(next);
}

export async function isSpotifyConnected(): Promise<boolean> {
  if (connected !== null) return connected;
  const tokens = await readSetting<StoredTokens | null>(TOKEN_KEY, null);
  const value = Boolean(tokens?.refreshToken || (tokens && tokens.expiresAt > Date.now()));
  connected = value;
  return value;
}

/* ------------------------------ PKCE bits -------------------------------- */

function randomString(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function base64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return base64Url(digest);
}

/* -------------------------------- flow ----------------------------------- */

export class SpotifyAuthError extends Error {}

/** Sends the browser to Spotify. Returns only if it cannot start. */
export async function connectSpotify(): Promise<void> {
  const clientId = getSpotifyClientId();
  if (!clientId) throw new SpotifyAuthError('Spotify is not configured for this build.');

  const verifier = randomString(96);
  const state = randomString(24);
  // sessionStorage, not IndexedDB: this is single-use, tab-scoped, and must
  // survive exactly one redirect.
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', await challengeFor(verifier));
  url.searchParams.set('state', state);
  url.searchParams.set('scope', SCOPES.join(' '));

  window.location.assign(url.toString());
}

/** Exchanges the callback code for tokens. Runs on the callback route. */
export async function completeSpotifyAuth(search: string): Promise<void> {
  const params = new URLSearchParams(search);
  const error = params.get('error');
  if (error) throw new SpotifyAuthError(describeAuthError(error));

  const code = params.get('code');
  const state = params.get('state');
  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);

  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);

  if (!code || !verifier) {
    throw new SpotifyAuthError('That sign-in did not complete. Try connecting again.');
  }
  // Guards against a callback that did not originate from this tab's request.
  if (!state || state !== expectedState) {
    throw new SpotifyAuthError('That sign-in could not be verified. Try again.');
  }

  const clientId = getSpotifyClientId();
  if (!clientId) throw new SpotifyAuthError('Spotify is not configured for this build.');

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      client_id: clientId,
      code_verifier: verifier,
    }),
  });

  if (!response.ok) {
    throw new SpotifyAuthError('Spotify would not complete that sign-in.');
  }

  await store(await response.json());
}

async function store(payload: {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}): Promise<void> {
  const existing = await readSetting<StoredTokens | null>(TOKEN_KEY, null);
  await writeSetting(TOKEN_KEY, {
    accessToken: payload.access_token,
    // A refresh response does not always return a new refresh token.
    refreshToken: payload.refresh_token ?? existing?.refreshToken,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  } satisfies StoredTokens);
  publish(true);
}

/**
 * A valid access token, refreshed if needed. Null when not connected, which
 * callers treat as "ask the user to connect" rather than as an error.
 */
export async function getSpotifyToken(): Promise<string | null> {
  const tokens = await readSetting<StoredTokens | null>(TOKEN_KEY, null);
  if (!tokens) {
    publish(false);
    return null;
  }

  // A minute of headroom, so a token cannot expire mid-request.
  if (tokens.expiresAt > Date.now() + 60_000) return tokens.accessToken;

  const clientId = getSpotifyClientId();
  if (!tokens.refreshToken || !clientId) {
    await disconnectSpotify();
    return null;
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: clientId,
    }),
  });

  if (!response.ok) {
    // A revoked or expired refresh token is a disconnect, not a failure.
    await disconnectSpotify();
    return null;
  }

  const payload = await response.json();
  await store(payload);
  return payload.access_token as string;
}

export async function disconnectSpotify(): Promise<void> {
  await writeSetting(TOKEN_KEY, null);
  publish(false);
}

function describeAuthError(code: string): string {
  if (code === 'access_denied') return 'You cancelled connecting Spotify.';
  return 'Spotify refused that sign-in.';
}
