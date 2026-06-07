import type { AvailableAction } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import {
  EconomySlot,
  TargetKind,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import {
  actionKey,
  economySlotLabel,
  groupActionsBySlot,
  targetKindLabel,
  targetKindNeedsPrompt,
} from './actionMenuHelpers';

function action(
  partial: Partial<AvailableAction> & { id: string }
): AvailableAction {
  return {
    ref: { module: 'dnd5e', type: 'combat_abilities', id: partial.id },
    displayName: partial.displayName ?? partial.id,
    available: partial.available ?? true,
    unavailableReason: partial.unavailableReason ?? '',
    economySlot: partial.economySlot ?? EconomySlot.ACTION,
    targetKind: partial.targetKind ?? TargetKind.SINGLE_ENTITY,
  } as unknown as AvailableAction;
}

describe('groupActionsBySlot', () => {
  it('groups actions by economy slot in display order', () => {
    const actions = [
      action({ id: 'attack', economySlot: EconomySlot.ACTION }),
      action({ id: 'martial-arts', economySlot: EconomySlot.BONUS_ACTION }),
      action({ id: 'dodge', economySlot: EconomySlot.ACTION }),
      action({ id: 'move', economySlot: EconomySlot.MOVEMENT }),
    ];
    const groups = groupActionsBySlot(actions);
    expect(groups.map((g) => g.slot)).toEqual([
      EconomySlot.ACTION,
      EconomySlot.BONUS_ACTION,
      EconomySlot.MOVEMENT,
    ]);
    // ACTION group preserves server order (attack before dodge).
    expect(groups[0]?.actions.map((a) => a.ref?.id)).toEqual([
      'attack',
      'dodge',
    ]);
  });

  it('omits empty groups and returns [] for no actions', () => {
    expect(groupActionsBySlot([])).toEqual([]);
  });
});

describe('targetKindNeedsPrompt', () => {
  it('requires a prompt only for entity/position/area targets', () => {
    expect(targetKindNeedsPrompt(TargetKind.SINGLE_ENTITY)).toBe(true);
    expect(targetKindNeedsPrompt(TargetKind.POSITION)).toBe(true);
    expect(targetKindNeedsPrompt(TargetKind.AREA)).toBe(true);
  });

  it('does not prompt for SELF or NONE (SELF != NONE, both promptless)', () => {
    expect(targetKindNeedsPrompt(TargetKind.SELF)).toBe(false);
    expect(targetKindNeedsPrompt(TargetKind.NONE)).toBe(false);
    expect(targetKindNeedsPrompt(TargetKind.UNSPECIFIED)).toBe(false);
  });
});

describe('economySlotLabel', () => {
  it('labels each slot', () => {
    expect(economySlotLabel(EconomySlot.ACTION)).toBe('Action');
    expect(economySlotLabel(EconomySlot.BONUS_ACTION)).toBe('Bonus Action');
    expect(economySlotLabel(EconomySlot.REACTION)).toBe('Reaction');
    expect(economySlotLabel(EconomySlot.MOVEMENT)).toBe('Movement');
    expect(economySlotLabel(EconomySlot.FREE)).toBe('Free');
    expect(economySlotLabel(EconomySlot.UNSPECIFIED)).toBe('Other');
  });
});

describe('targetKindLabel', () => {
  it('labels each kind', () => {
    expect(targetKindLabel(TargetKind.SELF)).toBe('self');
    expect(targetKindLabel(TargetKind.SINGLE_ENTITY)).toBe('single target');
    expect(targetKindLabel(TargetKind.NONE)).toBe('no target');
  });
});

describe('actionKey', () => {
  it('builds module:type:id key from the ref', () => {
    expect(actionKey(action({ id: 'attack' }))).toBe(
      'dnd5e:combat_abilities:attack'
    );
  });

  it('falls back to displayName when ref is missing', () => {
    const a = {
      ref: undefined,
      displayName: 'Mystery',
    } as unknown as AvailableAction;
    expect(actionKey(a)).toBe('Mystery');
  });
});
