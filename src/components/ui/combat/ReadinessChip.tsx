/**
 * ReadinessChip — a small pill that answers "can I use this, is it waiting
 * on me, or is it gone?" for reactions and similar readiness toggles
 * (rpg-dnd5e-web#525: the Opportunity Attack chip read as a pressed toggle;
 * nobody could tell whether it was on, off, or clickable).
 *
 * The four states are distinguishable WITHOUT color: each has its own
 * glyph, `spent` strikes through its label, `unavailable` switches to a
 * dashed border, and `armed` pulses. Color reinforces, never carries.
 *
 * Purely presentational: the server decides what state a readiness is in;
 * this only renders it and reports clicks.
 */

import { cn } from '../../../utils/cn';

export type ReadinessState = 'ready' | 'armed' | 'spent' | 'unavailable';

const STATE_GLYPH: Record<ReadinessState, string> = {
  ready: '◉',
  armed: '➤',
  spent: '✓',
  unavailable: '—',
};

const STATE_HINT: Record<ReadinessState, string> = {
  ready: 'Ready',
  armed: 'Armed — will trigger automatically',
  spent: 'Already used this round',
  unavailable: 'Not available right now',
};

export interface ReadinessChipProps {
  /** User-facing name, e.g. "Opportunity Attack". */
  label: string;
  state: ReadinessState;
  /** Present = clickable; the chip stays non-interactive without it. */
  onClick?: () => void;
  /** Overrides the default per-state tooltip, e.g. a server-given reason. */
  title?: string;
  className?: string;
}

export function ReadinessChip({
  label,
  state,
  onClick,
  title,
  className,
}: ReadinessChipProps) {
  const interactive = onClick !== undefined && state !== 'unavailable';
  const hint = title ?? STATE_HINT[state];

  return (
    <button
      type="button"
      className={cn(
        'readiness-chip',
        `state-${state}`,
        interactive && 'interactive',
        className
      )}
      onClick={interactive ? onClick : undefined}
      disabled={!interactive}
      title={hint}
      aria-label={`${label}: ${hint}`}
      aria-pressed={state === 'armed'}
    >
      <span aria-hidden="true">{STATE_GLYPH[state]}</span>
      <span className="readiness-chip-label">{label}</span>
    </button>
  );
}
