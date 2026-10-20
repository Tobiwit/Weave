import { describe, expect, it } from 'vitest';
import type { SongProfile } from '../../types';
import {
  audioEvidence,
  axisFromScores,
  loudnessToPresence,
  readAxes,
} from './axisReading';

function profile(patch: Partial<SongProfile> = {}): SongProfile {
  return {
    songId: 's',
    genres: [],
    communityTags: [],
    themes: [],
    vibes: [],
    measuredFields: [],
    manualTags: [],
    removedTags: [],
    sources: [],
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

const recco = {
  valence: 0.2,
  energy: 0.9,
  danceability: 0.8,
  acousticness: 0.05,
  instrumentalness: 0,
  speechiness: 0.05,
  liveness: 0.1,
  loudness: -5,
  tempo: 124,
  matchedBy: 'spotify' as const,
  trackId: 't',
};

describe('audioEvidence', () => {
  it('maps valence onto darkness and acousticness onto electric', () => {
    const evidence = audioEvidence({ reccobeats: recco, checkedAt: 0 });
    expect(evidence.mood?.[0].value).toBeCloseTo(0.8, 5);
    expect(evidence.sound?.[0].value).toBeCloseTo(0.95, 5);
    expect(evidence.movement?.[0].value).toBe(0.8);
  });

  it('gives approximated axes less confidence than measured ones', () => {
    const evidence = audioEvidence({ reccobeats: recco, checkedAt: 0 });
    expect(evidence.weight?.[0].confidence).toBeLessThan(evidence.energy?.[0].confidence ?? 0);
  });

  it('reads AcousticBrainz classifiers, skipping the ones that are missing', () => {
    const evidence = audioEvidence({
      acousticbrainz: { mbid: 'm', sad: 0.8, happy: 0.1, danceable: 0.3 },
      checkedAt: 0,
    });
    expect(evidence.mood?.[0].value).toBeCloseTo(0.85, 5);
    expect(evidence.movement?.[0].value).toBe(0.3);
    expect(evidence.energy).toBeUndefined();
  });
});

describe('loudnessToPresence', () => {
  it('maps a modern master loud and a quiet recording quiet', () => {
    expect(loudnessToPresence(-4)).toBe(1);
    expect(loudnessToPresence(-30)).toBe(0);
    expect(loudnessToPresence(-14)).toBeCloseTo(0.5, 5);
  });
});

describe('axisFromScores', () => {
  it('follows the strongest descriptors rather than averaging to the centre', () => {
    const value = axisFromScores({ dark: 0.45, bright: 0.3, melancholic: 0.4 }, 'mood', 0.03);
    expect(value?.value).toBeGreaterThan(0.8);
  });

  it('says nothing about an axis no descriptor speaks to', () => {
    expect(axisFromScores({ retro: 0.5 }, 'mood')).toBeUndefined();
  });
});

describe('readAxes', () => {
  it('lets a hand placement replace every machine reading', () => {
    const readings = readAxes(
      profile({ axes: { mood: 0.1 }, audio: { reccobeats: recco, checkedAt: 0 } }),
    );
    expect(readings.mood.value).toBe(0.1);
    expect(readings.mood.origin).toBe('user');
    expect(readings.mood.confidence).toBe(1);
  });

  it('marks an axis measured when audio contributed', () => {
    const readings = readAxes(profile({ audio: { reccobeats: recco, checkedAt: 0 } }));
    expect(readings.energy.origin).toBe('measured');
    expect(readings.energy.primary).toBe('reccobeats');
  });

  it('falls back to chosen labels for profiles read before scores were kept', () => {
    const readings = readAxes(profile({ mood: 'Melancholic', vibes: ['Intimate'] }));
    expect(readings.mood.origin).toBe('inferred');
    expect(readings.mood.value).toBeGreaterThan(0.6);
    expect(readings.emotion.value).toBeGreaterThan(0.6);
  });

  it('keeps lyrics to mood and emotion', () => {
    const readings = readAxes(
      profile({ reading: { signal: {}, lyrics: { heartbreak: 0.5, 'euphoric-dance': 0.6 } } }),
    );
    expect(readings.emotion.evidence.some((e) => e.source === 'lyrics')).toBe(true);
    expect(readings.movement.evidence.some((e) => e.source === 'lyrics')).toBe(false);
  });

  it('treats a mood that differs from the ranking as chosen by hand', () => {
    const readings = readAxes(
      profile({ mood: 'Angry', reading: { signal: { euphoric: 0.5, angry: 0.3 } } }),
    );
    expect(readings.mood.evidence.some((e) => e.source === 'chosen mood')).toBe(true);
  });

  it('is centred with no confidence when nothing is known', () => {
    const readings = readAxes(profile());
    expect(readings.finish.confidence).toBe(0);
    expect(readings.finish.origin).toBe('none');
  });
});

describe('source calibration', () => {
  it('fits nothing from too few songs', async () => {
    const { fitLine } = await import('./axisReading');
    expect(fitLine([{ x: 0.1, y: 0.6 }])).toBeNull();
  });

  it('moves a biased source onto the measured scale, shrunk by sample size', async () => {
    const { fitLine } = await import('./axisReading');
    // Words read everything 0.4 brighter than it measures.
    const points = Array.from({ length: 40 }, (_, i) => {
      const y = 0.45 + (i % 10) * 0.05;
      return { x: y - 0.4, y };
    });
    const map = fitLine(points);
    expect(map).not.toBeNull();
    const mapped = (map?.intercept ?? 0) + (map?.slope ?? 1) * 0.2;
    // Raw 0.2 truly means 0.6; the shrunk fit lands most of the way there.
    expect(mapped).toBeGreaterThan(0.45);
    expect(map?.r).toBeCloseTo(1, 5);
  });

  it('maps descriptor evidence for word-only songs once fitted', async () => {
    const { fitSourceCalibration } = await import('./axisReading');
    const measuredSongs = Array.from({ length: 12 }, (_, i) =>
      profile({
        songId: `s${i}`,
        mood: 'Euphoric',
        audio: { reccobeats: { ...recco, valence: 0.3 + (i % 3) * 0.05 }, checkedAt: 0 },
        reading: { signal: { euphoric: 0.5, bright: 0.45, melancholic: 0.2 } },
      }),
    );
    const calibration = fitSourceCalibration(measuredSongs);
    expect(calibration.descriptors?.mood).toBeDefined();

    const wordsOnly = profile({
      mood: 'Euphoric',
      reading: { signal: { euphoric: 0.5, bright: 0.45, melancholic: 0.2 } },
    });
    const raw = readAxes(wordsOnly, {});
    const mapped = readAxes(wordsOnly, calibration);
    // The words call it bright; songs read like this measure darker, so the
    // calibrated reading moves towards dark.
    expect(mapped.mood.value).toBeGreaterThan(raw.mood.value);
    expect(mapped.mood.evidence[0].raw).toBeCloseTo(raw.mood.value, 5);
  });
});

describe('chosen mood', () => {
  it('does not mistake the analysis’s own final pick for a hand edit', () => {
    const readings = readAxes(
      profile({
        mood: 'Sensual',
        reading: { signal: { euphoric: 0.5, sensual: 0.3 }, mood: 'Sensual' },
      }),
    );
    expect(readings.mood.evidence.some((e) => e.source === 'chosen mood')).toBe(false);
  });
});
