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

## How it fits together

```
src/
  config/          app metadata, embedding model, matching weights and calibration
  types/           the shared data model
  db/              Dexie database and repositories
  services/        one adapter per external concern, behind an interface
    search/  metadata/  tags/  lyrics/  audio/  artwork/
    embedding/  projection/  spotify/
  features/
    analysis/      the pipeline, descriptor ranking, stage visuals
    matching/      pure vector maths, scoring, explanations
    playlists/     playlist vectors, insights, vector maintenance
    mood/          Song Profile -> visual parameters
    universe/      projection and layout
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
`MoodFieldRenderer` draws bundles of fibres to a canvas, blended additively and
softened by a GPU-composited CSS blur. A Song Profile maps deterministically to
its `MoodVisualState`, so similar songs produce visually related environments,
and one canvas persists across routes so the environment evolves rather than
cutting between scenes.

`PointCloud` carries the analysis: around 1,700 points on a spherical shell,
rotating in 3D with differential speed by latitude and a slow tilt, drawn as
pre-tinted glow sprites with additive blending — so there is no per-point
gradient work and no depth sorting. It is split across two canvases, one behind
the artwork and one in front, so points genuinely pass around the cover. Each
signal source owns a stream of points that flies in and joins the shell as that
stage completes, and the cloud tightens as the reading resolves.

`FlowField` is the thread system used for the match reveal: irregular cubic
paths with gradient strokes, slow deformation and optional motes. It takes only
geometry and strength, so pages compose it differently.

All three animate against refs; React does not re-render per frame.

**Entrance reveals are CSS keyframes, not JS animations.** Their end state is
the visible state, so a throttled or stalled frame loop can never leave content
stranded invisible. JS animation is reserved for presence and gesture work,
where a stall is recoverable. `prefers-reduced-motion` is respected throughout,
and can also be forced in Settings.

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
