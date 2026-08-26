import { describe, expect, it } from 'vitest';
import { SHARED_TABLE_DICE_SCENARIOS } from './sharedTableDiceFixtures';
import {
  reduceSharedTableDice,
  type SharedTableDiceState,
} from './sharedTableDiceState';

function initial(
  scenarioId: keyof typeof SHARED_TABLE_DICE_SCENARIOS
): SharedTableDiceState {
  return {
    scenarioId,
    phase: 'attack',
  };
}

describe('shared table dice coordinator state', () => {
  it('records separate attack generations for roller and spectator before either completion', () => {
    const scenario = SHARED_TABLE_DICE_SCENARIOS['ordinary-damage'];
    const rollerMounted = reduceSharedTableDice(
      initial('ordinary-damage'),
      {
        type: 'presentation-mounted',
        presentationId: 'attack:1',
        groupKey: 'attack',
        witnessRole: 'roller',
        rendererGeneration: 11,
      },
      scenario
    );

    expect(rollerMounted).toEqual({
      scenarioId: 'ordinary-damage',
      phase: 'attack',
      activePresentation: {
        presentationId: 'attack:1',
        groupKey: 'attack',
        generations: { roller: 11 },
        completed: { roller: false, spectator: false },
      },
    });

    const bothMounted = reduceSharedTableDice(
      rollerMounted,
      {
        type: 'presentation-mounted',
        presentationId: 'attack:1',
        groupKey: 'attack',
        witnessRole: 'spectator',
        rendererGeneration: 22,
      },
      scenario
    );

    expect(bothMounted.activePresentation).toEqual({
      presentationId: 'attack:1',
      groupKey: 'attack',
      generations: { roller: 11, spectator: 22 },
      completed: { roller: false, spectator: false },
    });
  });

  it('ignores completion before the matching witness has mounted for both witness roles', () => {
    const scenario = SHARED_TABLE_DICE_SCENARIOS['ordinary-damage'];

    for (const [
      mountedRole,
      completionRole,
      mountedGeneration,
      completionGeneration,
    ] of [
      ['roller', 'spectator', 11, 22],
      ['spectator', 'roller', 33, 44],
    ] as const) {
      const partiallyMounted = reduceSharedTableDice(
        initial('ordinary-damage'),
        {
          type: 'presentation-mounted',
          presentationId: 'attack:partial',
          groupKey: 'attack',
          witnessRole: mountedRole,
          rendererGeneration: mountedGeneration,
        },
        scenario
      );

      expect(partiallyMounted).toEqual({
        scenarioId: 'ordinary-damage',
        phase: 'attack',
        activePresentation: {
          presentationId: 'attack:partial',
          groupKey: 'attack',
          generations: { [mountedRole]: mountedGeneration },
          completed: { roller: false, spectator: false },
        },
      });

      const blocked = reduceSharedTableDice(
        partiallyMounted,
        {
          type: 'group-complete',
          presentationId: 'attack:partial',
          groupKey: 'attack',
          witnessRole: completionRole,
          rendererGeneration: completionGeneration,
        },
        scenario
      );

      expect(blocked).toBe(partiallyMounted);
      expect(blocked.phase).toBe('attack');
      expect(blocked.activePresentation?.completed).toEqual({
        roller: false,
        spectator: false,
      });
    }
  });

  it('advances a miss only after both attack completions and verdict completion', () => {
    const scenario = SHARED_TABLE_DICE_SCENARIOS['single-d20'];
    const mounted = reduceSharedTableDice(
      reduceSharedTableDice(
        initial('single-d20'),
        {
          type: 'presentation-mounted',
          presentationId: 'attack:miss',
          groupKey: 'attack',
          witnessRole: 'roller',
          rendererGeneration: 1,
        },
        scenario
      ),
      {
        type: 'presentation-mounted',
        presentationId: 'attack:miss',
        groupKey: 'attack',
        witnessRole: 'spectator',
        rendererGeneration: 2,
      },
      scenario
    );

    const oneComplete = reduceSharedTableDice(
      mounted,
      {
        type: 'group-complete',
        presentationId: 'attack:miss',
        groupKey: 'attack',
        witnessRole: 'roller',
        rendererGeneration: 1,
      },
      scenario
    );
    expect(oneComplete.phase).toBe('attack');
    expect(oneComplete.activePresentation?.completed).toEqual({
      roller: true,
      spectator: false,
    });

    const verdict = reduceSharedTableDice(
      oneComplete,
      {
        type: 'group-complete',
        presentationId: 'attack:miss',
        groupKey: 'attack',
        witnessRole: 'spectator',
        rendererGeneration: 2,
      },
      scenario
    );
    expect(verdict.phase).toBe('attack-verdict');
    expect(verdict.activePresentation?.completed).toEqual({
      roller: true,
      spectator: true,
    });

    const complete = reduceSharedTableDice(
      verdict,
      { type: 'verdict-complete' },
      scenario
    );
    expect(complete).toEqual({
      scenarioId: 'single-d20',
      phase: 'complete',
    });
  });

  it('advances a hit through attack verdict, damage barrier, impact, and completion', () => {
    const scenario = SHARED_TABLE_DICE_SCENARIOS['ordinary-damage'];
    let state = initial('ordinary-damage');
    state = reduceSharedTableDice(
      state,
      {
        type: 'presentation-mounted',
        presentationId: 'attack:hit',
        groupKey: 'attack',
        witnessRole: 'roller',
        rendererGeneration: 10,
      },
      scenario
    );
    state = reduceSharedTableDice(
      state,
      {
        type: 'presentation-mounted',
        presentationId: 'attack:hit',
        groupKey: 'attack',
        witnessRole: 'spectator',
        rendererGeneration: 20,
      },
      scenario
    );
    state = reduceSharedTableDice(
      state,
      {
        type: 'group-complete',
        presentationId: 'attack:hit',
        groupKey: 'attack',
        witnessRole: 'roller',
        rendererGeneration: 10,
      },
      scenario
    );
    state = reduceSharedTableDice(
      state,
      {
        type: 'group-complete',
        presentationId: 'attack:hit',
        groupKey: 'attack',
        witnessRole: 'spectator',
        rendererGeneration: 20,
      },
      scenario
    );
    expect(state.phase).toBe('attack-verdict');

    state = reduceSharedTableDice(
      state,
      { type: 'verdict-complete' },
      scenario
    );
    expect(state).toEqual({
      scenarioId: 'ordinary-damage',
      phase: 'damage',
    });

    state = reduceSharedTableDice(
      state,
      {
        type: 'presentation-mounted',
        presentationId: 'damage:hit',
        groupKey: 'damage',
        witnessRole: 'roller',
        rendererGeneration: 30,
      },
      scenario
    );
    state = reduceSharedTableDice(
      state,
      {
        type: 'presentation-mounted',
        presentationId: 'damage:hit',
        groupKey: 'damage',
        witnessRole: 'spectator',
        rendererGeneration: 40,
      },
      scenario
    );
    expect(state.activePresentation?.generations).toEqual({
      roller: 30,
      spectator: 40,
    });

    state = reduceSharedTableDice(
      state,
      {
        type: 'group-complete',
        presentationId: 'damage:hit',
        groupKey: 'damage',
        witnessRole: 'roller',
        rendererGeneration: 30,
      },
      scenario
    );
    expect(state.phase).toBe('damage');
    state = reduceSharedTableDice(
      state,
      {
        type: 'group-complete',
        presentationId: 'damage:hit',
        groupKey: 'damage',
        witnessRole: 'spectator',
        rendererGeneration: 40,
      },
      scenario
    );
    expect(state.phase).toBe('impact');

    state = reduceSharedTableDice(state, { type: 'impact-complete' }, scenario);
    expect(state).toEqual({
      scenarioId: 'ordinary-damage',
      phase: 'complete',
    });
  });

  it('ignores stale, mismatched, premature, and duplicate completions while keeping matching completions idempotent', () => {
    const scenario = SHARED_TABLE_DICE_SCENARIOS['ordinary-damage'];
    const untouched = initial('ordinary-damage');

    expect(
      reduceSharedTableDice(
        untouched,
        {
          type: 'group-complete',
          presentationId: 'attack:1',
          groupKey: 'attack',
          witnessRole: 'roller',
          rendererGeneration: 1,
        },
        scenario
      )
    ).toBe(untouched);

    const mounted = reduceSharedTableDice(
      reduceSharedTableDice(
        untouched,
        {
          type: 'presentation-mounted',
          presentationId: 'attack:1',
          groupKey: 'attack',
          witnessRole: 'roller',
          rendererGeneration: 7,
        },
        scenario
      ),
      {
        type: 'presentation-mounted',
        presentationId: 'attack:1',
        groupKey: 'attack',
        witnessRole: 'spectator',
        rendererGeneration: 8,
      },
      scenario
    );

    for (const action of [
      {
        type: 'presentation-mounted' as const,
        presentationId: 'attack:other',
        groupKey: 'attack' as const,
        witnessRole: 'spectator' as const,
        rendererGeneration: 99,
      },
      {
        type: 'presentation-mounted' as const,
        presentationId: 'attack:1',
        groupKey: 'damage' as const,
        witnessRole: 'spectator' as const,
        rendererGeneration: 99,
      },
      {
        type: 'group-complete' as const,
        presentationId: 'attack:1',
        groupKey: 'attack' as const,
        witnessRole: 'roller' as const,
        rendererGeneration: 999,
      },
      {
        type: 'group-complete' as const,
        presentationId: 'attack:other',
        groupKey: 'attack' as const,
        witnessRole: 'roller' as const,
        rendererGeneration: 7,
      },
      {
        type: 'group-complete' as const,
        presentationId: 'attack:1',
        groupKey: 'damage' as const,
        witnessRole: 'roller' as const,
        rendererGeneration: 7,
      },
    ])
      expect(reduceSharedTableDice(mounted, action, scenario)).toBe(mounted);

    const completed = reduceSharedTableDice(
      reduceSharedTableDice(
        mounted,
        {
          type: 'group-complete',
          presentationId: 'attack:1',
          groupKey: 'attack',
          witnessRole: 'roller',
          rendererGeneration: 7,
        },
        scenario
      ),
      {
        type: 'group-complete',
        presentationId: 'attack:1',
        groupKey: 'attack',
        witnessRole: 'spectator',
        rendererGeneration: 8,
      },
      scenario
    );

    expect(
      reduceSharedTableDice(
        completed,
        {
          type: 'group-complete',
          presentationId: 'attack:1',
          groupKey: 'attack',
          witnessRole: 'spectator',
          rendererGeneration: 8,
        },
        scenario
      )
    ).toBe(completed);
  });
});
