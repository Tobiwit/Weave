import { useState } from 'react';
import { useSongSearch } from '../../hooks/useSongSearch';
import type { Song } from '../../types';
import { SearchField } from '../ui/SearchField';
import { SongRow } from '../ui/SongRow';
import './playlist.css';

interface SongPickerProps {
  onPick: (song: Song) => void;
  excludeIds?: string[];
  label?: string;
}

/** The same search component used on Analyze, reused for example songs. */
export function SongPicker({ onPick, excludeIds = [], label = 'Add a song' }: SongPickerProps) {
  const [query, setQuery] = useState('');
  const { results, loading } = useSongSearch(query);

  const excluded = new Set(excludeIds);
  const visible = results.filter((song) => !excluded.has(song.id)).slice(0, 5);

  return (
    <div className="picker">
      <SearchField
        value={query}
        onChange={setQuery}
        label={label}
        placeholder="Search a song"
        loading={loading}
      />
      {visible.length > 0 && (
        <ul className="picker__results">
          {visible.map((song) => (
            <li key={song.id}>
              <SongRow
                song={song}
                size={40}
                onSelect={(picked) => {
                  onPick(picked);
                  setQuery('');
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
