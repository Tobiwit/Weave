import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AxisGauge } from '../../components/song/AxisGauge';
import { Artwork } from '../../components/ui/Artwork';
import { Button } from '../../components/ui/Button';
import { Chip, ChipRow } from '../../components/ui/Chip';
import { Ring } from '../../components/ui/Ring';
import { Sheet } from '../../components/ui/Sheet';
import { manualTagLabel, matchBand } from '../../features/matching';
import { songFitIn, type SongFit } from '../../features/playlists/songFit';
import { AXES, AXIS_GROUPS, placedCount } from '../../features/song/axes';
import type { Playlist, Song } from '../../types';
import './songSheet.css';

interface SongSheetProps {
  playlist: Playlist;
  song: Song | null;
  onClose: () => void;
  onRemove: (songId: string) => void;
}

const BAND_WORD = {
  strong: 'Belongs here',
  partial: 'Fits loosely',
  distant: 'An outlier here',
} as const;

/**
 * One song, seen from inside one playlist.
 *
 * How well it fits (scored with itself left out), where it sits on each scale
 * against the band the playlist holds, the words it was read as, and what you
 * have set for it by hand. Opened by tapping a song on the playlist screen.
 */
export function SongSheet({ playlist, song, onClose, onRemove }: SongSheetProps) {
  const navigate = useNavigate();
  // Results and the armed state are keyed by the song they belong to, so
  // opening another song reads as loading and unarmed without a reset.
  const [result, setResult] = useState<{ id: string; fit: SongFit | null } | null>(null);
  const [armedFor, setArmedFor] = useState<string | null>(null);
  const fit = song && result?.id === song.id ? result.fit : undefined;
  const confirming = Boolean(song) && armedFor === song?.id;

  useEffect(() => {
    if (!song) return;
    let cancelled = false;
    void songFitIn(playlist, song.id).then((next) => {
      if (!cancelled) setResult({ id: song.id, fit: next });
    });
    return () => {
      cancelled = true;
    };
  }, [playlist, song]);

  const bands = new Map(
    (fit?.match?.components?.find((c) => c.name === 'axes')?.axes ?? []).map((detail) => [
      detail.axis,
      {
        from: Math.max(0, detail.low),
        to: Math.min(1, detail.high),
        median: detail.median,
      },
    ]),
  );

  const profile = fit?.profile;
  const placed = profile ? placedCount(profile.axes ?? {}) : 0;
  const added = profile?.manualTags.map(manualTagLabel) ?? [];
  const removed = profile?.removedTags ?? [];
  const words = profile
    ? [...(profile.mood ? [profile.mood] : []), ...profile.vibes, ...profile.themes]
    : [];

  return (
    <Sheet open={Boolean(song)} onClose={onClose} label={song?.title}>
      {song && (
        <div className="ssheet">
          <header className="ssheet__head">
            <Artwork src={song.artworkUrl} seed={song.id} size={64} alt="" />
            <div className="ssheet__identity">
              <h2 className="ssheet__title">{song.title}</h2>
              <p className="ssheet__artist">{song.artist}</p>
              {fit?.match && (
                <p className={`ssheet__band ssheet__band--${matchBand(fit.match.score)}`}>
                  {BAND_WORD[matchBand(fit.match.score)]} in {playlist.name}
                </p>
              )}
            </div>
            {fit?.match && <Ring value={fit.match.score} size={68} />}
          </header>

          {fit === undefined && <p className="ssheet__loading">Reading how it sits here…</p>}

          {fit === null && (
            <p className="ssheet__loading">
              This song has not been read yet, so there is nothing to compare.
            </p>
          )}

          {fit && (
            <>
              <section className="ssheet__section">
                <div className="ssheet__sectionHead">
                  <h3 className="ssheet__sectionTitle">How it feels here</h3>
                  <span className="ssheet__legend">
                    <span className="ssheet__legendBand" aria-hidden="true" />
                    {playlist.name}
                  </span>
                </div>
                <div className="ssheet__gauges">
                  {AXIS_GROUPS.flatMap((group) => group.axes).map((axis) => (
                    <AxisGauge
                      key={axis.id}
                      axis={axis}
                      value={fit.readings[axis.id].value}
                      origin={fit.readings[axis.id].origin}
                      band={bands.get(axis.id)}
                    />
                  ))}
                </div>
              </section>

              {words.length > 0 && (
                <section className="ssheet__section">
                  <h3 className="ssheet__sectionTitle">Read as</h3>
                  <ChipRow>
                    {words.map((word, index) => (
                      <Chip key={word} strong={index === 0 && Boolean(profile?.mood)}>
                        {word}
                      </Chip>
                    ))}
                    {profile?.genres.map((genre) => (
                      <Chip key={`g-${genre}`}>{genre}</Chip>
                    ))}
                  </ChipRow>
                </section>
              )}

              <section className="ssheet__section">
                <h3 className="ssheet__sectionTitle">What you set</h3>
                {placed === 0 && added.length === 0 && removed.length === 0 ? (
                  <p className="ssheet__none">
                    Nothing yet. Everything above is the reading.
                  </p>
                ) : (
                  <ul className="ssheet__set">
                    {placed > 0 && (
                      <li>
                        <span className="ssheet__setLabel">Scales placed</span>
                        <span className="ssheet__setValue">
                          {AXES.filter((axis) => profile?.axes?.[axis.id] !== undefined)
                            .map((axis) => axis.label)
                            .join(', ')}
                        </span>
                      </li>
                    )}
                    {added.length > 0 && (
                      <li>
                        <span className="ssheet__setLabel">Words added</span>
                        <span className="ssheet__setValue">{added.join(', ')}</span>
                      </li>
                    )}
                    {removed.length > 0 && (
                      <li>
                        <span className="ssheet__setLabel">Words taken out</span>
                        <span className="ssheet__setValue">{removed.join(', ')}</span>
                      </li>
                    )}
                  </ul>
                )}
              </section>
            </>
          )}

          <div className="ssheet__actions">
            <Button
              variant="quiet"
              block
              onClick={() => navigate(`/song/${encodeURIComponent(song.id)}`)}
            >
              Open the breakdown
            </Button>
            <Button
              variant="ghost"
              block
              onClick={() => {
                if (!confirming) {
                  setArmedFor(song.id);
                  return;
                }
                onRemove(song.id);
                onClose();
              }}
            >
              {confirming ? `Really take it out of ${playlist.name}?` : `Take out of ${playlist.name}`}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
