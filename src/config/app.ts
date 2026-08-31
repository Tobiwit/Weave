import meta from '../../app.meta.json';

/**
 * Central application metadata.
 *
 * Shared with the PWA manifest through `app.meta.json` at the repository root,
 * so the product name lives in exactly one place and the build, the manifest
 * and the interface can never drift apart.
 */
export const APP = {
  ...meta,
  tagline: 'Where does this song belong?',
} as const;

export const COPY = {
  analyzeHeading: 'Where does this song belong?',
  fingerprintHeading: 'This is what we hear.',
  confirmHeading: 'Does this feel right?',
  matchCta: 'Find its place',
  universeHeading: 'Your music universe',
  universeSub: 'A projection of your playlist space.',
  playlistsHeading: 'Your playlists',
  installHint: `Keep ${meta.name} on your Home Screen`,
} as const;
