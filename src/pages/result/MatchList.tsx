import { AnimatePresence, motion } from 'motion/react';
import { useState, type CSSProperties } from 'react';
import { PlaylistMaterial } from '../../components/playlist/PlaylistMaterial';
import { Button } from '../../components/ui/Button';
import { Disclosure } from '../../components/ui/Disclosure';
import { Ring } from '../../components/ui/Ring';
import { matchBand } from '../../features/matching';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useRuntimeSettings } from '../../hooks/useRuntimeSettings';
import type { Playlist, PlaylistMatch } from '../../types';
import { MatchWorking } from './MatchWorking';

interface MatchListProps {
  matches: PlaylistMatch[];
  playlists: Map<string, Playlist>;
  onAdd: (playlistId: string) => void;
  addedTo: Set<string>;
}

const BAND_WORD = { strong: 'Belongs here', partial: 'Could fit', distant: 'A stretch' } as const;

/**
 * The playlists, best first. Each is a tile with its score as a ring; the
 * first is set larger, because it is the answer and the rest are alternatives.
 */
export function MatchList({ matches, playlists, onAdd, addedTo }: MatchListProps) {
  const [expanded, setExpanded] = useState<string | null>(matches[0]?.playlistId ?? null);
  const reducedMotion = useReducedMotion();
  const { devTrace } = useRuntimeSettings();

  return (
    <ul className="matches">
      {matches.map((match, index) => {
        const playlist = playlists.get(match.playlistId);
        if (!playlist) return null;
        const open = expanded === match.playlistId;
        const band = matchBand(match.score);
        const added = addedTo.has(match.playlistId);
        const lead = index === 0;

        return (
          <li
            key={match.playlistId}
            className={`match match--${band}${lead ? ' match--lead' : ''}${open ? ' match--open' : ''} u-rise`}
            style={{ '--rise-delay': `${Math.min(index, 6) * 70}ms` } as CSSProperties}
          >
            <button
              type="button"
              className="match__head"
              onClick={() => setExpanded(open ? null : match.playlistId)}
              aria-expanded={open}
            >
              <span className="match__body">
                <span className="match__band">{BAND_WORD[band]}</span>
                <span className="match__name">{playlist.name}</span>
                <span className="match__desc">{playlist.keywords.slice(0, 3).join(' · ')}</span>
              </span>
              <Ring
                value={match.score}
                size={lead ? 84 : 60}
                thickness={lead ? 4 : 3}
                ariaLabel={`${match.score} percent match`}
              />
            </button>

            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  className="match__detail"
                  initial={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  animate={reducedMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                  exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="match__detailInner">
                    {match.reasons.length > 0 && (
                      <div className="match__group">
                        <h4 className="match__groupLabel">In common</h4>
                        <p className="match__terms">
                          {match.reasons.map((term) => (
                            <span key={term} className="match__term">
                              {term}
                            </span>
                          ))}
                        </p>
                      </div>
                    )}

                    {match.differences.length > 0 && (
                      <div className="match__group">
                        <h4 className="match__groupLabel">Pulling apart</h4>
                        <p className="match__terms">
                          {match.differences.map((term) => (
                            <span key={term} className="match__term match__term--muted">
                              {term}
                            </span>
                          ))}
                        </p>
                      </div>
                    )}

                    {match.reasons.length === 0 && match.differences.length === 0 && (
                      <p className="match__none">
                        These share a general feeling more than any single word.
                      </p>
                    )}

                    {devTrace && (
                      <Disclosure label="Show the working" note="weights per part">
                        <MatchWorking match={match} playlist={playlist} />
                      </Disclosure>
                    )}

                    <div className="match__actions">
                      <PlaylistMaterial playlist={playlist} size={36} />
                      <Button
                        variant={added ? 'quiet' : lead ? 'primary' : 'tinted'}
                        size="sm"
                        disabled={added}
                        onClick={() => onAdd(match.playlistId)}
                      >
                        {added ? `In ${playlist.name}` : `Add to ${playlist.name}`}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}
