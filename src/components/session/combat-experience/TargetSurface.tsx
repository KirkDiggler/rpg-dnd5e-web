import {
  FootprintOrigin,
  FootprintShape,
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
import { promptsForMember } from './verbRegistry';

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
  navigationControls?: React.ReactNode;
  renderMap: (props: CombatExperienceMapRenderProps) => React.ReactNode;
  onTargetClick: (targetId: string) => void;
  onConfirmTargets?: () => void;
  /** Clears a local selection only; no command is sent. */
  onCancelSelection?: () => void;
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
  navigationControls,
  renderMap,
  onTargetClick,
  onConfirmTargets,
  onCancelSelection,
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
  //
  // AND SO DOES A THREAT (rpg-project#454). Afford rules who may be
  // threatened too — everyone who can see the actor, with no reach gate —
  // and left out of this line the one goblin the server named would be the
  // one goblin nobody could click, which is the failure this comment already
  // records once for the armed activation.
  //
  // ASKED OF THE ONE REGISTRY (rpg-dnd5e-web#1104). This used to be the fifth
  // of six hand-written verb lists, and a verb left out of it meant the one
  // creature the server named was the one creature nobody could click.
  const isMemberTargeted =
    promptsForMember(declaration?.verb) &&
    declaration?.targetKind === TargetKind.MEMBER;
  // A CAST THE CASTER AIMS PROMPTS TOO, and prompts for a place. It names no
  // candidates, so none of the member machinery below applies to it — no
  // highlighted ring, no list, no cardinality. What it needs is the one
  // sentence telling the player the next click goes on the floor.
  const isCellTargeted =
    declaration?.verb === Verb.CAST &&
    declaration.targetKind === TargetKind.CELL;
  const availableTargets =
    phase === 'targeting' && isMemberTargeted
      ? declaration.candidates
          .filter((candidate) => candidate.available)
          .map((candidate) => candidate.member)
      : [];
  // The server authors the label for both verbs; there is no ref-to-name
  // table here, and "Attack" is only the last resort for an attack.
  // A THREAT NAMES ITSELF, and is the one armed row with no server-authored
  // label to prefer: it compiles no action definition, so there is no
  // AttackRef and no AbilityRef to read and nothing here to go stale against
  // content.
  const armedName =
    declaration?.verb === Verb.ACTIVATE
      ? declaration.ability?.name || 'Ability'
      : declaration?.verb === Verb.CAST
        ? castLabel(declaration)
        : declaration?.verb === Verb.INTIMIDATE
          ? 'Intimidate'
          : declaration?.verb === Verb.PERSUADE
            ? 'Persuade'
            : declaration?.attack?.name || 'Attack';
  const targetName = selection?.candidate
    ? memberNames.get(selection.candidate.member) || selection.candidate.member
    : null;
  const selectedTargets = selection?.selectedCandidates ?? [];
  const isMultiTargetCast =
    declaration?.verb === Verb.CAST && declaration.maxTargets > 1;
  const castCost = declaration?.cost
    .filter((component) => component.needed > 0 && component.label)
    .map((component) => `${component.needed} ${component.label}`)
    .join(', ');

  return (
    <>
      {renderMap({ attackableTargets: availableTargets, onTargetClick })}
      <div className={styles.mapVignette} aria-hidden="true" />
      <div
        className={`${styles.roomLabel} ${navigationControls ? styles.roomLabelWithNavigation : ''}`}
      >
        {navigationControls && (
          <nav aria-label="Session navigation">{navigationControls}</nav>
        )}
        <div className={styles.locationText}>
          <span title={location.name}>{location.name}</span>
          <small>{location.area}</small>
        </div>
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
      {phase === 'targeting' && isCellTargeted && (
        <div className={styles.contextPrompt} data-phase="targeting">
          <span className={styles.turnPromptKicker}>{armedName} armed</span>
          <strong>
            {declaration.footprint?.shape === FootprintShape.TRIANGLE
              ? 'Move the pointer to rotate the area; click to cast'
              : declaration.footprint?.origin === FootprintOrigin.POINT
                ? 'Pick a cell to place the area; click to cast'
                : 'Pick a cell to aim toward'}
          </strong>
          {castCost && <span>{castCost}</span>}
          {onCancelSelection && (
            <button
              type="button"
              className={styles.targetChoice}
              onClick={onCancelSelection}
            >
              Cancel targeting
            </button>
          )}
        </div>
      )}
      {phase === 'targeting' && isMemberTargeted && (
        <div className={styles.contextPrompt} data-phase="targeting">
          <span className={styles.turnPromptKicker}>{armedName} armed</span>
          <strong>
            {declaration.verb === Verb.CAST
              ? declaration.minTargets === 1 && declaration.maxTargets === 1
                ? 'Choose a target'
                : declaration.minTargets === declaration.maxTargets
                  ? `Choose ${declaration.minTargets} targets`
                  : `Choose ${declaration.minTargets}–${declaration.maxTargets} targets`
              : 'Choose a target'}
          </strong>
          <span>
            {isMultiTargetCast
              ? `${selectedTargets.length}/${declaration.maxTargets} selected`
              : `${availableTargets.length} highlighted target${availableTargets.length === 1 ? '' : 's'}`}
          </span>
          {castCost && <span>{castCost}</span>}
          <ul className={styles.targetList} aria-label={`${armedName} targets`}>
            {declaration.candidates.map((candidate, index) => {
              const name =
                memberNames.get(candidate.member) || candidate.member;
              const selectedIndex = selectedTargets.findIndex(
                (selected) => selected.member === candidate.member
              );
              const atTargetLimit =
                isMultiTargetCast &&
                selectedTargets.length >= declaration.maxTargets &&
                selectedIndex < 0;
              const status =
                selectedIndex >= 0
                  ? `Selected ${selectedIndex + 1}`
                  : atTargetLimit
                    ? 'Target limit reached'
                    : candidate.available
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
                    disabled={!candidate.available || atTargetLimit}
                    onClick={() => {
                      if (candidate.available && !atTargetLimit) {
                        onTargetClick(candidate.member);
                      }
                    }}
                  >
                    {name}: {status}
                  </button>
                </li>
              );
            })}
          </ul>
          {isMultiTargetCast && onConfirmTargets && (
            <button
              type="button"
              className={styles.targetChoice}
              disabled={
                selectedTargets.length < declaration.minTargets ||
                selectedTargets.length > declaration.maxTargets
              }
              onClick={onConfirmTargets}
            >
              Cast at selected targets
            </button>
          )}
          {onCancelSelection && (
            <button
              type="button"
              className={styles.targetChoice}
              onClick={onCancelSelection}
            >
              Cancel targeting
            </button>
          )}
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
