# Weave

A mobile-first, local-first music app. You pick a song; Weave interprets its
character from metadata, community tags and lyrics, lets you correct that
interpretation, and then matches it against your own playlist universe.

The result is never "AI says this belongs in Playlist X". It is "this is how we
understood this song, and these are the playlists it resonates with".

## Running it

```bash
npm install
npm run dev
```

Everything works with no configuration and no network: the app ships with a
development catalogue of songs, playlists and pre-generated profiles, and seeds
them into IndexedDB on first launch.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Typecheck and production build, including the PWA |
| `npm run preview` | Serve the production build |
| `npm test` | Run the unit tests |
| `npm run typecheck` | Types only |
| `npm run icons` | Regenerate the icon set from `public/icons/mark.svg` |

## Configuration

Copy `.env.example` to `.env` to enable live data:

```
VITE_LASTFM_API_KEY=
```

**A browser-visible key is not a secret.** This is a static client-side app, so
anything prefixed with `VITE_` is compiled into the bundle and readable by
anyone who opens devtools. Treat the Last.fm key as public. If you need a real
secret, put a proxy or serverless function in front of the provider and repoint
the adapter in `src/services/lastfm/client.ts`; nothing else has to change,
because no component talks to an API directly.

Without a key, search and community tags come from the local catalogue and the
app remains fully usable. Settings lets you force on-device-only mode.

## Accounts and Spotify import (optional)

Both are additive. With none of this configured Weave stays local-only and
every screen works exactly as before — there is no login wall anywhere.

### 1. Create a Supabase project

Copy the project URL and the **anon** key into `.env`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

The anon key is meant to be public. Row-level security is what protects data,
so never put the `service_role` key in a `VITE_` variable.

### 2. Create the tables

Run `supabase/migrations/0001_library.sql` in the Supabase SQL editor. It
creates three tables and the row-level security policies that scope every row
to its owner, on both read and write.

### 3. Deploy the Spotify function

Spotify has no anonymous read: every Web API endpoint returns 401 without a
token, public playlists included. The client-credentials grant needs the app
secret, which cannot live in a browser bundle, so it lives in an edge function
instead. The result is that importing a link needs no Spotify login from
anyone.

Create an app at https://developer.spotify.com/dashboard, then:

```bash
supabase secrets set SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=...
```

```bash
supabase functions deploy spotify-playlist
```

### 4. Deploying to Vercel

The Supabase CLI steps above are **not** part of the deploy. They are one-time
setup against your Supabase project, run from your machine; Vercel only builds
and hosts the static frontend.

`vercel.json` is committed and handles the two things a Vite PWA needs from a
host: a catch-all rewrite to `index.html` so refreshing `/playlists` does not
404, and cache headers that let `sw.js` and the manifest be re-fetched while
hashed assets stay immutable.

Three things to get right in the dashboards:

1. **Vercel → Settings → Environment Variables.** Vite inlines `VITE_*` at
   build time, so a local `.env` does nothing for a Vercel build. Add
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_LASTFM_API_KEY`
   there, then redeploy.
2. **Supabase → Authentication → URL Configuration.** Add your Vercel domain
   as the Site URL and to Redirect URLs. Magic links come back to
   `window.location.origin`, and Supabase refuses redirects to origins that
   are not on that list — this is the most common reason sign-in appears to do
   nothing in production.
3. **Redeploy after changing env vars.** They are baked into the bundle, so an
   existing deployment will not pick them up on its own.

### What syncs, and what does not

IndexedDB stays the source of truth. Sync pushes what changed and pulls what
the account has, merging per record by `updatedAt` — last write wins, which is
the right model for one person on a few devices.

Embeddings are deliberately **not** synced. They are large, they are derivable
from the record they belong to, and `ensureLibraryVectors` already rebuilds
them on demand. A new device recomputes rather than downloading megabytes of
float arrays that any model change would invalidate anyway.

Deletions are soft. A hard delete is indistinguishable from "never seen it", so
a device that missed the delete would resurrect the playlist on its next sync;
`deletedAt` makes the deletion a fact that can travel.

### Where Spotify stops

Spotify supplies **track identity only** — title, artist, album, year, cover.
Weave then reads those songs with its own sources. No Spotify content enters
the embedding pipeline, nothing is gated behind Spotify authentication, and the
app is fully usable without it. That boundary is a product decision and also
keeps the project clear of Spotify's terms on derived data and model training.

Imported songs are stored as identity and are not analysed automatically:
reading several hundred songs is minutes of work and a lot of network, so it
stays an explicit choice. Until then the playlist is defined by its words
alone, which the matching engine already handles.

## How it fits together

```
src/
  config/          app metadata, embedding model, matching weights and calibration
  types/           the shared data model
  db/              Dexie database and repositories
  services/        one adapter per external concern, behind an interface
    search/  metadata/  tags/  lyrics/  audio/  artwork/
    embedding/  projection/  spotify/  cloud/
  features/
    analysis/      the pipeline, descriptor ranking, stage visuals
    matching/      pure vector maths, scoring, explanations
    playlists/     playlist vectors, insights, vector maintenance
    mood/          Song Profile -> visual parameters
    universe/      projection and layout
    sync/          optional library sync
  components/      background, cloud, flow, layout, playlist, ui, brand, pwa
  pages/           one directory-level component per route
```

Two rules hold the architecture together:

1. **No component calls an API.** External data arrives through a provider
   interface, and every provider has a mock sibling.
2. **Similarity lives in the original embedding space.** The Universe's 2D
   coordinates are for display only and never feed a score.

## The analysis pipeline

`src/features/analysis/runSongAnalysis.ts` runs:

```
identify -> metadata -> community -> lyrics -> interpret -> fingerprint -> complete
```

Cover art is fetched first, inside `identify`, so the song has a face for the
rest of the run. It comes from the iTunes Search API, which needs no key and
sends CORS headers; results are cached (including misses) and written back to
the song, so covers also fill in across the library. It is never a blocker — on
failure the generated cover stands in.

The UI animates against real stage transitions. Only failure to establish the
song's identity aborts the run; every other missing signal adds a
plain-language notice and the pipeline continues.

**On pacing:** with embeddings cached an analysis can finish in well under a
second, which leaves nothing readable on screen. Completed steps are therefore
released for display one at a time, each held for as long as its own content
takes to read (roughly 0.7-2.2s, scaling with how many terms it surfaced), for
about 8s end to end. The pipeline is never delayed or reordered and no step
appears before it has genuinely finished; only the *display* of results that
already exist is paced. The constants live in `STEP_PACING` in
`src/features/analysis/analysisSteps.ts`.

Runs are shared through `analysisRegistry.ts`, so a component remounting (under
StrictMode, for instance) attaches to the existing run rather than starting a
second one.

## Interpretation without a generative model

There is no LLM. `src/data/descriptors.ts` holds a curated vocabulary where each
descriptor carries a rich hidden description used only for embedding. The song's
signals are embedded, compared against the descriptor vectors by cosine
similarity, and the strongest are selected per group.

Two rules keep the output honest:

- Opposing descriptors (bright/dark, warm/cold, raw/polished) never both appear;
  the weaker of each pair is dropped.
- A descriptor must also score close to the best in its own group, because
  sentence-model similarities cluster tightly and an absolute floor alone lets
  filler through.

Inferred values are labelled as such. Measured values (BPM and friends) appear
only when a provider genuinely supplied them, and are tracked in
`SongProfile.measuredFields`.

## Embeddings

`Xenova/all-MiniLM-L6-v2` via `@huggingface/transformers`, configured in one
place (`src/config/embedding.ts`). The model is lazy-loaded on first use, never
at app start, and shows a one-time "Preparing your analyzer" state. Vectors are
cached in IndexedDB keyed by provider and text.

If the model cannot load, a deterministic lexical embedder takes over for the
session. It is not semantic, but it keeps every screen working offline.

## Scoring

`normalizeSimilarity()` maps a cosine similarity onto a 0-100 **Match Score** —
not a probability, and the UI never calls it one. The calibration bands in
`src/config/matching.ts` were measured against the development library rather
than guessed, and there are separate bands for song-to-playlist and
within-playlist comparisons because those are genuinely different distributions.
Recalibrate them if the embedding model or the text recipes change.

When a song already belongs to a playlist it is compared against a
**leave-one-out centroid**, so it never inflates the score of the playlist it
helped define. The same utility underpins the future Playlist Audit feature.

## The visual system

The background is not decoration; it is part of the interpretation.

`BloomFieldRenderer` paints large soft lights drifting through a near-black
volume: no pattern, no texture, no visible structure. That is deliberate. An
earlier version tiled a halftone moiré across the whole screen and it read as
noise competing with the type — the background carries depth and colour, and
any structured element on the page has to be the only structured thing there.
The canvas renders at about a fifth of display size under a heavy blur, so the
whole field costs a few thousand pixels a frame.

Colour is one narrow family: electric blue into periwinkle with violet at the
far edge. Mood hues are confined to roughly 228-300 degrees. Letting warm moods
run out into magenta and amber made every song look like a different app, so
warmth is carried by saturation and by where the light sits instead. A Song
Profile still maps deterministically to its `MoodVisualState`, and one canvas
persists across routes so the environment evolves rather than cutting between
scenes.

`PointCloud` carries the analysis and the match reveal: around 1,700 points on a
spherical shell, rotating in 3D with differential speed by latitude and a slow
tilt, drawn as pre-tinted glow sprites with additive blending — no per-point
gradient work and no depth sorting. It is split across two canvases, one behind
the artwork and one in front, so points genuinely pass around the cover. Each
signal source owns a stream that flies in and joins the shell as its stage
completes, and the cloud tightens as the reading resolves.

Both are dot systems, deliberately: the coarse screen sits behind, the fine
cloud in front, and they read as two layers of one material. Where a screen
shows both, the field runs coarse and dim so the cloud stays the subject.

There are no connector lines anywhere. Drawing a thread from a song to each
playlist turns an atmosphere into a network diagram, so attraction is carried by
how much of the field arrives and how tightly it gathers instead.

Both animate against refs; React does not re-render per frame.

**Entrance reveals are CSS keyframes, not JS animations.** Their end state is
the visible state, so a throttled or stalled frame loop can never leave content
stranded invisible. JS animation is reserved for presence and gesture work,
where a stall is recoverable. `prefers-reduced-motion` is respected throughout,
and can also be forced in Settings.

## Reading the fingerprint

The review screen is written, not filled in. The mood is the headline; the other
facets read as sentences; the only controls visible at rest are the two
continuous qualities. Tapping any line turns those same words into controls in
place — no modal, and the words never move somewhere else to be edited.

The two continuous readings are named rather than numbered, because a percentage
would imply precision the reading does not have:

- **Energy** — pace and drive, how much the song moves.
  Still · Gentle · Steady · Driving · Relentless
- **Intensity** — emotional weight, how much it asks of you.
  Understated · Restrained · Balanced · Heightened · Overwhelming

They are deliberately decoupled: a hushed song can be overwhelming and a fast
one weightless, so energy contributes only about a fifth of intensity, enough to
stop the two contradicting each other outright.

## Local-first

Dexie over IndexedDB stores songs, profiles, playlists, cached embeddings and
settings. User edits and playlists survive reloads and installation. Schema
changes must add a new `version(n + 1)` block rather than editing an existing
one, so an installed app upgrades cleanly from any earlier version. Vector
recipes carry their own version (`VECTOR_RECIPE_VERSION`) so changing how a
vector is built recomputes stored vectors instead of silently mixing two
formulations.

## PWA

`vite-plugin-pwa` generates the manifest and a Workbox service worker. The app
shell, code, styles and icons are precached; third-party music APIs deliberately
are not, because analysis caching belongs in the data layer. The analyzer
library is excluded from the precache so the install stays small and it is
fetched on first use instead.

Verify installation on a real device: `npm run build && npm run preview`, then
add to Home Screen from Safari.

## Spotify

Deliberately not a dependency. `src/services/spotify/` defines the import
boundary and is disabled; the Playlists screen shows it as coming later. Nothing
is gated behind Spotify authentication, and no Spotify-derived content enters
the analytical pipeline.

## Tests

```bash
npm test
```

Cover the parts where a silent error would be invisible in the UI: cosine
similarity, centroids, the leave-one-out centroid, playlist vector blending,
score normalization, descriptor ranking and selection, playlist ranking, and the
playlist insights that the audit feature will build on.
