import { useState } from 'react';
import { Chip, ChipRow } from '../ui/Chip';
import './playlist.css';

interface KeywordInputProps {
  keywords: string[];
  onChange: (keywords: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}

/**
 * Freeform descriptors. No predefined categories: a playlist world can be
 * "walking home at 2am" just as easily as "synthpop".
 */
export function KeywordInput({
  keywords,
  onChange,
  placeholder = 'dreamy, nighttime, 70s…',
  suggestions = [],
}: KeywordInputProps) {
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const value = raw.trim().replace(/,$/, '');
    if (!value) return;
    if (keywords.some((k) => k.toLowerCase() === value.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...keywords, value]);
    setDraft('');
  };

  const remove = (keyword: string) =>
    onChange(keywords.filter((k) => k !== keyword));

  const unused = suggestions.filter(
    (s) => !keywords.some((k) => k.toLowerCase() === s.toLowerCase()),
  );

  return (
    <div className="kw">
      <ChipRow>
        {keywords.map((keyword) => (
          <Chip key={keyword} strong onRemove={() => remove(keyword)}>
            {keyword}
          </Chip>
        ))}
      </ChipRow>

      <input
        className="kw__input"
        value={draft}
        placeholder={keywords.length === 0 ? placeholder : 'Add another'}
        aria-label="Add a descriptor"
        onChange={(event) => {
          const value = event.target.value;
          // A comma is the natural separator when typing several at once.
          if (value.endsWith(',')) add(value);
          else setDraft(value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            add(draft);
          }
          if (event.key === 'Backspace' && !draft && keywords.length > 0) {
            remove(keywords[keywords.length - 1]);
          }
        }}
        onBlur={() => add(draft)}
      />

      {unused.length > 0 && (
        <div className="kw__suggestions">
          <ChipRow>
            {unused.slice(0, 6).map((suggestion) => (
              <Chip key={suggestion} onClick={() => add(suggestion)}>
                + {suggestion}
              </Chip>
            ))}
          </ChipRow>
        </div>
      )}
    </div>
  );
}
