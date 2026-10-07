import {
  FootprintOrigin,
  FootprintShape,
  TargetKind,
  Verb,
  type TargetCandidate,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useEffect, useId, useState } from 'react';
import { effectLinesFor, heldEffectLinesFor } from './actionTooltip';
import { castLabel } from './castLabel';
import styles from './CombatExperience.module.css';
import { EffectRows } from './EffectRows';
import type { SelectedCombatExperience } from './selection';
import type {
  CombatExperienceMapRenderProps,
  CombatExperiencePhase,
} from './types';
import { promptsForMember } from './verbRegistry';

/** Heads the inspected candidate's held rows, visibly and for the list. */
const HELD_HEADING = 'On this target';

export interface TargetSurfaceProps {
  phase: CombatExperiencePhase;
  selection: SelectedCombatExperience | null;
  movementRemainingFeet?: number;
  isViewerTurn: boolean;
  showTurnNotice: boolean;
  pacingNotice?: string | null;
  changedOptionNotice?: string | null;
  castOptionId?: string;
  onChangeCastOption?: () => void;
  memberNames: ReadonlyMap<string, string>;
  location: { name: string; area: string };
  navigationControls?: React.ReactNode;
  renderMap: (props: CombatExperienceMapRenderProps) => React.ReactNode;
  onTargetClick: (targetId: string) => void;
  onConfirmTargets?: () => void;
  /** Clears a local selection only; no command is sent. */
  onCancelSelection?: () => void;
  /**
   * The member under the pointer on the canvas, or null. Presentation only:
   * it chooses whose effect rows are shown and never what a click does.
   */
  hoveredTarget?: string | null;
}

export function TargetSurface({
  phase,
  selection,
  movementRemainingFeet,
  isViewerTurn,
  showTurnNotice,
  pacingNotice,
  changedOptionNotice,
  castOptionId,
  onChangeCastOption,
  memberNames,
  location,
  navigationControls,
  renderMap,
  onTargetClick,
  onConfirmTargets,
  onCancelSelection,
  hoveredTarget,
}: TargetSurfaceProps) {
  const declaration = selection?.declaration;
  // WHOSE EFFECT ROWS ARE SHOWN (rpg-project#520). Two sources, kept apart
  // so they never fight:
  // - PREVIEW: the last candidate hovered or focused, in the list or on the
  //   canvas. Sticky, so the pointer can travel to the rows and the panel
  //   never flickers back between targets.
  // - PINNED: the candidate whose Effects toggle was pressed. Pinned wins over
  //   any preview until it is closed (by its toggle or the panel's Close),
  //   which is what a touch user needs; closing clears both and the panel
  //   returns to the declaration's own rows.
  // Keyed by declaration so a new armed offer starts from its own rows.
  // Reading never reaches `onTargetClick`.
  const [inspection, setInspection] = useState<{
    declarationId: string;
    preview: string | null;
    pinned: string | null;
  } | null>(null);
  const declarationId = declaration?.id;
  const current =
    inspection && inspection.declarationId === declarationId
      ? inspection
      : null;
  const preview = (member: string) => {
    if (declarationId) {
      setInspection((prior) => ({
        declarationId,
        pinned:
          prior && prior.declarationId === declarationId ? prior.pinned : null,
        preview: member,
      }));
    }
  };
  const togglePin = (member: string) => {
    if (declarationId) {
      setInspection(
        current?.pinned === member
          ? null
          : { declarationId, preview: member, pinned: member }
      );
    }
  };
  const closeInspection = () => setInspection(null);
  // WHO HAS ROWS TO INSPECT. The actor's rows bear against every candidate;
  // a target's held rows only against itself. So with no actor rows, only a
  // candidate holding something offers the panel: inspecting one that holds
  // nothing would open an empty panel, and claim nothing bears on it.
  const hasActorEffects = (declaration?.effects.length ?? 0) > 0;
  const candidateHasRows = (candidate: TargetCandidate) =>
    hasActorEffects || candidate.heldEffects.length > 0;
  const hasEffects = Boolean(declaration?.candidates.some(candidateHasRows));
  const hoveredIsCandidate = Boolean(
    hoveredTarget &&
    declaration?.candidates.some(
      (candidate) =>
        candidate.member === hoveredTarget && candidateHasRows(candidate)
    )
  );
  useEffect(() => {
    if (declarationId && hoveredTarget && hoveredIsCandidate) {
      setInspection((prior) => ({
        declarationId,
        pinned:
          prior && prior.declarationId === declarationId ? prior.pinned : null,
        preview: hoveredTarget,
      }));
    }
  }, [declarationId, hoveredTarget, hoveredIsCandidate]);
  const inspectedMember = current?.pinned ?? current?.preview ?? null;
  const effectsPanelId = useId();
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
  const optionMatches =
    declaration?.options.filter((option) => option.id === castOptionId) ?? [];
  const optionLabel =
    optionMatches.length === 1 ? optionMatches[0]?.label : undefined;
  const armedName =
    declaration?.verb === Verb.ACTIVATE
      ? declaration.ability?.name || 'Ability'
      : declaration?.verb === Verb.CAST
        ? `${castLabel(declaration)}${optionLabel ? ` · ${optionLabel}` : ''}`
        : declaration?.verb === Verb.INTIMIDATE
          ? 'Intimidate'
          : declaration?.verb === Verb.PERSUADE
            ? 'Persuade'
            : declaration?.attack?.name || 'Attack';
  const changeChoice =
    optionLabel && onChangeCastOption ? (
      <button
        type="button"
        className={styles.targetChoice}
        onClick={onChangeCastOption}
      >
        Change choice
      </button>
    ) : null;
  const targetName = selection?.candidate
    ? memberNames.get(selection.candidate.member) || selection.candidate.member
    : null;
  const selectedTargets = selection?.selectedCandidates ?? [];
  const isMultiTargetCast =
    declaration?.verb === Verb.CAST && declaration.maxTargets > 1;
  const inspectedName = inspectedMember
    ? memberNames.get(inspectedMember) || inspectedMember
    : null;
  const heldLines = declaration
    ? heldEffectLinesFor(declaration, inspectedMember)
    : [];
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
          {changeChoice}
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
          {changeChoice}
          <ul className={styles.targetList} aria-label={`${armedName} targets`}>
            {declaration.candidates.map((candidate, index) => {
              const name =
                memberNames.get(candidate.member) || candidate.member;
              const hasRows = candidateHasRows(candidate);
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
                <li
                  key={`${candidate.member}:${index}`}
                  className={hasRows ? styles.targetChoiceRow : undefined}
                  data-inspected={
                    hasRows && inspectedMember === candidate.member
                      ? 'true'
                      : undefined
                  }
                  // Mouse and pen only; a touch tap is a choice, and touch
                  // reads rows through the Effects toggle instead.
                  onPointerEnter={
                    hasRows
                      ? (event) => {
                          if (
                            event.pointerType === 'mouse' ||
                            event.pointerType === 'pen'
                          ) {
                            preview(candidate.member);
                          }
                        }
                      : undefined
                  }
                  onFocus={
                    hasRows ? () => preview(candidate.member) : undefined
                  }
                >
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
                  {hasRows && (
                    // Read-only: shows this candidate's rows, never chooses it.
                    // A toggle button whose state IS the pin (`aria-pressed`):
                    // focus or hover may already preview the rows, so the
                    // press must change something a screen reader announces.
                    // The panel it controls names whose rows it shows.
                    <button
                      type="button"
                      className={styles.targetEffectsToggle}
                      aria-pressed={current?.pinned === candidate.member}
                      aria-controls={effectsPanelId}
                      aria-label={`Effects against ${name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        togglePin(candidate.member);
                      }}
                    >
                      Effects
                    </button>
                  )}
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
      {phase === 'targeting' && isMemberTargeted && hasEffects && (
        <section
          id={effectsPanelId}
          className={styles.targetEffects}
          aria-label={
            inspectedName
              ? `${armedName} effects against ${inspectedName}`
              : `${armedName} effects`
          }
          // Small frames show the panel only for an inspected target, so the
          // map is not covered until a player asks.
          data-inspecting={inspectedName ? 'true' : undefined}
        >
          <span className={styles.targetEffectsHeading}>
            <span className={styles.turnPromptKicker}>Effects</span>
            {inspectedName && (
              <button
                type="button"
                className={styles.targetEffectsToggle}
                onClick={closeInspection}
              >
                Close
              </button>
            )}
          </span>
          <strong>
            {inspectedName ? `Against ${inspectedName}` : armedName}
          </strong>
          {!inspectedName && (
            <span className={styles.targetEffectsHint}>
              Hover, focus or open a target’s effects to see its answers
            </span>
          )}
          <EffectRows lines={effectLinesFor(declaration, inspectedMember)} />
          {heldLines.length > 0 && (
            // The target's own effects, after the actor's and apart from
            // them: never folded into, or matched against, the rows above.
            <>
              <span className={styles.targetEffectsGroup} aria-hidden="true">
                {HELD_HEADING}
              </span>
              <EffectRows lines={heldLines} label={HELD_HEADING} />
            </>
          )}
        </section>
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
