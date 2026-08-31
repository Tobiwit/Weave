import { describe, expect, it } from 'vitest';
import type { Descriptor, Song } from '../../types';
import {
  buildSourceText,
  groupFloor,
  inferEnergy,
  rankDescriptors,
  selectDescriptors,
  suppressContradictions,
  topOfGroup,
  type ScoredDescriptor,
} from './descriptorRanking';

const descriptors: Descriptor[] = [
  { id: 'euphoric', label: 'Euphoric', group: 'mood', description: '' },
  { id: 'melancholic', label: 'Melancholic', group: 'mood', description: '' },
  { id: 'heartbreak', label: 'Heartbreak', group: 'theme', description: '' },
  { id: 'celebration', label: 'Celebration', group: 'theme', description: '' },
  { id: 'glossy', label: 'Glossy', group: 'vibe', description: '' },
  { id: 'polished', label: 'Polished', group: 'texture', description: '' },
  { id: 'raw', label: 'Raw', group: 'texture', description: '' },
  { id: 'bright', label: 'Bright', group: 'texture', description: '' },
  { id: 'dark', label: 'Dark', group: 'texture', description: '' },
  { id: 'high-energy', label: 'High energy', group: 'energy', description: '' },
  { id: 'low-energy', label: 'Low energy', group: 'energy', description: '' },
  { id: 'mid-energy', label: 'Steady energy', group: 'energy', description: '' },
];

// One axis per descriptor keeps the expected ranking obvious.
const vectors = descriptors.map((_, index) =>
  descriptors.map((__, i) => (i === index ? 1 : 0)),
);

const scored = (entries: [string, number][]): ScoredDescriptor[] =>
  entries
    .map(([id, score]) => ({
      descriptor: descriptors.find((d) => d.id === id)!,
      score,
    }))
    .sort((a, b) => b.score - a.score);

describe('rankDescriptors', () => {
  it('sorts descriptors by similarity to the song vector', () => {
    const song = [0, 0, 0, 0, 0.9, 0.4, 0, 0, 0];
    const ranked = rankDescriptors(song, vectors, descriptors);
    expect(ranked[0].descriptor.id).toBe('glossy');
    expect(ranked[1].descriptor.id).toBe('polished');
  });

  it('scores every descriptor in the vocabulary', () => {
    const ranked = rankDescriptors([1, 0, 0, 0, 0, 0, 0, 0, 0], vectors, descriptors);
    expect(ranked).toHaveLength(descriptors.length);
  });

  it('scores zero against a missing descriptor vector rather than throwing', () => {
    const ranked = rankDescriptors([1, 0, 0], [[1, 0, 0]], descriptors);
    expect(ranked.filter((entry) => entry.score === 0)).toHaveLength(
      descriptors.length - 1,
    );
  });
});

describe('topOfGroup', () => {
  const ranked = scored([
    ['euphoric', 0.7],
    ['melancholic', 0.5],
    ['heartbreak', 0.6],
    ['glossy', 0.1],
  ]);

  it('returns only the requested group, strongest first', () => {
    const moods = topOfGroup(ranked, 'mood', 2, 0);
    expect(moods.map((entry) => entry.descriptor.id)).toEqual([
      'euphoric',
      'melancholic',
    ]);
  });

  it('respects the limit', () => {
    expect(topOfGroup(ranked, 'mood', 1, 0)).toHaveLength(1);
  });

  it('drops descriptors below the minimum score', () => {
    expect(topOfGroup(ranked, 'vibe', 3, 0.2)).toHaveLength(0);
  });
});

describe('inferEnergy', () => {
  it('reads high when the high-energy descriptor dominates', () => {
    expect(inferEnergy(scored([['high-energy', 0.8], ['low-energy', 0]]))).toBe(1);
  });

  it('reads low when the low-energy descriptor dominates', () => {
    expect(inferEnergy(scored([['high-energy', 0], ['low-energy', 0.8]]))).toBe(0);
  });

  it('sits in the middle with no energy signal at all', () => {
    expect(inferEnergy([])).toBe(0.5);
  });

  it('stays within 0 and 1', () => {
    const value = inferEnergy(
      scored([['high-energy', 0.6], ['mid-energy', 0.4], ['low-energy', 0.3]]),
    );
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  });
});

describe('selectDescriptors', () => {
  const limits = { mood: 1, energy: 1, theme: 2, texture: 1, vibe: 1 } as const;

  it('picks one mood and separates themes from character', () => {
    const ranked = scored([
      ['euphoric', 0.62],
      ['melancholic', 0.31],
      ['celebration', 0.55],
      ['heartbreak', 0.5],
      ['glossy', 0.48],
      ['polished', 0.4],
      ['high-energy', 0.5],
    ]);

    const selection = selectDescriptors(ranked, limits);

    expect(selection.mood).toBe('Euphoric');
    expect(selection.themes).toEqual(['Celebration', 'Heartbreak']);
    expect(selection.vibes).toEqual(['Glossy', 'Polished']);
    expect(selection.energy).toBe(1);
  });

  it('drops descriptors far weaker than the best in their own group', () => {
    const selection = selectDescriptors(
      scored([
        ['euphoric', 0.62],
        ['celebration', 0.55],
        ['heartbreak', 0.22],
      ]),
      limits,
    );
    expect(selection.themes).toEqual(['Celebration']);
  });

  it('never shows both halves of a contradictory pair', () => {
    const selection = selectDescriptors(
      scored([
        ['euphoric', 0.6],
        ['bright', 0.52],
        ['dark', 0.5],
      ]),
      { mood: 1, energy: 1, theme: 2, texture: 3, vibe: 2 },
    );
    expect(selection.vibes).toContain('Bright');
    expect(selection.vibes).not.toContain('Dark');
  });

  it('still infers energy from descriptors that contradict each other', () => {
    // Suppression is a display concern; the energy read needs both ends.
    const selection = selectDescriptors(
      scored([['high-energy', 0.6], ['low-energy', 0.2]]),
      limits,
    );
    expect(selection.energy).toBeGreaterThan(0.5);
  });

  it('leaves mood undefined when nothing scores well enough', () => {
    const selection = selectDescriptors(scored([['euphoric', 0.01]]));
    expect(selection.mood).toBeUndefined();
  });
});

describe('suppressContradictions', () => {
  it('keeps the stronger of each opposing pair', () => {
    const result = suppressContradictions(
      scored([['bright', 0.4], ['dark', 0.6], ['glossy', 0.5]]),
    );
    expect(result.map((entry) => entry.descriptor.id)).toEqual([
      'dark',
      'glossy',
    ]);
  });

  it('leaves a descriptor alone when its opposite is absent', () => {
    const result = suppressContradictions(scored([['raw', 0.4]]));
    expect(result).toHaveLength(1);
  });
});

describe('groupFloor', () => {
  it('raises the floor relative to the best score in the group', () => {
    const ranked = scored([['celebration', 0.5], ['heartbreak', 0.2]]);
    expect(groupFloor(ranked, 'theme', 0.1, 0.8)).toBeCloseTo(0.4, 10);
  });

  it('never falls below the absolute minimum', () => {
    const ranked = scored([['celebration', 0.05]]);
    expect(groupFloor(ranked, 'theme', 0.18, 0.8)).toBe(0.18);
  });

  it('falls back to the absolute minimum for an absent group', () => {
    expect(groupFloor([], 'mood', 0.18, 0.8)).toBe(0.18);
  });
});

describe('buildSourceText', () => {
  const song: Song = { id: 's', title: 'Dreams', artist: 'Fleetwood Mac', year: 1977 };

  it('includes every available signal', () => {
    const text = buildSourceText({
      song,
      genres: ['soft rock'],
      communityTags: ['70s', 'mellow'],
      lyrics: 'a quiet passage',
    });
    expect(text).toContain('Dreams by Fleetwood Mac');
    expect(text).toContain('1977');
    expect(text).toContain('soft rock');
    expect(text).toContain('mellow');
    expect(text).toContain('a quiet passage');
  });

  it('works when every optional signal is missing', () => {
    const text = buildSourceText({
      song: { id: 's', title: 'X', artist: 'Y' },
      genres: [],
      communityTags: [],
      lyrics: null,
    });
    expect(text).toBe('X by Y.');
  });

  it('truncates lyrics so no full work is ever carried around', () => {
    const text = buildSourceText({
      song,
      genres: [],
      communityTags: [],
      lyrics: 'word '.repeat(400),
    });
    expect(text.length).toBeLessThan(750);
  });

  it('strips section markers from lyrics', () => {
    const text = buildSourceText({
      song,
      genres: [],
      communityTags: [],
      lyrics: '[Chorus] the line itself',
    });
    expect(text).not.toContain('[Chorus]');
    expect(text).toContain('the line itself');
  });
});
