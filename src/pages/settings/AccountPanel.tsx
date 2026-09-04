import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { getSyncState, subscribeToSync, syncNow, type SyncState } from '../../features/sync/syncEngine';
import {
  getAuthState,
  sendMagicLink,
  signOut,
  subscribeToAuth,
  type AuthState,
} from '../../services/cloud/auth';

/**
 * Accounts, presented as what they are: optional backup, not a gate.
 *
 * Everything in Weave works signed out. Signing in adds a copy of the library
 * that other devices can pick up, and enables Spotify import.
 */
export function AccountPanel() {
  const [auth, setAuth] = useState<AuthState>(getAuthState);
  const [sync, setSync] = useState<SyncState>(getSyncState);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => subscribeToAuth(setAuth), []);
  useEffect(() => subscribeToSync(setSync), []);

  if (auth.status === 'unavailable') {
    return (
      <section className="settings__section">
        <h2 className="u-eyebrow">Your library</h2>
        <p className="u-meta settings__hint">
          This build has no account service configured, so everything stays on
          this device. That is a complete way to use Weave — playlists and
          readings survive reloads and reinstalling to the Home Screen.
        </p>
      </section>
    );
  }

  if (auth.status === 'signed-in') {
    return (
      <section className="settings__section">
        <h2 className="u-eyebrow">Your library</h2>
        <p className="u-meta settings__hint">
          Signed in as {auth.account?.email ?? 'your account'}. Your playlists
          and readings are copied to your account; this device still works
          offline from its own copy.
        </p>
        <p className="u-meta settings__hint">{describeSync(sync)}</p>
        <div className="settings__actions">
          <Button
            variant="quiet"
            size="sm"
            disabled={sync.phase === 'syncing'}
            onClick={() => void syncNow()}
          >
            {sync.phase === 'syncing' ? 'Syncing…' : 'Sync now'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </section>
    );
  }

  const submit = async () => {
    setError(null);
    setSending(true);
    try {
      await sendMagicLink(email);
      setSent(true);
    } catch {
      setError('We could not send that link. Check the address and try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="settings__section">
      <h2 className="u-eyebrow">Your library</h2>
      <p className="u-meta settings__hint">
        Weave keeps everything on this device by default. Add an account to
        carry your playlists to another one, and to import from Spotify.
      </p>

      {sent ? (
        <p className="u-meta settings__hint settings__sent">
          Check {email} for a link. Opening it on this device signs you in.
        </p>
      ) : (
        <>
          <form
            className="settings__form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <input
              className="settings__input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              aria-label="Email address"
              autoComplete="email"
            />
          </form>
          <div className="settings__actions">
            <Button
              variant="quiet"
              size="sm"
              disabled={!email.includes('@') || sending}
              onClick={submit}
            >
              {sending ? 'Sending…' : 'Email me a link'}
            </Button>
          </div>
        </>
      )}

      {error && (
        <p className="u-meta settings__warning" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function describeSync(sync: SyncState): string {
  if (sync.phase === 'syncing') return 'Syncing your library…';
  if (sync.phase === 'error') return sync.message ?? 'Sync did not finish.';
  if (sync.lastSyncedAt) {
    const when = new Date(sync.lastSyncedAt).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `Last synced at ${when}.`;
  }
  return 'Not synced yet on this device.';
}
