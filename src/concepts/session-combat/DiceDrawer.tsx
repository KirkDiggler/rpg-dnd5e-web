import type {
  DicePresentationEvent,
  DicePresentationReleasedEvent,
} from '@/components/ui/dice/dicePresentationEvent';
import { DiceTrayPresentation } from '@/components/ui/dice/DiceTrayPresentation';
import styles from './SessionCombatConcept.module.css';
import type { SessionCombatPhase } from './TargetSurface';

export interface DiceDrawerProps {
  phase: SessionCombatPhase;
  events: readonly DicePresentationEvent[];
  onReleaseRequest: (event: DicePresentationReleasedEvent) => void;
}

export function DiceDrawer({
  phase,
  events,
  onReleaseRequest,
}: DiceDrawerProps) {
  const expanded = phase === 'awaiting-roll' || phase === 'settled';
  if (!expanded) {
    return (
      <aside
        data-testid="session-combat-dice-drawer"
        className={styles.diceDrawer}
        aria-label="Dice drawer"
      >
        <div className={styles.dieIcon} aria-hidden="true">
          <span>20</span>
        </div>
        <div>
          <span className={styles.panelEyebrow}>Your dice</span>
          <strong>Carved iron d20</strong>
          <small>Ready when an action calls for a roll</small>
        </div>
        <button type="button" aria-label="Expand dice drawer">
          ⌃
        </button>
      </aside>
    );
  }

  return (
    <aside
      data-testid="session-combat-dice-drawer"
      className={`${styles.diceDrawer} ${styles.diceDrawerExpanded}`}
      aria-label="Dice drawer"
    >
      <header className={styles.diceDrawerHeader}>
        <div>
          <span className={styles.panelEyebrow}>
            {phase === 'awaiting-roll' ? 'Attack ready' : 'Result released'}
          </span>
          <strong>Roll your carved iron d20</strong>
        </div>
        <small>
          {phase === 'awaiting-roll'
            ? 'Roll or grab and release'
            : 'Authoritative face: presented'}
        </small>
      </header>
      <div className={styles.dicePresentationStage}>
        <DiceTrayPresentation
          label="Aldric’s attack die"
          witnessRole="roller"
          events={events}
          onReleaseRequest={onReleaseRequest}
        />
      </div>
    </aside>
  );
}
