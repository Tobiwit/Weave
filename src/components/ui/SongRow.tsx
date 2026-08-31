import type { ReactNode } from 'react';
import type { Song } from '../../types';
import { Artwork } from './Artwork';
import './ui.css';

interface SongRowProps {
  song: Song;
  onSelect?: (song: Song) => void;
  aside?: ReactNode;
  size?: number;
}

function metaLine(song: Song): string {
  const release = [song.album, song.year ? String(song.year) : undefined]
    .filter(Boolean)
    .join(' · ');
  return release ? `${song.artist} · ${release}` : song.artist;
}

export function SongRow({ song, onSelect, aside, size = 52 }: SongRowProps) {
  const content = (
    <>
      <Artwork src={song.artworkUrl} seed={song.id} size={size} alt="" />
      <span className="song-row__text">
        <span className="song-row__title">{song.title}</span>
        <span className="song-row__meta">{metaLine(song)}</span>
      </span>
      {aside && <span className="song-row__aside">{aside}</span>}
    </>
  );

  if (!onSelect) {
    return <div className="song-row">{content}</div>;
  }

  return (
    <button
      type="button"
      className="song-row"
      onClick={() => onSelect(song)}
      aria-label={`Analyze ${song.title} by ${song.artist}`}
    >
      {content}
    </button>
  );
}
