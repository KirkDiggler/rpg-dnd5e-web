import type { DiceRollGroupInput, DiceRollModifier } from './diceRollGroup';
import type { RollGroupDieAppearance } from './RollGroupPresentation';
import type { RerollBatch } from './rollGroupPresentationModel';
import type { RollGroupPresentationState } from './rollGroupPresentationState';

interface RollGroupNarrationFact {
  readonly key: string;
  readonly text: string;
}

function fact(key: string, text: string): RollGroupNarrationFact {
  return Object.freeze({ key, text });
}

function contributorLabel(
  dieId: string,
  contributorMemberId: string,
  appearances: readonly RollGroupDieAppearance[]
) {
  return (
    appearances.find((appearance) => appearance.dieId === dieId)
      ?.contributorLabel ?? contributorMemberId
  );
}

function modifierText(modifier: DiceRollModifier) {
  if (typeof modifier.value === 'number') {
    const value =
      modifier.value > 0 ? `+${modifier.value}` : String(modifier.value);
    return `${value} ${modifier.displayLabel}`;
  }
  return `${modifier.displayLabel} — ${modifier.text}`;
}

function originalsAreVisible(phase: RollGroupPresentationState['phase']) {
  return phase !== 'armed' && phase !== 'rolling-originals';
}

function visibleRerollCount(
  state: RollGroupPresentationState,
  batches: readonly RerollBatch[]
) {
  if (state.phase === 'reroll-flash' || state.phase === 'rerolling')
    return Math.min(state.rerollIndex + 1, batches.length);
  if (state.phase === 'modifiers' || state.phase === 'complete')
    return batches.length;
  return 0;
}

export function createRollGroupNarrationFacts(input: {
  readonly group: DiceRollGroupInput;
  readonly state: RollGroupPresentationState;
  readonly rerollBatches: readonly RerollBatch[];
  readonly appearances: readonly RollGroupDieAppearance[];
  readonly visibleModifierCount: number;
}): readonly RollGroupNarrationFact[] {
  const { group, state, rerollBatches, appearances, visibleModifierCount } =
    input;
  const facts: RollGroupNarrationFact[] = [];

  if (originalsAreVisible(state.phase)) {
    for (const die of group.dice) {
      facts.push(
        fact(
          `original:${die.id}`,
          `Original ${die.kind} ${die.originalFace} from ${die.sourceLabel}, contributed by ${contributorLabel(die.id, die.contributorMemberId, appearances)}.`
        )
      );
    }
  }

  for (const batch of rerollBatches.slice(
    0,
    visibleRerollCount(state, rerollBatches)
  )) {
    const transitions = batch.entries.flatMap((entry) => {
      const die = group.dice.find((candidate) => candidate.id === entry.dieId);
      return die
        ? [
            `${die.kind} ${entry.step.before} → ${entry.step.after} from ${die.sourceLabel}, contributed by ${contributorLabel(die.id, die.contributorMemberId, appearances)}`,
          ]
        : [];
    });
    if (transitions.length > 0) {
      facts.push(
        fact(
          `reroll:${batch.occurrenceKey}`,
          `${batch.displayLabel} reroll: ${transitions.join('; ')}.`
        )
      );
    }
  }

  const orderedModifiers = [...group.modifiers].sort(
    (first, second) => first.order - second.order
  );
  for (const modifier of orderedModifiers.slice(0, visibleModifierCount)) {
    facts.push(
      fact(
        `modifier:${modifier.id}`,
        `Modifier ${modifier.order + 1}: ${modifierText(modifier)}.`
      )
    );
  }

  if (state.phase === 'complete') {
    if (group.suppliedFinalTotal !== undefined)
      facts.push(
        fact(
          'final-total',
          `Final supplied total: ${group.suppliedFinalTotal}.`
        )
      );
    if (group.verdictLabel)
      facts.push(fact('verdict', `Verdict: ${group.verdictLabel}.`));
    if (group.impactLabel)
      facts.push(fact('impact', `Impact: ${group.impactLabel}.`));
  }

  return Object.freeze(facts);
}
