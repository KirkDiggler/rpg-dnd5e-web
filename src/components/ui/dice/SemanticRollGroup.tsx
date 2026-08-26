import type { DiceMotionPose } from './diceMotionSolver';
import type { DiceRollGroupDie, DiceRollGroupInput } from './diceRollGroup';
import type { DiceMaterialTreatment } from './materialFreeCarvedMesh';
import { RollGroupDie3D, type RollGroupDie3DProps } from './RollGroupDie3D';
import type { RollGroupPresentationState } from './rollGroupPresentationState';

export interface SemanticRollGroupProps {
  readonly group: DiceRollGroupInput;
  readonly presentation: RollGroupPresentationState;
  readonly presentationToken?: number;
  readonly treatment?: DiceMaterialTreatment;
  readonly poses?: Readonly<Record<string, DiceMotionPose>>;
  readonly onReady?: RollGroupDie3DProps['onReady'];
  readonly onFailure?: RollGroupDie3DProps['onFailure'];
  readonly onReleaseRequest?: () => void;
  readonly renderDice3D?: boolean;
}

const DEFAULT_TREATMENT: DiceMaterialTreatment = Object.freeze({
  bodyColor: '#15233b',
  numeralColor: '#f5eddc',
  roughness: 0.72,
  metalness: 0.08,
});
const IDENTITY_POSE: DiceMotionPose = Object.freeze({
  quaternion: Object.freeze([0, 0, 0, 1] as const),
  translation: Object.freeze([0, 0, 0] as const),
  shadow: Object.freeze({
    translation: Object.freeze([0, 0, 0] as const),
    scale: 1,
    opacity: 0.3,
  }),
  observeNow: false,
  exactTargetHeld: false,
  failed: false,
});

type VisibleFace = number | undefined;

function rerollAt(die: DiceRollGroupDie, index: number) {
  return die.rerolls[index];
}

function visibleFace(
  die: DiceRollGroupDie,
  presentation: RollGroupPresentationState
): VisibleFace {
  if (
    presentation.phase === 'armed' ||
    presentation.phase === 'rolling-originals'
  )
    return undefined;
  if (
    presentation.phase === 'settled-originals' ||
    presentation.phase === 'reroll-flash'
  )
    return die.originalFace;
  if (presentation.phase === 'rerolling') {
    const current = rerollAt(die, presentation.rerollIndex);
    return current?.after ?? die.originalFace;
  }
  return die.finalFace;
}

function currentRerollLabel(
  dice: readonly DiceRollGroupDie[],
  presentation: RollGroupPresentationState
) {
  if (presentation.phase !== 'rerolling') return undefined;
  for (const die of dice) {
    const reroll = rerollAt(die, presentation.rerollIndex);
    if (reroll) return `Reroll ${reroll.before} → ${reroll.after}`;
  }
  return undefined;
}

export function SemanticRollGroup({
  group,
  presentation,
  presentationToken = 0,
  treatment = DEFAULT_TREATMENT,
  poses,
  onReady,
  onFailure,
  onReleaseRequest,
  renderDice3D = true,
}: SemanticRollGroupProps) {
  const rerollLabel = currentRerollLabel(group.dice, presentation);
  return (
    <section
      data-testid="semantic-roll-group"
      aria-label={`${group.key} dice roll group`}
      className="semantic-roll-group"
    >
      <div className="semantic-roll-group__dice">
        {group.dice.map((die, index) => {
          const face = visibleFace(die, presentation);
          return (
            <div
              className="semantic-roll-group__die"
              data-testid={`semantic-roll-group-die-${die.id}`}
              key={die.id}
            >
              <output>{`${die.kind} ${face ?? '?'}`}</output>
              {face !== undefined && renderDice3D ? (
                <RollGroupDie3D
                  die={die}
                  displayedFace={face}
                  presentationToken={presentationToken + index}
                  pose={poses?.[die.id] ?? IDENTITY_POSE}
                  treatment={treatment}
                  onReady={onReady}
                  onFailure={onFailure}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      {presentation.phase === 'armed' && onReleaseRequest ? (
        <button type="button" onClick={() => onReleaseRequest()}>
          Roll dice
        </button>
      ) : null}
      {rerollLabel ? (
        <p data-testid="semantic-roll-group-reroll">{rerollLabel}</p>
      ) : null}
      {group.modifiers.length > 0 && presentation.phase !== 'armed' ? (
        <ul aria-label="Roll modifiers">
          {group.modifiers.map((modifier) => (
            <li key={modifier.id}>
              {modifier.displayLabel}:{' '}
              {'value' in modifier ? modifier.value : modifier.text}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
