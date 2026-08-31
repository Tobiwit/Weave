import { useId } from 'react';
import './ui.css';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label: string;
  loading?: boolean;
  autoFocus?: boolean;
}

export function SearchField({
  value,
  onChange,
  placeholder = 'Search for a song',
  label,
  loading = false,
  autoFocus = false,
}: SearchFieldProps) {
  const id = useId();

  return (
    <div className="search">
      <label className="u-sr" htmlFor={id}>
        {label}
      </label>
      <svg
        className="search__icon"
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="5.6" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M12.4 12.4 16 16"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
      <input
        id={id}
        className="search__input"
        type="search"
        inputMode="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {loading && <span className="search__spinner" aria-hidden="true" />}
      {!loading && value && (
        <button
          type="button"
          className="search__clear"
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </div>
  );
}
