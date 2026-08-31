import { AnimatePresence, motion } from 'motion/react';
import { useState, type CSSProperties } from 'react';
import { Button } from '../../components/ui/Button';
import { ScoreNumber } from '../../components/ui/ScoreNumber';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { matchBand } from '../../features/matching';
import type { Playlist, PlaylistMatch } from '../../types';

interface MatchListProps {
  matches: PlaylistMatch[];
  playlists: Map<string, Playlist>;
  onAdd: (playlistId: string) => void;
  addedTo: Set<string>;
}

export function MatchList({ matches, playlists, onAdd, addedTo }: MatchListProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();

  return (
    <ul className="matches">
      {matches.map((match, index) => {
        const playlist = playlists.get(match.playlistId);
        if (!playlist) return null;
        const open = expanded === match.playlistId;
        const band = matchBand(match.score);

        return (
          <li
            key={match.playlistId}
            className={`match match--${band} u-rise`}
            style={{ '--rise-delay': `${index * 90}ms` } as CSSProperties}
          >
            <button
              type="button"
              className="match__head"
              onClick={() => setExpanded(open ? null : match.playlistId)}
              aria-expanded={open}
            >
              <span className="match__score">
                <ScoreNumber value={match.score} size={index === 0 ? 'md' : 'sm'} />
              </span>
              <span className="match__body">
                <span className="match__name">{playlist.name}</span>
                <span className="match__desc u-meta">
                  {playlist.keywords.slice(0, 4).join(' · ')}
                </span>
              </span>
              <span className="match__chevron" aria-hidden="true">
                {open ? '−' : '+'}
              </span>
            </button>

            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  className="match__detail"
                  initial={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  animate={reducedMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                  exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.36, ease: [0.16, 0.84, 0.28, 1] }}
                >
                  <div className="match__detailInner">
                    <p className="u-meta match__scoreNote">
                      {match.score}% match · a Match Score, not a probability
                    </p>

                    {match.reasons.length > 0 && (
                      <div className="match__group">
                        <h4 className="u-eyebrow">Strong overlap</h4>
                        <p className="match__terms">{match.reasons.join(' · ')}</p>
                      </div>
                    )}

                    {match.differences.length > 0 && (
                      <div className="match__group">
                        <h4 className="u-eyebrow">Less aligned</h4>
                        <p className="match__terms match__terms--muted">
                          {match.differences.join(' · ')}
                        </p>
                      </div>
                    )}

                    {match.reasons.length === 0 && match.differences.length === 0 && (
                      <p className="u-meta">
                        These two share a general feeling more than any single word.
                      </p>
                    )}

                    <Button
                      variant={addedTo.has(match.playlistId) ? 'ghost' : 'quiet'}
                      size="sm"
                      disabled={addedTo.has(match.playlistId)}
                      onClick={() => onAdd(match.playlistId)}
                    >
                      {addedTo.has(match.playlistId)
                        ? `In ${playlist.name}`
                        : `Add to ${playlist.name}`}
                    </Button>
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
