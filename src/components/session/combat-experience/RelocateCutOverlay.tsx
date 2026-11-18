import type { CSSProperties } from 'react';
import { CUT_IN_MS, CUT_OUT_MS, type RelocateCut } from './relocateCut';
import styles from './RelocateCutOverlay.module.css';

/** The veil's look in each phase: fade to dark, hold dark, fade back. */
function veilStyle(cut: RelocateCut): CSSProperties {
  if (cut.reduced || cut.phase === 'hold') return { opacity: 1 };
  return cut.phase === 'out'
    ? { animation: `${styles.fadeOut} ${CUT_OUT_MS}ms ease forwards` }
    : { animation: `${styles.fadeIn} ${CUT_IN_MS}ms ease forwards` };
}

/**
 * The cut's veil (rpg-project#925): over the whole game frame, it takes every
 * pointer while it plays, and shows the authored words while the view is
 * dark. Opacity is the only animation; with reduced motion there is none.
 */
export function RelocateCutOverlay({ cut }: { cut: RelocateCut | null }) {
  if (!cut) return null;
  return (
    <div
      className={styles.veil}
      data-testid="relocate-cut"
      data-phase={cut.phase}
      data-reduced={cut.reduced ? 'true' : undefined}
      role="status"
      aria-live="assertive"
      style={veilStyle(cut)}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {cut.words && cut.phase === 'hold' && (
        <p className={styles.words}>{cut.words}</p>
      )}
    </div>
  );
}
