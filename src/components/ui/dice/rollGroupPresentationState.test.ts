import { describe, expect, it } from 'vitest';
import {
  createRollGroupPresentationState,
  reduceRollGroupPresentation,
} from './rollGroupPresentationState';

describe('createRollGroupPresentationState', () => {
  it('starts armed when no release has been delivered', () => {
    expect(
      createRollGroupPresentationState({
        released: false,
        hydrated: false,
        rerollCount: 2,
        modifierCount: 3,
      })
    ).toEqual({
      phase: 'armed',
      rerollIndex: 0,
      modifierIndex: 0,
      hydrated: false,
    });
  });

  it('starts complete when released history is already hydrated', () => {
    expect(
      createRollGroupPresentationState({
        released: true,
        hydrated: true,
        rerollCount: 2,
        modifierCount: 3,
      })
    ).toEqual({
      phase: 'complete',
      rerollIndex: 2,
      modifierIndex: 3,
      hydrated: true,
    });
  });
});

describe('reduceRollGroupPresentation', () => {
  it('walks armed -> rolling-originals -> settled-originals -> complete', () => {
    const counts = { rerollCount: 0, modifierCount: 0 };
    const armed = createRollGroupPresentationState({
      released: false,
      hydrated: false,
      rerollCount: counts.rerollCount,
      modifierCount: counts.modifierCount,
    });

    const rolling = reduceRollGroupPresentation(
      armed,
      { type: 'release-delivered' },
      counts
    );
    expect(rolling).toEqual({
      phase: 'rolling-originals',
      rerollIndex: 0,
      modifierIndex: 0,
      hydrated: false,
    });

    const settledOriginals = reduceRollGroupPresentation(
      rolling,
      { type: 'originals-settled' },
      counts
    );
    expect(settledOriginals).toEqual({
      phase: 'settled-originals',
      rerollIndex: 0,
      modifierIndex: 0,
      hydrated: false,
    });

    const complete = reduceRollGroupPresentation(
      settledOriginals,
      { type: 'reroll-flash-complete' },
      counts
    );
    expect(complete).toEqual({
      phase: 'complete',
      rerollIndex: 0,
      modifierIndex: 0,
      hydrated: false,
    });
    expect(
      reduceRollGroupPresentation(
        complete,
        { type: 'originals-settled' },
        counts
      )
    ).toBe(complete);
  });

  it('walks armed -> rolling-originals -> settled-originals -> reroll-flash -> rerolling -> modifiers -> complete', () => {
    const counts = { rerollCount: 1, modifierCount: 2 };
    const armed = createRollGroupPresentationState({
      released: false,
      hydrated: false,
      rerollCount: counts.rerollCount,
      modifierCount: counts.modifierCount,
    });

    expect(
      reduceRollGroupPresentation(armed, { type: 'modifier-shown' }, counts)
    ).toBe(armed);

    const rollingOriginals = reduceRollGroupPresentation(
      armed,
      { type: 'release-delivered' },
      counts
    );
    expect(
      reduceRollGroupPresentation(
        rollingOriginals,
        { type: 'release-delivered' },
        counts
      )
    ).toBe(rollingOriginals);

    const settledOriginals = reduceRollGroupPresentation(
      rollingOriginals,
      { type: 'originals-settled' },
      counts
    );
    expect(settledOriginals).toEqual({
      phase: 'settled-originals',
      rerollIndex: 0,
      modifierIndex: 0,
      hydrated: false,
    });

    expect(
      reduceRollGroupPresentation(
        settledOriginals,
        { type: 'originals-settled' },
        counts
      )
    ).toBe(settledOriginals);

    const rerollFlash = reduceRollGroupPresentation(
      settledOriginals,
      { type: 'reroll-flash-complete' },
      counts
    );
    expect(rerollFlash).toEqual({
      phase: 'reroll-flash',
      rerollIndex: 0,
      modifierIndex: 0,
      hydrated: false,
    });

    const rerolling = reduceRollGroupPresentation(
      rerollFlash,
      { type: 'reroll-flash-complete' },
      counts
    );
    expect(rerolling).toEqual({
      phase: 'rerolling',
      rerollIndex: 0,
      modifierIndex: 0,
      hydrated: false,
    });

    expect(
      reduceRollGroupPresentation(
        rerolling,
        { type: 'reroll-flash-complete' },
        counts
      )
    ).toBe(rerolling);

    const modifiers = reduceRollGroupPresentation(
      rerolling,
      { type: 'reroll-settled' },
      counts
    );
    expect(modifiers).toEqual({
      phase: 'modifiers',
      rerollIndex: 1,
      modifierIndex: 0,
      hydrated: false,
    });

    expect(
      reduceRollGroupPresentation(modifiers, { type: 'reroll-settled' }, counts)
    ).toBe(modifiers);

    const moreModifiers = reduceRollGroupPresentation(
      modifiers,
      { type: 'modifier-shown' },
      counts
    );
    expect(moreModifiers).toEqual({
      phase: 'modifiers',
      rerollIndex: 1,
      modifierIndex: 1,
      hydrated: false,
    });

    const complete = reduceRollGroupPresentation(
      moreModifiers,
      { type: 'modifier-shown' },
      counts
    );
    expect(complete).toEqual({
      phase: 'complete',
      rerollIndex: 1,
      modifierIndex: 2,
      hydrated: false,
    });
    expect(
      reduceRollGroupPresentation(complete, { type: 'modifier-shown' }, counts)
    ).toBe(complete);
    expect(
      reduceRollGroupPresentation(complete, { type: 'reroll-settled' }, counts)
    ).toBe(complete);
  });

  it('hydrates released history directly to complete and cannot replay rerolls or modifiers afterward', () => {
    const counts = { rerollCount: 2, modifierCount: 3 };
    const rollingReleased = createRollGroupPresentationState({
      released: true,
      hydrated: false,
      rerollCount: counts.rerollCount,
      modifierCount: counts.modifierCount,
    });

    expect(rollingReleased).toEqual({
      phase: 'rolling-originals',
      rerollIndex: 0,
      modifierIndex: 0,
      hydrated: false,
    });

    const complete = reduceRollGroupPresentation(
      rollingReleased,
      { type: 'hydrate-released-history' },
      counts
    );
    expect(complete).toEqual({
      phase: 'complete',
      rerollIndex: 2,
      modifierIndex: 3,
      hydrated: true,
    });
    expect(
      reduceRollGroupPresentation(
        complete,
        { type: 'hydrate-released-history' },
        counts
      )
    ).toBe(complete);
    expect(
      reduceRollGroupPresentation(complete, { type: 'reroll-settled' }, counts)
    ).toBe(complete);
    expect(
      reduceRollGroupPresentation(complete, { type: 'modifier-shown' }, counts)
    ).toBe(complete);
  });
});
