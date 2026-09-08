/**
 * What the player sees when the run ends.
 *
 * IT USED TO BE A MODAL, and Kirk walked into the wall that made: a full-screen
 * dim with `aria-modal`, the whole scene marked `inert`, and focus dragged onto
 * its one button. "we gotta stop that pop up we ended. no chance to look at the
 * log. a toast we won or we lost is sufficient. if we won maybe we wanna look
 * around" (rpg-dnd5e-web#999).
 *
 * So this is a toast and nothing more. It sits in a corner, it says how the run
 * went, it fades on its own, and it can be dismissed. Behind it the story, the
 * log and the scene stay exactly as readable as they were a moment earlier —
 * winning a fight is when a player most wants to look at what they just did.
 *
 * NOTHING HERE NAVIGATES BY ITSELF. Leaving is a button, never a timer: the
 * modal's primary action kept its place and lost its power to interrupt.
 */
import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import {
  endingDetail,
  RUN_ENDED_TOAST_MS,
  runEndedHeadline,
  runOutcome,
} from './runEnding';

export function RunEndedToast({
  ending,
  carrierLine,
  onLeave,
}: {
  ending: string;
  /** Who walked out holding what, when anybody did. Absent otherwise, and
   *  never invented: a run that ended another way had no carrier. */
  carrierLine?: string;
  onLeave: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [faded, setFaded] = useState(false);

  useEffect(() => {
    setDismissed(false);
    setFaded(false);
    const timer = setTimeout(() => setFaded(true), RUN_ENDED_TOAST_MS);
    return () => clearTimeout(timer);
  }, [ending]);

  if (dismissed) return null;

  const outcome = runOutcome(ending);
  return (
    <div
      data-testid="run-ended-toast"
      data-outcome={outcome ?? 'undecided'}
      data-faded={faded}
      // A STATUS, NOT A DIALOG. `role="status"` announces the ending once to a
      // screen reader and leaves the reading order where the player left it;
      // `aria-modal` would have claimed the page again.
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute',
        zIndex: 60,
        top: 56,
        right: 16,
        maxWidth: 320,
        padding: '14px 16px',
        border: '1px solid var(--sc-line, rgba(173, 195, 202, 0.18))',
        borderRadius: 10,
        background: 'var(--bg-secondary, #1c1c22)',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)',
        opacity: faded ? 0 : 1,
        transition: 'opacity 600ms ease',
        // The fade must take the toast out of the player's way completely,
        // pointer events included, or an invisible card keeps eating clicks
        // meant for the scene underneath it.
        pointerEvents: faded ? 'none' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <strong style={{ fontSize: 16 }}>{runEndedHeadline(ending)}</strong>
        <button
          type="button"
          data-testid="run-ended-toast-dismiss"
          aria-label="Dismiss"
          onClick={() => setDismissed(true)}
          style={{
            marginLeft: 'auto',
            border: 'none',
            background: 'none',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </div>
      <p style={{ margin: '6px 0 0' }}>{endingDetail(ending)}</p>
      {carrierLine && (
        <p data-testid="run-ended-carrier" style={{ margin: '6px 0 0' }}>
          {carrierLine}
        </p>
      )}
      <div style={{ marginTop: 10 }}>
        <Button size="sm" onClick={onLeave}>
          Leave
        </Button>
      </div>
    </div>
  );
}
