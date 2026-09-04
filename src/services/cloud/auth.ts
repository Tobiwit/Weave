import { getCloudClient, isCloudConfigured } from './client';

export interface CloudAccount {
  id: string;
  email?: string;
}

export type AuthStatus = 'unavailable' | 'signed-out' | 'signed-in';

export interface AuthState {
  status: AuthStatus;
  account: CloudAccount | null;
}

const listeners = new Set<(state: AuthState) => void>();
let current: AuthState = {
  status: isCloudConfigured() ? 'signed-out' : 'unavailable',
  account: null,
};
let watching = false;

export function getAuthState(): AuthState {
  return current;
}

function publish(next: AuthState): void {
  current = next;
  for (const listener of listeners) listener(current);
}

/**
 * Starts watching the session.
 *
 * Safe to call when the cloud is not configured: it resolves to an
 * `unavailable` state and never touches the network.
 */
export async function startAuthWatch(): Promise<AuthState> {
  if (!isCloudConfigured()) return current;

  const client = await getCloudClient();
  if (!client) return current;

  const { data } = await client.auth.getSession();
  publish(toState(data.session?.user ?? null));

  if (!watching) {
    watching = true;
    client.auth.onAuthStateChange((_event, session) => {
      publish(toState(session?.user ?? null));
    });
  }

  return current;
}

export function subscribeToAuth(listener: (state: AuthState) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function toState(user: { id: string; email?: string } | null): AuthState {
  if (!user) return { status: 'signed-out', account: null };
  return { status: 'signed-in', account: { id: user.id, email: user.email } };
}

export class CloudUnavailableError extends Error {
  constructor() {
    super('Accounts are not configured for this build');
    this.name = 'CloudUnavailableError';
  }
}

/** Sends a magic link. There is no password to store, lose or reset. */
export async function sendMagicLink(email: string): Promise<void> {
  const client = await getCloudClient();
  if (!client) throw new CloudUnavailableError();

  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    options: {
      // Land back where the user started, so an installed PWA reopens itself.
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  const client = await getCloudClient();
  if (!client) return;
  await client.auth.signOut();
  publish({ status: 'signed-out', account: null });
}
