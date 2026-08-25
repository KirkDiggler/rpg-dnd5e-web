import type {
  DicePresentationEvent,
  DicePresentationReleasedEvent,
} from '@/components/ui/dice/dicePresentationEvent';
import { DiceTrayPresentation } from '@/components/ui/dice/DiceTrayPresentation';
import styles from './CombatExperience.module.css';
import type { CombatExperiencePhase } from './types';

interface DiceDrawerBaseProps {
  phase: CombatExperiencePhase;
  events: readonly DicePresentationEvent[];
  rollerName: string;
  /** Unsafe identifier fallback; never contains or announces the result. */
  semanticFallback?: boolean;
}

interface RollerDiceDrawerProps extends DiceDrawerBaseProps {
  witnessRole: 'roller';
  onReleaseRequest: (event: DicePresentationReleasedEvent) => void;
  onSemanticReleaseRequest: () => void;
}

interface SpectatorDiceDrawerProps extends DiceDrawerBaseProps {
  witnessRole: 'spectator';
  onReleaseRequest?: never;
  onSemanticReleaseRequest?: never;
}

/** Active callbacks are structurally unavailable to a spectator. */
export type DiceDrawerProps = RollerDiceDrawerProps | SpectatorDiceDrawerProps;

export function DiceDrawer(props: DiceDrawerProps) {
  const {
    phase,
    events,
    rollerName,
    semanticFallback = false,
    witnessRole,
  } = props;
  const expanded = phase === 'awaiting-roll' || phase === 'settled';
  const roller = witnessRole === 'roller';
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
            {phase === 'awaiting-roll'
              ? roller
                ? 'Attack ready'
                : 'Attack die'
              : 'Result released'}
          </span>
          <strong>
            {roller
              ? 'Roll your carved iron d20'
              : `${rollerName}’s carved iron d20`}
          </strong>
        </div>
        <small>
          {phase === 'awaiting-roll' && roller
            ? 'Roll or grab and release'
            : phase === 'awaiting-roll'
              ? 'Read-only presentation'
              : 'Authoritative face: presented'}
        </small>
      </header>
      <div className={styles.dicePresentationStage}>
        {semanticFallback ? (
          <div>
            <p role="status" aria-live="polite">
              {phase === 'settled' || !roller
                ? 'Dice presentation unavailable · authoritative event shown in Story'
                : 'Dice presentation unavailable · result remains concealed'}
            </p>
            {phase === 'awaiting-roll' && roller && (
              <button type="button" onClick={props.onSemanticReleaseRequest}>
                Reveal result
              </button>
            )}
          </div>
        ) : roller ? (
          // Provider/WebGL failure remains inside DiceTrayPresentation: its
          // truthful SVG keeps this same explicit release control available.
          <DiceTrayPresentation
            label={`${rollerName}’s attack die`}
            witnessRole="roller"
            events={events}
            onReleaseRequest={props.onReleaseRequest}
          />
        ) : (
          <DiceTrayPresentation
            label={`${rollerName}’s attack die`}
            witnessRole="spectator"
            events={events}
          />
        )}
      </div>
    </aside>
  );
}
