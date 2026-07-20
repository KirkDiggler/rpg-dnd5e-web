/**
 * ContextPill (round 6) — Kirk: "'your turn — pick an action' is vertical
 * space we do not need to take up."
 *
 * The teaching surface as a FLOATING pill anchored just above the dock
 * (composition E's pattern): position:absolute, zero layout height — the
 * map gets the freed row. It appears ONLY for non-obvious states (armed
 * guidance, spectator, free-roam, ended, nothing-left, connecting); the
 * plain your-turn state shows nothing — enabled verbs + the green
 * initiative highlight already say it. This evolves the #533 teaching
 * layer: teaching appears when needed, never as standing furniture.
 *
 * Accessibility: a visually-hidden aria-live region stays in the DOM with
 * the FULL message stream (including the your-turn announcement screen
 * readers still want); the pill is the visual layer only.
 */

import { contextMessage, pillMessage } from './contextMessage';
import type { CombatPanelFixture } from './fixtures';

/** Visually hidden but present for screen readers. */
const SR_ONLY: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export interface ContextPillProps {
  fixture: CombatPanelFixture;
  armedKey?: string;
  /** Round-5 floor-viewport scale (composition D). */
  large?: boolean;
}

export function ContextPill({
  fixture,
  armedKey,
  large = false,
}: ContextPillProps) {
  const armedLabel = armedKey
    ? fixture.actions.find((a) => a.ref?.id === armedKey)?.displayName
    : undefined;
  const pill = pillMessage(fixture, armedKey, armedLabel);
  const announced = contextMessage(fixture, armedKey, armedLabel);

  return (
    <>
      {/* The live region always announces — visually it's the pill. */}
      <span role="status" aria-live="polite" style={SR_ONLY}>
        {announced.text}
      </span>
      {pill && (
        <span
          data-testid="context-pill"
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '100%',
            transform: 'translateX(-50%)',
            marginBottom: 10,
            fontSize: large ? 14.5 : 12.5,
            padding: large ? '5px 18px' : '3px 14px',
            borderRadius: 9999,
            background: 'var(--bg-secondary)',
            border: `1px solid ${
              pill.tone === 'action'
                ? 'var(--accent-primary)'
                : 'var(--border-primary)'
            }`,
            color:
              pill.tone === 'quiet'
                ? 'var(--text-muted)'
                : 'var(--text-primary)',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          {pill.text}
        </span>
      )}
    </>
  );
}
