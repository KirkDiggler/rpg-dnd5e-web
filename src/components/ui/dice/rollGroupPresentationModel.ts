import type { DiceRollGroupInput, DiceRollRerollStep } from './diceRollGroup';
import type {
  DiceRollGroupEvent,
  DiceRollGroupReleasedEvent,
  DiceRollGroupRequestedEvent,
} from './diceRollGroupEvent';
import type { RollGroupPresentationState } from './rollGroupPresentationState';

export interface RerollBatchEntry {
  readonly dieId: string;
  readonly step: DiceRollRerollStep;
}

export interface RerollBatch {
  readonly occurrenceKey: string;
  readonly displayLabel: string;
  readonly entries: readonly RerollBatchEntry[];
  readonly dieIds: readonly string[];
}

export function eventIdentity(event: DiceRollGroupEvent) {
  return JSON.stringify(event);
}

export function compatibleRelease(
  request: DiceRollGroupRequestedEvent,
  release: DiceRollGroupReleasedEvent
) {
  return (
    release.presentationId === request.presentationId &&
    release.release.presentationId === request.presentationId &&
    release.release.groupKey === request.group.key
  );
}

export function profileSeed(presentationId: string) {
  let result = 2_166_136_261;
  for (const character of presentationId) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16_777_619);
  }
  return result >>> 0;
}

export function releaseEventId(presentationId: string) {
  const readable = `${presentationId}:release`;
  return readable.length <= 128
    ? readable
    : `release:${profileSeed(presentationId).toString(16)}`;
}

export function createRerollBatches(
  group: DiceRollGroupInput
): readonly RerollBatch[] {
  const batches: RerollBatch[] = [];
  const maxSteps = group.dice.reduce(
    (largest, die) => Math.max(largest, die.rerolls.length),
    0
  );
  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
    const byLabel = new Map<string, RerollBatchEntry[]>();
    for (const die of group.dice) {
      const step = die.rerolls[stepIndex];
      if (!step) continue;
      const entries = byLabel.get(step.displayLabel) ?? [];
      entries.push(Object.freeze({ dieId: die.id, step }));
      byLabel.set(step.displayLabel, entries);
    }
    for (const [displayLabel, entries] of byLabel) {
      const frozenEntries = Object.freeze(entries);
      batches.push(
        Object.freeze({
          occurrenceKey: `reroll-step:${stepIndex}:batch:${batches.length}`,
          displayLabel,
          entries: frozenEntries,
          dieIds: Object.freeze(entries.map((entry) => entry.dieId)),
        })
      );
    }
  }
  return Object.freeze(batches);
}

export function displayedFaces(
  group: DiceRollGroupInput,
  batches: readonly RerollBatch[],
  state: RollGroupPresentationState
): Readonly<Record<string, number>> {
  let appliedBatchCount = 0;
  if (state.phase === 'reroll-flash') appliedBatchCount = state.rerollIndex;
  else if (state.phase === 'rerolling')
    appliedBatchCount = state.rerollIndex + 1;
  else if (state.phase === 'modifiers' || state.phase === 'complete')
    appliedBatchCount = batches.length;

  const faces: Record<string, number> = {};
  for (const die of group.dice) faces[die.id] = die.originalFace;
  for (const batch of batches.slice(0, appliedBatchCount)) {
    for (const entry of batch.entries) faces[entry.dieId] = entry.step.after;
  }
  return Object.freeze(faces);
}

export function currentRerollBatch(
  batches: readonly RerollBatch[],
  state: RollGroupPresentationState
) {
  return state.phase === 'reroll-flash' || state.phase === 'rerolling'
    ? batches[state.rerollIndex]
    : undefined;
}

export function statusText(
  label: string,
  state: RollGroupPresentationState,
  batch: RerollBatch | undefined,
  fallback: boolean
) {
  if (state.phase === 'armed')
    return `${label} requested · waiting for release event`;
  if (state.phase === 'rolling-originals')
    return `${label} release delivered · rolling originals`;
  if (state.phase === 'settled-originals')
    return `${label} original dice settled`;
  if (state.phase === 'reroll-flash')
    return `${label} reroll flash${batch ? ` · ${batch.displayLabel}` : ''}`;
  if (state.phase === 'rerolling')
    return `${label} rerolling${batch ? ` · ${batch.displayLabel}` : ''}`;
  if (state.phase === 'modifiers') return `${label} modifiers`;
  return fallback
    ? `${label} complete · semantic fallback`
    : `${label} roll complete`;
}
