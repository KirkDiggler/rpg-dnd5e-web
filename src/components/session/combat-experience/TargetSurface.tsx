import {
  TargetKind,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { castLabel } from './castLabel';
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
  pacingNotice?: string | null;
  changedOptionNotice?: string | null;
  memberNames: ReadonlyMap<string, string>;
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
  pacingNotice,
  changedOptionNotice,
  memberNames,
  location,
  renderMap,
  onTargetClick,
}: TargetSurfaceProps) {
  const declaration = selection?.declaration;
  // WHICH SIDE A CANDIDATE IS ON IS NOT A QUESTION ASKED HERE. Afford already
  // ruled who may be chosen, and it offers allies for Bardic Inspiration and
  // Help exactly as it offers enemies for an attack. Reading only ATTACK left
  // an armed activation with no highlighted candidates at all: the ally was
  // neither ringed on the canvas nor listed here, so the one member the server
  // named was the one member nobody could click.
  //
  // A CAST JOINS ON THE SAME LINE. Afford rules who a cantrip may be pointed
  // at — in range, in sight, on the right side — and a cast that names a
  // creature is a MEMBER-targeted declaration like any other.
  const isMemberTargeted =
    (declaration?.verb === Verb.ATTACK ||
      declaration?.verb === Verb.ACTIVATE ||
      declaration?.verb === Verb.CAST) &&
    declaration.targetKind === TargetKind.MEMBER;
  const availableTargets =
    phase === 'targeting' && isMemberTargeted
      ? declaration.candidates
          .filter((candidate) => candidate.available)
          .map((candidate) => candidate.member)
      : [];
  // The server authors the label for both verbs; there is no ref-to-name
  // table here, and "Attack" is only the last resort for an attack.
  const armedName =
    declaration?.verb === Verb.ACTIVATE
      ? declaration.ability?.name || 'Ability'
      : declaration?.verb === Verb.CAST
        ? castLabel(declaration)
        : declaration?.attack?.name || 'Attack';
  const targetName = selection?.candidate
    ? memberNames.get(selection.candidate.member) || selection.candidate.member
    : null;

  return (
    <>
      {renderMap({ attackableTargets: availableTargets, onTargetClick })}
      <div className={styles.mapVignette} aria-hidden="true" />
      <div className={styles.roomLabel}>
        <span>{location.name}</span>
        <small>{location.area}</small>
      </div>
      {pacingNotice && (
        <div className={styles.contextPrompt} data-phase="pacing">
          <span className={styles.turnPromptKicker}>The turn unfolds</span>
          <strong>{pacingNotice}</strong>
        </div>
      )}
      {changedOptionNotice && (
        <div className={styles.contextPrompt} data-phase="changed-option">
          <span className={styles.turnPromptKicker}>Action changed</span>
          <strong>{changedOptionNotice}</strong>
        </div>
      )}
      {phase === 'fresh' && isViewerTurn && showTurnNotice && (
        <div className={styles.turnPrompt} data-phase="fresh">
          <span className={styles.turnPromptKicker}>Your turn</span>
          <strong>Choose an action or move</strong>
          {movementRemainingFeet !== undefined && (
            <span>{movementRemainingFeet} ft remaining</span>
          )}
        </div>
      )}
      {phase === 'targeting' && isMemberTargeted && (
        <div className={styles.contextPrompt} data-phase="targeting">
          <span className={styles.turnPromptKicker}>{armedName} armed</span>
          <strong>Choose a target</strong>
          <span>
            {availableTargets.length} highlighted target
            {availableTargets.length === 1 ? '' : 's'}
          </span>
          <ul className={styles.targetList} aria-label={`${armedName} targets`}>
            {declaration.candidates.map((candidate, index) => {
              const name =
                memberNames.get(candidate.member) || candidate.member;
              const status = candidate.available
                ? 'Available'
                : `Unavailable: ${candidate.why?.text || 'Unavailable'}`;
              return (
                <li key={`${candidate.member}:${index}`}>
                  <button
                    type="button"
                    className={
                      candidate.available
                        ? styles.targetChoice
                        : `${styles.targetChoice} ${styles.targetChoiceUnavailable}`
                    }
                    disabled={!candidate.available}
                    onClick={() => {
                      if (candidate.available) onTargetClick(candidate.member);
                    }}
                  >
                    {name}: {status}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {phase === 'awaiting-roll' && targetName && (
        <div className={styles.contextPrompt} data-phase="awaiting-roll">
          <span className={styles.turnPromptKicker}>Attack declared</span>
          <strong>
            {armedName} → {targetName}
          </strong>
          <span>Roll the attack die</span>
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
