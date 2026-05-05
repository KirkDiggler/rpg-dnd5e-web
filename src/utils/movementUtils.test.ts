import type {
  ActionEconomy,
  CombatState,
  TurnState,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MOVEMENT_FEET,
  getMovementMax,
  getMovementRemaining,
  getMovementRemainingFromCombat,
} from './movementUtils';

function makeTurn(overrides: Partial<TurnState> = {}): TurnState {
  return {
    entityId: 'player-1',
    movementUsed: 0,
    movementMax: 0,
    actionUsed: false,
    bonusActionUsed: false,
    reactionAvailable: true,
    position: undefined,
    actionEconomy: undefined,
    $typeName: 'dnd5e.api.v1alpha1.TurnState',
    $unknown: undefined,
    ...overrides,
  } as TurnState;
}

function makeActionEconomy(
  overrides: Partial<ActionEconomy> = {}
): ActionEconomy {
  return {
    movementRemaining: 30,
    movementMax: 30,
    attacksRemaining: 1,
    standardActionAvailable: true,
    bonusActionAvailable: true,
    reactionAvailable: true,
    offHandAttacksRemaining: 0,
    flurryStrikesRemaining: 0,
    $typeName: 'dnd5e.api.v1alpha1.ActionEconomy',
    $unknown: undefined,
    ...overrides,
  } as ActionEconomy;
}

describe('getMovementRemaining', () => {
  it('returns actionEconomy.movementRemaining when present', () => {
    const turn = makeTurn({
      actionEconomy: makeActionEconomy({ movementRemaining: 25 }),
      // Deliberately desynced deprecated values — the canonical actionEconomy
      // value must win. This is the Wave 2 OpenDoor regression: deprecated
      // fields said "no movement left" while actionEconomy said "30 ft left".
      movementMax: 30,
      movementUsed: 30,
    });
    expect(getMovementRemaining(turn)).toBe(25);
  });

  it('returns 0 from actionEconomy when actionEconomy says 0', () => {
    const turn = makeTurn({
      actionEconomy: makeActionEconomy({ movementRemaining: 0 }),
      movementMax: 30,
      movementUsed: 0,
    });
    expect(getMovementRemaining(turn)).toBe(0);
  });

  it('returns full canonical value even when deprecated fields are zero', () => {
    // Repro the exact Wave 2 OpenDoor symptom: api populates actionEconomy
    // correctly but deprecated movementMax/movementUsed are both zero
    // (because the converter sees state.MovementRemaining=0 transiently).
    // Old code path: (0 || 30) - (0 || 0) = 30 — but other variants of the
    // bug had movementUsed=30. This test pins the canonical-first behavior.
    const turn = makeTurn({
      actionEconomy: makeActionEconomy({ movementRemaining: 30 }),
      movementMax: 30,
      movementUsed: 30, // deprecated says "spent all 30"
    });
    expect(getMovementRemaining(turn)).toBe(30);
  });

  it('falls back to deprecated subtraction when actionEconomy is absent', () => {
    const turn = makeTurn({
      actionEconomy: undefined,
      movementMax: 30,
      movementUsed: 10,
    });
    expect(getMovementRemaining(turn)).toBe(20);
  });

  it('uses the 30ft default when movementMax is zero and actionEconomy missing', () => {
    const turn = makeTurn({
      actionEconomy: undefined,
      movementMax: 0,
      movementUsed: 0,
    });
    expect(getMovementRemaining(turn)).toBe(DEFAULT_MOVEMENT_FEET);
  });

  it('returns 0 when turn is null/undefined', () => {
    expect(getMovementRemaining(null)).toBe(0);
    expect(getMovementRemaining(undefined)).toBe(0);
  });
});

describe('getMovementRemainingFromCombat', () => {
  it('reads from currentTurn', () => {
    const combat = {
      currentTurn: makeTurn({
        actionEconomy: makeActionEconomy({ movementRemaining: 15 }),
      }),
    } as CombatState;
    expect(getMovementRemainingFromCombat(combat)).toBe(15);
  });

  it('returns 0 when combat or currentTurn is missing', () => {
    expect(getMovementRemainingFromCombat(null)).toBe(0);
    expect(getMovementRemainingFromCombat(undefined)).toBe(0);
    expect(
      getMovementRemainingFromCombat({ currentTurn: undefined } as CombatState)
    ).toBe(0);
  });
});

describe('getMovementMax', () => {
  it('prefers actionEconomy.movementMax', () => {
    const turn = makeTurn({
      actionEconomy: makeActionEconomy({ movementMax: 60 }), // dashed
      movementMax: 30,
    });
    expect(getMovementMax(turn)).toBe(60);
  });

  it('ignores actionEconomy.movementMax when zero (treats as unset)', () => {
    const turn = makeTurn({
      actionEconomy: makeActionEconomy({ movementMax: 0 }),
      movementMax: 30,
    });
    expect(getMovementMax(turn)).toBe(30);
  });

  it('falls back to deprecated movementMax when actionEconomy missing', () => {
    const turn = makeTurn({
      actionEconomy: undefined,
      movementMax: 30,
    });
    expect(getMovementMax(turn)).toBe(30);
  });

  it('returns the 30ft default when nothing is set', () => {
    const turn = makeTurn({
      actionEconomy: undefined,
      movementMax: 0,
    });
    expect(getMovementMax(turn)).toBe(DEFAULT_MOVEMENT_FEET);
  });

  it('returns the default when turn is null/undefined', () => {
    expect(getMovementMax(null)).toBe(DEFAULT_MOVEMENT_FEET);
    expect(getMovementMax(undefined)).toBe(DEFAULT_MOVEMENT_FEET);
  });
});
