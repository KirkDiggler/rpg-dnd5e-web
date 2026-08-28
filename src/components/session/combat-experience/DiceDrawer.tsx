import type { AttackDieTelemetry } from '@/components/ui/dice/AttackDie3D';
import type {
  DicePresentationEvent,
  DicePresentationReleasedEvent,
} from '@/components/ui/dice/dicePresentationEvent';
import { DiceTrayPresentation } from '@/components/ui/dice/DiceTrayPresentation';
import { useEffect, useRef, useState } from 'react';
import styles from './CombatExperience.module.css';
import {
  diceDrawerVisibility,
  shouldReopenForRoll,
} from './diceDrawerVisibility';
import type { CombatExperiencePhase } from './types';

interface DiceDrawerBaseProps {
  phase: CombatExperiencePhase;
  events: readonly DicePresentationEvent[];
  rollerName: string;
  /** Unsafe identifier fallback; never contains or announces the result. */
  semanticFallback?: boolean;
  /** Dice runtime telemetry. Carries the settlement observation that says the
   * die is at rest — see useDiceSettleGate.ts. Spectators watch the same die
   * animate, so both witness roles report it. */
  onDiceTelemetry?: (telemetry: AttackDieTelemetry) => void;
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
    onDiceTelemetry,
  } = props;
  const waitingForEvent = phase === 'released-waiting-event';
  const roller = witnessRole === 'roller';

  const [collapsedByUser, setCollapsedByUser] = useState(false);
  const previousPhase = useRef<CombatExperiencePhase | undefined>(undefined);

  // A new roll is the one moment this tray is a control rather than a view,
  // so a demand for it overrules a previous collapse — see
  // diceDrawerVisibility.ts.
  useEffect(() => {
    const previous = previousPhase.current;
    previousPhase.current = phase;
    if (shouldReopenForRoll(previous, phase, witnessRole)) {
      setCollapsedByUser(false);
    }
  }, [phase, witnessRole]);

  const visibility = diceDrawerVisibility(phase, collapsedByUser);

  if (visibility !== 'expanded') {
    const reopenable = visibility === 'collapsed';
    return (
      <aside
        data-testid="session-combat-dice-drawer"
        className={styles.diceDrawer}
        data-visibility={visibility}
        aria-label="Dice drawer"
      >
        <div className={styles.dieIcon} aria-hidden="true">
          <span>20</span>
        </div>
        <div>
          <span className={styles.panelEyebrow}>Your dice</span>
          <strong>Carved iron d20</strong>
          <small>
            {reopenable
              ? 'Tray hidden · open it to roll'
              : 'Ready when an action calls for a roll'}
          </small>
        </div>
        {reopenable ? (
          <button
            type="button"
            data-testid="session-combat-dice-drawer-toggle"
            className={styles.diceDrawerCue}
            aria-expanded={false}
            aria-label="Show the dice tray"
            onClick={() => setCollapsedByUser(false)}
          >
            ⌃
          </button>
        ) : (
          // Idle: nothing behind it to open, so the chevron is decoration.
          <span className={styles.diceDrawerCue} aria-hidden="true">
            ⌃
          </span>
        )}
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
            {waitingForEvent
              ? 'Reveal requested'
              : phase === 'awaiting-roll'
                ? roller
                  ? 'Attack ready'
                  : 'Attack die'
                : 'Result released'}
          </span>
          <strong>
            {waitingForEvent
              ? 'Waiting for authoritative outcome'
              : roller
                ? 'Roll your carved iron d20'
                : `${rollerName}’s carved iron d20`}
          </strong>
        </div>
        <div className={styles.diceDrawerHeaderEnd}>
          <small>
            {waitingForEvent
              ? 'Reveal consumed · awaiting typed event'
              : phase === 'awaiting-roll' && roller
                ? 'Roll or grab and release'
                : phase === 'awaiting-roll'
                  ? 'Read-only presentation'
                  : 'Authoritative face: presented'}
          </small>
          <button
            type="button"
            data-testid="session-combat-dice-drawer-toggle"
            className={styles.diceDrawerCue}
            aria-expanded
            aria-label="Collapse the dice tray"
            onClick={() => setCollapsedByUser(true)}
          >
            ⌄
          </button>
        </div>
      </header>
      <div className={styles.dicePresentationStage}>
        {semanticFallback ? (
          <div>
            <p role="status" aria-live="polite">
              {waitingForEvent
                ? 'Reveal received · waiting for the authoritative outcome'
                : phase === 'settled' || !roller
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
            onTelemetry={onDiceTelemetry}
          />
        ) : (
          <DiceTrayPresentation
            label={`${rollerName}’s attack die`}
            witnessRole="spectator"
            events={events}
            onTelemetry={onDiceTelemetry}
          />
        )}
      </div>
    </aside>
  );
}
