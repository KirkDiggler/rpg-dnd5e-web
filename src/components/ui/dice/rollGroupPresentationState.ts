export type RollGroupPresentationPhase =
  | 'armed'
  | 'rolling-originals'
  | 'settled-originals'
  | 'reroll-flash'
  | 'rerolling'
  | 'modifiers'
  | 'complete';

export interface RollGroupPresentationState {
  readonly phase: RollGroupPresentationPhase;
  readonly rerollIndex: number;
  readonly modifierIndex: number;
  readonly hydrated: boolean;
}

export type RollGroupPresentationAction =
  | { readonly type: 'release-delivered' }
  | { readonly type: 'originals-settled' }
  | { readonly type: 'reroll-flash-complete' }
  | { readonly type: 'reroll-settled' }
  | { readonly type: 'modifier-shown' }
  | { readonly type: 'hydrate-released-history' };

function sanitizeCount(value: number) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function normalizeCounts(
  counts: Readonly<{ rerollCount: number; modifierCount: number }>
) {
  return {
    rerollCount: sanitizeCount(counts.rerollCount),
    modifierCount: sanitizeCount(counts.modifierCount),
  };
}

function createState(
  phase: RollGroupPresentationPhase,
  rerollIndex: number,
  modifierIndex: number,
  hydrated: boolean
): RollGroupPresentationState {
  return Object.freeze({
    phase,
    rerollIndex,
    modifierIndex,
    hydrated,
  });
}

function completeState(
  state: RollGroupPresentationState,
  counts: Readonly<{ rerollCount: number; modifierCount: number }>,
  hydrated: boolean
): RollGroupPresentationState {
  const normalized = normalizeCounts(counts);
  if (
    state.phase === 'complete' &&
    state.rerollIndex === normalized.rerollCount &&
    state.modifierIndex === normalized.modifierCount &&
    state.hydrated === hydrated
  )
    return state;
  return createState(
    'complete',
    normalized.rerollCount,
    normalized.modifierCount,
    hydrated
  );
}

export function createRollGroupPresentationState(input: {
  readonly released: boolean;
  readonly hydrated: boolean;
  readonly rerollCount: number;
  readonly modifierCount: number;
}): RollGroupPresentationState {
  const counts = normalizeCounts(input);
  if (input.released && input.hydrated) {
    return createState(
      'complete',
      counts.rerollCount,
      counts.modifierCount,
      true
    );
  }
  return createState(
    input.released ? 'rolling-originals' : 'armed',
    0,
    0,
    input.hydrated
  );
}

export function reduceRollGroupPresentation(
  state: RollGroupPresentationState,
  action: RollGroupPresentationAction,
  counts: Readonly<{ rerollCount: number; modifierCount: number }>
): RollGroupPresentationState {
  const normalized = normalizeCounts(counts);

  if (action.type === 'hydrate-released-history') {
    if (state.phase === 'armed') return state;
    return completeState(state, normalized, true);
  }

  if (state.phase === 'complete') return state;

  if (action.type === 'release-delivered') {
    return state.phase === 'armed'
      ? createState('rolling-originals', 0, 0, state.hydrated)
      : state;
  }

  if (action.type === 'originals-settled') {
    return state.phase === 'rolling-originals'
      ? createState(
          'settled-originals',
          state.rerollIndex,
          state.modifierIndex,
          state.hydrated
        )
      : state;
  }

  if (action.type === 'reroll-flash-complete') {
    if (state.phase === 'settled-originals') {
      if (normalized.rerollCount > state.rerollIndex) {
        return createState(
          'reroll-flash',
          state.rerollIndex,
          state.modifierIndex,
          state.hydrated
        );
      }
      if (normalized.modifierCount > state.modifierIndex) {
        return createState(
          'modifiers',
          state.rerollIndex,
          state.modifierIndex,
          state.hydrated
        );
      }
      return completeState(state, normalized, state.hydrated);
    }

    return state.phase === 'reroll-flash'
      ? createState(
          'rerolling',
          state.rerollIndex,
          state.modifierIndex,
          state.hydrated
        )
      : state;
  }

  if (action.type === 'reroll-settled') {
    if (
      state.phase !== 'rerolling' ||
      state.rerollIndex >= normalized.rerollCount
    )
      return state;

    const rerollIndex = state.rerollIndex + 1;
    if (rerollIndex < normalized.rerollCount) {
      return createState(
        'reroll-flash',
        rerollIndex,
        state.modifierIndex,
        state.hydrated
      );
    }
    if (state.modifierIndex < normalized.modifierCount) {
      return createState(
        'modifiers',
        rerollIndex,
        state.modifierIndex,
        state.hydrated
      );
    }
    return createState(
      'complete',
      rerollIndex,
      state.modifierIndex,
      state.hydrated
    );
  }

  if (
    action.type === 'modifier-shown' &&
    state.phase === 'modifiers' &&
    state.modifierIndex < normalized.modifierCount
  ) {
    const modifierIndex = state.modifierIndex + 1;
    return modifierIndex < normalized.modifierCount
      ? createState(
          'modifiers',
          state.rerollIndex,
          modifierIndex,
          state.hydrated
        )
      : createState(
          'complete',
          state.rerollIndex,
          modifierIndex,
          state.hydrated
        );
  }

  return state;
}
