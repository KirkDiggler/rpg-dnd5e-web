import styles from './SessionCombatConcept.module.css';
import { SessionCombatMap } from './SessionCombatMap';
import type { SessionCombatSelection } from './sessionCombatSelection';

export type SessionCombatPhase =
  | 'fresh'
  | 'targeting'
  | 'awaiting-roll'
  | 'settled';

export interface TargetSurfaceProps {
  phase: SessionCombatPhase;
  selection: SessionCombatSelection | null;
  movementRemainingFeet: number;
  mode: 'turn' | 'free-roam';
  isViewerTurn: boolean;
  showTurnNotice: boolean;
  onTargetClick: (targetId: string) => void;
}

export function TargetSurface({
  phase,
  selection,
  movementRemainingFeet,
  mode,
  isViewerTurn,
  showTurnNotice,
  onTargetClick,
}: TargetSurfaceProps) {
  const affordableTargets =
    phase === 'targeting'
      ? (selection?.candidates
          .filter((candidate) => candidate.available)
          .map((candidate) => candidate.id) ?? [])
      : [];
  const unavailableTargets =
    phase === 'targeting'
      ? (selection?.candidates.filter((candidate) => !candidate.available) ??
        [])
      : [];

  return (
    <>
      <SessionCombatMap
        attackableTargets={affordableTargets}
        onTargetClick={onTargetClick}
      />
      <div className={styles.mapVignette} aria-hidden="true" />
      <div className={styles.roomLabel}>
        <span>Reference Tomb</span>
        <small>South reliquary</small>
      </div>
      {phase === 'fresh' &&
        mode === 'turn' &&
        isViewerTurn &&
        showTurnNotice && (
          <div className={styles.turnPrompt} data-phase="fresh">
            <span className={styles.turnPromptKicker}>Your turn</span>
            <strong>Choose an action or move</strong>
            <span>{movementRemainingFeet} ft remaining</span>
          </div>
        )}
      {phase === 'targeting' && selection && (
        <div className={styles.contextPrompt} data-phase="targeting">
          <span className={styles.turnPromptKicker}>
            {selection.offer.label} armed
          </span>
          <strong>Choose a target</strong>
          <span>
            {affordableTargets.length} highlighted target
            {affordableTargets.length === 1 ? '' : 's'}
          </span>
          {unavailableTargets.map((candidate) => (
            <small key={candidate.id} className={styles.targetShortfall}>
              {candidate.name}: {candidate.reason}
            </small>
          ))}
        </div>
      )}
      {phase === 'awaiting-roll' && selection?.target && (
        <div className={styles.contextPrompt} data-phase="awaiting-roll">
          <span className={styles.turnPromptKicker}>Attack declared</span>
          <strong>
            {selection.offer.label} → {selection.target.name}
          </strong>
          <span>Roll in the dice drawer</span>
        </div>
      )}
      {phase === 'settled' && selection?.target && (
        <div className={styles.contextPrompt} data-phase="settled">
          <span className={styles.turnPromptKicker}>Result delivered</span>
          <strong>Outcome added to Story</strong>
        </div>
      )}
    </>
  );
}
