import type { CSSProperties } from 'react';
import type { SongProfile } from '../../types';
import { Fold } from './Fold';
import './song.css';

interface SongSignalsProps {
  profile: SongProfile;
  showValues: boolean;
}

/** The continuous readings the fingerprint editor does not already own. */
const METERS: { key: keyof SongProfile; label: string }[] = [
  { key: 'brightness', label: 'Brightness' },
  { key: 'danceability', label: 'Danceability' },
  { key: 'acousticness', label: 'Acousticness' },
];

/**
 * Everything else the analysis left behind.
 *
 * This is provenance, not opinion: what was read, who said so, and what could
 * not be reached. It is shut by default because it answers a question most
 * visits never ask, and when it is opened it stays quiet — thin bars and small
 * words, with the numbers withheld unless the screen has been asked for them.
 */
export function SongSignals({ profile, showValues }: SongSignalsProps) {
  const measured = new Set(profile.measuredFields);
  const meters = METERS.map((meter) => ({
    ...meter,
    value: profile[meter.key] as number | undefined,
  })).filter((meter) => typeof meter.value === 'number');

  const reached = profile.sources.filter((source) => source.ok);
  const missed = profile.sources.filter((source) => !source.ok);

  return (
    <Fold
      name="Signals"
      note={`${reached.length} source${reached.length === 1 ? '' : 's'}`}
    >
      {meters.length > 0 && (
        <div className="signals__meters">
          {meters.map((meter) => (
            <div className="meter" key={meter.key as string}>
              <span className="meter__label">
                {meter.label}
                {measured.has(meter.key as string) && (
                  <span className="meter__measured" title="Measured, not inferred">
                    measured
                  </span>
                )}
              </span>
              <span
                className="meter__track"
                style={
                  {
                    '--meter': `${Math.round((meter.value ?? 0) * 100)}%`,
                  } as CSSProperties
                }
              >
                <span className="meter__fill" />
              </span>
              {showValues && (
                <span className="meter__number">
                  {Math.round((meter.value ?? 0) * 100)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <dl className="facts">
        {typeof profile.bpm === 'number' && measured.has('bpm') && (
          <Fact label="Tempo" value={`${Math.round(profile.bpm)} BPM`} />
        )}
        <Fact
          label="Vocabulary"
          value={`${profile.communityTags.length} community terms`}
        />
        {profile.manualTags.length > 0 && (
          <Fact label="Yours" value={`${profile.manualTags.length} added`} />
        )}
        {profile.removedTags.length > 0 && (
          <Fact label="Dropped" value={`${profile.removedTags.length} removed`} />
        )}
        <Fact
          label="Vector"
          value={
            profile.semanticEmbedding?.length
              ? `${profile.semanticEmbedding.length} dimensions`
              : 'not built'
          }
        />
        <Fact label="Read" value={formatDate(profile.createdAt)} />
        {profile.updatedAt > profile.createdAt && (
          <Fact label="Changed" value={formatDate(profile.updatedAt)} />
        )}
      </dl>

      {profile.communityTags.length > 0 && (
        <p className="signals__terms">{profile.communityTags.slice(0, 24).join(' · ')}</p>
      )}

      <ul className="provenance">
        {reached.map((source) => (
          <li key={`${source.kind}-${source.provider}`} className="provenance__row">
            <span className="provenance__kind">{source.kind}</span>
            <span className="provenance__who">{source.provider}</span>
          </li>
        ))}
        {missed.map((source) => (
          <li
            key={`miss-${source.kind}-${source.provider}`}
            className="provenance__row provenance__row--missed"
          >
            <span className="provenance__kind">{source.kind}</span>
            <span className="provenance__who">
              {source.note ?? `${source.provider} unavailable`}
            </span>
          </li>
        ))}
      </ul>
    </Fold>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="facts__row">
      <dt className="facts__label">{label}</dt>
      <dd className="facts__value">{value}</dd>
    </div>
  );
}

function formatDate(at: number): string {
  return new Date(at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
