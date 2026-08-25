import {
  TargetKind,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import styles from './CombatExperience.module.css';
import type { SelectedCombatExperience } from './selection';
import type {
  CombatExperienceMapRenderProps,
  CombatExperiencePhase,
} from './types';

export interface TargetSurfaceProps {
  phase: CombatExperiencePhase;
  selection: SelectedCombatExperience | null;
  movementRemainingFeet?: number;
  isViewerTurn: boolean;
  showTurnNotice: boolean;
  participantNames: ReadonlyMap<string, string>;
  location: { name: string; area: string };
  renderMap: (props: CombatExperienceMapRenderProps) => React.ReactNode;
  onTargetClick: (targetId: string) => void;
}

export function TargetSurface({
  phase,
  selection,
  movementRemainingFeet,
  isViewerTurn,
  showTurnNotice,
  participantNames,
  location,
  renderMap,
  onTargetClick,
}: TargetSurfaceProps) {
  const declaration = selection?.declaration;
  const isMemberAttack =
    declaration?.verb === Verb.ATTACK &&
    declaration.targetKind === TargetKind.MEMBER;
  const availableTargets =
    phase === 'targeting' && isMemberAttack
      ? declaration.candidates
          .filter((candidate) => candidate.available)
          .map((candidate) => candidate.member)
      : [];
  const unavailableTargets =
    phase === 'targeting' && isMemberAttack
      ? declaration.candidates.filter((candidate) => !candidate.available)
      : [];
  const attackName = declaration?.attack?.name || 'Attack';
  const targetName = selection?.candidate
    ? participantNames.get(selection.candidate.member) ||
      selection.candidate.member
    : null;

  return (
    <>
      {renderMap({ attackableTargets: availableTargets, onTargetClick })}
      <div className={styles.mapVignette} aria-hidden="true" />
      <div className={styles.roomLabel}>
        <span>{location.name}</span>
        <small>{location.area}</small>
      </div>
      {phase === 'fresh' && isViewerTurn && showTurnNotice && (
        <div className={styles.turnPrompt} data-phase="fresh">
          <span className={styles.turnPromptKicker}>Your turn</span>
          <strong>Choose an action or move</strong>
          {movementRemainingFeet !== undefined && (
            <span>{movementRemainingFeet} ft remaining</span>
          )}
        </div>
      )}
      {phase === 'targeting' && isMemberAttack && (
        <div className={styles.contextPrompt} data-phase="targeting">
          <span className={styles.turnPromptKicker}>{attackName} armed</span>
          <strong>Choose a target</strong>
          <span>
            {availableTargets.length} highlighted target
            {availableTargets.length === 1 ? '' : 's'}
          </span>
          {unavailableTargets.map((candidate) => (
            <small key={candidate.member} className={styles.targetShortfall}>
              {participantNames.get(candidate.member) || candidate.member}:{' '}
              {candidate.why?.text || 'Unavailable'}
            </small>
          ))}
        </div>
      )}
      {phase === 'awaiting-roll' && targetName && (
        <div className={styles.contextPrompt} data-phase="awaiting-roll">
          <span className={styles.turnPromptKicker}>Attack declared</span>
          <strong>
            {attackName} → {targetName}
          </strong>
          <span>Roll in the dice drawer</span>
        </div>
      )}
      {phase === 'released-waiting-event' && targetName && (
        <div
          className={styles.contextPrompt}
          data-phase="released-waiting-event"
        >
          <span className={styles.turnPromptKicker}>Reveal requested</span>
          <strong>Waiting for authoritative outcome</strong>
          <span>The result will appear when the combat event arrives</span>
        </div>
      )}
      {phase === 'settled' && targetName && (
        <div className={styles.contextPrompt} data-phase="settled">
          <span className={styles.turnPromptKicker}>Result delivered</span>
          <strong>Outcome added to Story</strong>
        </div>
      )}
    </>
  );
}
