/**
 * ContextPill (round 6, promoted to ui/combat in #525 slice 2) — Kirk:
 * "'your turn — pick an action' is vertical space we do not need to take
 * up."
 *
 * The teaching surface as a FLOATING pill anchored just above the dock:
 * position:absolute, zero layout height — the map gets the freed row. It
 * appears ONLY when pillMessage has something non-obvious to say (armed
 * guidance, spectator, free-roam, ended, nothing-left, connecting); the
 * plain your-turn state shows nothing. This evolves the #533 teaching
 * layer: teaching appears when needed, never as standing furniture.
 *
 * Purely presentational: callers compute the messages (live dock from
 * stream state, concepts from fixtures) via contextMessage/pillMessage —
 * one seam, no drift.
 *
 * Accessibility: a visually-hidden aria-live region stays in the DOM with
 * the FULL announcement stream (including the your-turn line screen
 * readers still want); the pill is the visual layer only. Render inside a
 * position:relative, non-clipping ancestor (the DockShell/dock outer div).
 */

import type { MessageTone } from './contextMessage';

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
  /** The visual pill message — null renders no pill (plain your-turn). */
  pill: { text: string; tone: MessageTone } | null;
  /** The full announcement stream for assistive tech — never null. */
  announce: string;
  /** Floor-viewport scale (the HUD-skinned live dock / composition D). */
  large?: boolean;
}

export function ContextPill({
  pill,
  announce,
  large = false,
}: ContextPillProps) {
  return (
    <>
      {/* The live region always announces — visually it's the pill. */}
      <span role="status" aria-live="polite" style={SR_ONLY}>
        {announce}
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
