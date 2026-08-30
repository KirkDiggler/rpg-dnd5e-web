import styles from './CombatExperience.module.css';

export interface LocalWorldDieTileProps {
  readonly mode: 'ready' | 'fallback';
  readonly onRevealResult?: () => void;
}

export function LocalWorldDieTile({
  mode,
  onRevealResult,
}: LocalWorldDieTileProps) {
  return (
    <aside
      data-testid="local-world-die-tile"
      className={styles.localWorldDieTile}
      aria-label="Attack die"
    >
      <span className={styles.localWorldDieToken} aria-hidden="true">
        20
      </span>
      <div>
        <strong>
          {mode === 'fallback'
            ? 'Dice presentation unavailable'
            : 'Attack die ready'}
        </strong>
        <small>
          {mode === 'fallback'
            ? 'Reveal the authoritative result'
            : 'Pick up and Roll controls arrive with live physics'}
        </small>
      </div>
      {mode === 'fallback' && (
        <button type="button" onClick={onRevealResult}>
          Reveal result
        </button>
      )}
    </aside>
  );
}
