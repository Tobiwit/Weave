import { OrbitWeave, type OrbitMode } from './OrbitWeave';

interface WeaveMarkProps {
  size?: number;
  /** Kept for callers that still pass it; the mark no longer needs ids. */
  idSuffix?: string;
  className?: string;
  mode?: OrbitMode;
  tone?: 'light' | 'ink';
}

/**
 * The Weave symbol at logo size: the five half circles drawn at rest, fanned
 * so they read as five. The full animated mark is `OrbitWeave`.
 */
export function WeaveMark({ size = 28, className, mode = 'still', tone = 'light' }: WeaveMarkProps) {
  return (
    <OrbitWeave
      size={size}
      mode={mode}
      tone={tone}
      weight={size < 32 ? 1.5 : 1}
      className={className}
      label="Weave"
    />
  );
}
