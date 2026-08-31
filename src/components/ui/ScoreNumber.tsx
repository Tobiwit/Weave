import './ui.css';

interface ScoreNumberProps {
  value: number;
  size?: 'sm' | 'md' | 'lg';
  showUnit?: boolean;
}

/** A Match Score, never a probability. */
export function ScoreNumber({ value, size = 'md', showUnit = false }: ScoreNumberProps) {
  return (
    <span className={`score${size === 'sm' ? ' score--sm' : ''}${size === 'lg' ? ' score--lg' : ''}`}>
      <span className="score__value">{Math.round(value)}</span>
      {showUnit && <span className="score__unit">% match</span>}
    </span>
  );
}
