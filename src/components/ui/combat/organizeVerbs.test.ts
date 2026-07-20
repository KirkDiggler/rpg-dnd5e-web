import type {
  ActionEconomy,
  AvailableAction,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { EconomySlot } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import {
  groupLabel,
  INLINE_CORE_LIMIT,
  organizeVerbs,
  verbCost,
} from './organizeVerbs';

function action(
  id: string,
  refType: string,
  slot: EconomySlot = EconomySlot.ACTION
): AvailableAction {
  return {
    ref: { module: 'dnd5e', type: refType, id },
    displayName: id,
    available: true,
    unavailableReason: '',
    economySlot: slot,
  } as unknown as AvailableAction;
}

function economy(
  actions: number,
  bonus: number,
  reactions: number
): ActionEconomy {
  return {
    actionsRemaining: actions,
    bonusActionsRemaining: bonus,
    reactionsRemaining: reactions,
    movementRemaining: 30,
  } as unknown as ActionEconomy;
}

describe('organizeVerbs', () => {
  it('keeps core types flat and groups the rest by ref.type', () => {
    const { core, groups, menuCount, triggerLabel } = organizeVerbs([
      action('attack', 'combat_abilities'),
      action('dash', 'actions'),
      action('flurry', 'feature', EconomySlot.BONUS_ACTION),
      action('stunning-strike', 'feature'),
    ]);
    expect(core.map((a) => a.ref?.id)).toEqual(['attack', 'dash']);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Features');
    expect(groups[0].actions.map((a) => a.ref?.id)).toEqual([
      'flurry',
      'stunning-strike',
    ]);
    expect(menuCount).toBe(2);
    expect(triggerLabel).toBe('Features ▾ 2');
  });

  it('folds core verbs past the inline cap into an "Actions" section first', () => {
    const many = Array.from({ length: INLINE_CORE_LIMIT + 2 }, (_, i) =>
      action(`core-${i}`, 'combat_abilities')
    );
    const { core, groups, menuCount, triggerLabel } = organizeVerbs([
      ...many,
      action('flurry', 'feature'),
    ]);
    expect(core).toHaveLength(INLINE_CORE_LIMIT);
    expect(groups.map((g) => g.label)).toEqual(['Actions', 'Features']);
    expect(groups[0].actions.map((a) => a.ref?.id)).toEqual([
      `core-${INLINE_CORE_LIMIT}`,
      `core-${INLINE_CORE_LIMIT + 1}`,
    ]);
    expect(menuCount).toBe(3);
    // Multiple groups → total-count trigger.
    expect(triggerLabel).toBe('More ▾ 3');
  });

  it('sentence-cases unknown ref.types instead of breaking', () => {
    expect(groupLabel('lair_actions')).toBe('Lair actions');
    expect(groupLabel('spell')).toBe('Spells');
    const { groups } = organizeVerbs([action('roar', 'lair_actions')]);
    expect(groups[0].label).toBe('Lair actions');
  });

  it('returns no groups and zero menuCount for a small core-only kit', () => {
    const { core, groups, menuCount } = organizeVerbs([
      action('attack', 'combat_abilities'),
    ]);
    expect(core).toHaveLength(1);
    expect(groups).toHaveLength(0);
    expect(menuCount).toBe(0);
  });
});

describe('verbCost', () => {
  it('maps economy_slot to the pool shape 1:1', () => {
    const e = economy(1, 1, 1);
    expect(verbCost(action('a', 'actions', EconomySlot.ACTION), e)).toEqual({
      shape: 'action',
      spent: false,
    });
    expect(
      verbCost(action('b', 'feature', EconomySlot.BONUS_ACTION), e)
    ).toEqual({ shape: 'bonus', spent: false });
    expect(verbCost(action('r', 'feature', EconomySlot.REACTION), e)).toEqual({
      shape: 'reaction',
      spent: false,
    });
  });

  it('marks the badge spent when that pool hits zero', () => {
    const e = economy(0, 1, 0);
    expect(verbCost(action('a', 'actions', EconomySlot.ACTION), e)).toEqual({
      shape: 'action',
      spent: true,
    });
    expect(
      verbCost(action('b', 'feature', EconomySlot.BONUS_ACTION), e)
    ).toEqual({ shape: 'bonus', spent: false });
  });

  it('gives no badge to slots without a pool, and unspent badges without economy', () => {
    expect(
      verbCost(
        action('move', 'combat_abilities', EconomySlot.MOVEMENT),
        economy(1, 1, 1)
      )
    ).toBeUndefined();
    expect(verbCost(action('a', 'actions', EconomySlot.ACTION), null)).toEqual({
      shape: 'action',
      spent: false,
    });
  });
});
