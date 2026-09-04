/**
 * Reads a public Spotify playlist and returns track identities.
 *
 * This exists because Spotify has no anonymous read: every Web API endpoint,
 * including a public playlist, returns 401 without a token. The client
 * credentials grant needs the app secret, which can never live in a browser
 * bundle, so it lives here instead. The caller pastes a link and never sees a
 * Spotify login.
 *
 * Scope is deliberately narrow: track identity only — title, artist, album,
 * year, cover. Weave then runs its own analysis over those songs using its own
 * sources. Nothing from Spotify is fed into the embedding pipeline, which
 * keeps the reading independent and stays on the right side of Spotify's terms
 * on derived data and model training.
 *
 * Deploy: supabase functions deploy spotify-playlist
 * Secrets: supabase secrets set SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=...
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PAGE_SIZE = 100;
/** Stops a hostile or enormous link from running up a long import. */
const MAX_TRACKS = 500;

interface TokenCache {
  token: string;
  expiresAt: number;
}

let cachedToken: TokenCache | null = null;

async function getAppToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const id = Deno.env.get('SPOTIFY_CLIENT_ID');
  const secret = Deno.env.get('SPOTIFY_CLIENT_SECRET');
  if (!id || !secret) throw new Error('not_configured');

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) throw new Error('token_failed');
  const data = await response.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

/** Accepts a share link, an embed link, or a bare spotify:playlist URI. */
function parsePlaylistId(input: string): string | null {
  const trimmed = input.trim();

  const uri = trimmed.match(/^spotify:playlist:([A-Za-z0-9]+)$/);
  if (uri) return uri[1];

  try {
    const url = new URL(trimmed);
    if (!url.hostname.endsWith('spotify.com')) return null;
    const match = url.pathname.match(/playlist\/([A-Za-z0-9]+)/);
    return match ? match[1] : null;
  } catch {
    return /^[A-Za-z0-9]{16,40}$/.test(trimmed) ? trimmed : null;
  }
}

interface SpotifyImage {
  url: string;
  width: number | null;
}

interface SpotifyTrack {
  id?: string | null;
  name?: string;
  artists?: { name: string }[];
  album?: { name?: string; release_date?: string; images?: SpotifyImage[] };
}

function pickCover(images: SpotifyImage[] | undefined): string | undefined {
  if (!images?.length) return undefined;
  const sorted = [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
  return sorted[0]?.url;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  try {
    const { url, market } = await request.json().catch(() => ({ url: '', market: '' }));

    // Without a market, a client-credentials token has no country context and
    // Spotify returns every item's `track` as null. The playlist then looks
    // empty rather than unavailable, which is a genuinely confusing failure.
    const region = /^[A-Z]{2}$/.test(String(market ?? '').toUpperCase())
      ? String(market).toUpperCase()
      : 'US';
    const playlistId = parsePlaylistId(String(url ?? ''));
    if (!playlistId) {
      return json({ error: 'bad_link' }, 400);
    }

    const token = await getAppToken();
    const auth = { Authorization: `Bearer ${token}` };

    // Ask for the tracks through the playlist object rather than the dedicated
    // /tracks endpoint. Measured against a real playlist, /playlists/{id}
    // returns 200 while /playlists/{id}/tracks returns 403 for a
    // client-credentials token, and the playlist object embeds its first page
    // of tracks anyway. This gets the whole thing in one call for the common
    // case of a playlist under 100 tracks.
    const TRACK_FIELDS =
      'items(track(id,name,album(name,release_date,images),artists(name)))';
    const meta = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}` +
        `?market=${region}&fields=name,description,images,public,tracks(next,total,${TRACK_FIELDS})`,
      { headers: auth },
    );

    if (meta.status === 404) return json({ error: 'not_found' }, 404);
    if (meta.status === 401 || meta.status === 403) {
      return json({ error: 'not_public' }, 403);
    }
    if (!meta.ok) {
      return json(
        { error: 'upstream', stage: 'playlist', status: meta.status, detail: await meta.text() },
        502,
      );
    }

    const playlist = await meta.json();

    const tracks: unknown[] = [];
    let skipped = 0;
    let partial = false;

    const collect = (items: unknown[]) => {
      for (const item of (items ?? []) as { track?: SpotifyTrack }[]) {
        const track = item?.track;
        // Local files and removed tracks come through as null or without a name.
        if (!track?.name || !track.artists?.length) {
          skipped += 1;
          continue;
        }

        const year = track.album?.release_date
          ? Number(String(track.album.release_date).slice(0, 4))
          : undefined;

        tracks.push({
          spotifyId: track.id ?? null,
          title: track.name,
          artist: track.artists.map((a) => a.name).join(', '),
          album: track.album?.name,
          year: Number.isFinite(year) ? year : undefined,
          artworkUrl: pickCover(track.album?.images),
        });
        if (tracks.length >= MAX_TRACKS) return;
      }
    };

    collect(playlist.tracks?.items ?? []);

    // Anything past the first page needs the /tracks endpoint. That is the one
    // that can be forbidden, so a refusal here returns what we already have and
    // says the import is partial, rather than failing the whole thing.
    let next: string | null = playlist.tracks?.next ?? null;
    while (next && tracks.length < MAX_TRACKS) {
      const page = await fetch(next, { headers: auth });
      if (!page.ok) {
        partial = true;
        break;
      }
      const body = await page.json();
      collect(body.items ?? []);
      next = body.next ?? null;
    }

    if (tracks.length === 0 && skipped === 0) {
      return json(
        {
          error: 'upstream',
          stage: 'tracks',
          status: 0,
          detail: 'The playlist returned no readable items.',
        },
        502,
      );
    }

    return json({
      name: playlist.name ?? 'Imported playlist',
      description: playlist.description ?? '',
      coverUrl: pickCover(playlist.images),
      trackCount: tracks.length,
      // Reported so the app can tell "nothing readable here" apart from
      // "we dropped everything", which are very different problems.
      skipped,
      truncated: tracks.length >= MAX_TRACKS || partial,
      tracks,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown';
    return json(
      {
        error: reason === 'not_configured' ? 'not_configured' : 'upstream',
        stage: 'function',
        detail: reason,
      },
      500,
    );
  }
});
