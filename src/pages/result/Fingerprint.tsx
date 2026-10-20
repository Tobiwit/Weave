import { useState } from 'react';
import { DESCRIPTORS_BY_GROUP } from '../../data/descriptors';
import type { SongProfile } from '../../types';
import { Facet } from './Facet';

interface FingerprintProps {
  profile: SongProfile;
  onChange: (patch: Partial<SongProfile>) => void;
}

/**
 * The reading, presented before it can be argued with.
 *
 * It reads as a short piece of writing about the song. Every line is editable,
 * but nothing looks like a form until you touch it: the mood is the headline
 * and the facets are sentences. How it feels on the eight scales is the next
 * step, so there are no sliders here.
 */
export function Fingerprint({ profile, onChange }: FingerprintProps) {
  const [pickingMood, setPickingMood] = useState(false);
  const [showSignals, setShowSignals] = useState(false);

  const removed = new Set(profile.removedTags.map((term) => term.toLowerCase()));
  const kept = (terms: string[]) =>
    terms.filter((term) => !removed.has(term.toLowerCase()));

  /** Manual additions belong to the facet they were added from. */
  const manualFor = (group: string) =>
    profile.manualTags.filter((tag) => tag.startsWith(`${group}:`)).map(strip);
  const strip = (tag: string) => tag.slice(tag.indexOf(':') + 1);

  const removedFrom = (terms: string[]) =>
    profile.removedTags.filter((term) =>
      terms.some((source) => source.toLowerCase() === term.toLowerCase()),
    );

  const remove = (term: string) =>
    onChange({ removedTags: [...profile.removedTags, term] });

  const restore = (term: string) =>
    onChange({
      removedTags: profile.removedTags.filter(
        (entry) => entry.toLowerCase() !== term.toLowerCase(),
      ),
    });

  const add = (group: string) => (term: string) => {
    const tagged = `${group}:${term}`;
    const exists = profile.manualTags.some(
      (tag) => tag.toLowerCase() === tagged.toLowerCase(),
    );
    if (!exists) onChange({ manualTags: [...profile.manualTags, tagged] });
  };

  const removeManual = (group: string) => (term: string) =>
    onChange({
      manualTags: profile.manualTags.filter(
        (tag) => tag.toLowerCase() !== `${group}:${term}`.toLowerCase(),
      ),
    });

  const facet = (group: string, source: string[]) => {
    const mine = manualFor(group);
    return {
      terms: [...kept(source), ...mine],
      removed: removedFrom(source),
      manual: mine,
      onRemove: remove,
      onRestore: restore,
      onAdd: add(group),
      onRemoveManual: removeManual(group),
    };
  };

  return (
    <div className="fp">
      <button
        type="button"
        className={`fp__mood${pickingMood ? ' fp__mood--open' : ''}`}
        onClick={() => setPickingMood(!pickingMood)}
        aria-expanded={pickingMood}
      >
        <span className="fp__moodLabel">Mood</span>
        <span className="fp__moodWord">{profile.mood ?? 'Unnamed'}</span>
      </button>

      {pickingMood && (
        <ul className="fp__moods">
          {DESCRIPTORS_BY_GROUP.mood.map((descriptor) => (
            <li key={descriptor.id}>
              <button
                type="button"
                className={`fp__moodOption${
                  profile.mood === descriptor.label ? ' fp__moodOption--on' : ''
                }`}
                onClick={() => {
                  onChange({ mood: descriptor.label });
                  setPickingMood(false);
                }}
              >
                {descriptor.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Facet label="Character" {...facet('vibe', profile.vibes)} addPlaceholder="glossy, witchy…" />
      <Facet label="Themes" {...facet('theme', profile.themes)} addPlaceholder="longing, freedom…" />
      <Facet label="Style" muted {...facet('genre', profile.genres)} addPlaceholder="dream pop…" />

      {profile.communityTags.length > 0 && (
        <div className="fp__signals">
          <button
            type="button"
            className="fp__signalsToggle"
            onClick={() => setShowSignals(!showSignals)}
            aria-expanded={showSignals}
          >
            {profile.communityTags.length} community signals
          </button>
          {showSignals && (
            <p className="fp__signalsList">
              {profile.communityTags.slice(0, 14).join(' · ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
