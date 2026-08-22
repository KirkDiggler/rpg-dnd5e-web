import {
  ClockKind,
  Slot,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { selectCombatPanel, type SelectCombatPanelArgs } from './combatPanel';

function attackDeclaration(overrides: Partial<Declaration> = {}): Declaration {
  return {
    verb: Verb.ATTACK,
    slot: Slot.ACTION,
    affordable: true,
    shortfall: '',
    ...overrides,
  } as Declaration;
}

function args(
  overrides: Partial<SelectCombatPanelArgs> = {}
): SelectCombatPanelArgs {
  return {
    turn: {
      clock: ClockKind.TURN,
      active: 'char-1',
      round: 1,
      order: ['char-1', 'skeleton-1'],
    },
    afford: { clock: ClockKind.TURN, declarations: [attackDeclaration()] },
    member: 'char-1',
    selectedTargetId: null,
    lastBeat: null,
    ...overrides,
  };
}

describe('selectCombatPanel', () => {
  it('world clock -> free-roam, regardless of Afford/target/beat', () => {
    expect(
      selectCombatPanel(
        args({
          turn: { clock: ClockKind.WORLD, active: '', round: 0, order: [] },
        })
      )
    ).toEqual({ mode: 'free-roam' });
  });

  it('unspecified turn clock (not yet fetched) -> free-roam', () => {
    expect(
      selectCombatPanel(
        args({
          turn: {
            clock: ClockKind.UNSPECIFIED,
            active: '',
            round: 0,
            order: [],
          },
        })
      )
    ).toEqual({ mode: 'free-roam' });
  });

  describe('order', () => {
    it('marks the active member and the local player independently', () => {
      const result = selectCombatPanel(
        args({
          turn: {
            clock: ClockKind.TURN,
            active: 'skeleton-1',
            round: 3,
            order: ['char-1', 'skeleton-1'],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.round).toBe(3);
      expect(result.order).toEqual([
        { id: 'char-1', isActive: false, isYou: true },
        { id: 'skeleton-1', isActive: true, isYou: false },
      ]);
    });

    it('a single-member order (degenerate but legal) still maps cleanly', () => {
      const result = selectCombatPanel(
        args({
          turn: {
            clock: ClockKind.TURN,
            active: 'char-1',
            round: 1,
            order: ['char-1'],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.order).toEqual([
        { id: 'char-1', isActive: true, isYou: true },
      ]);
    });
  });

  describe('shapes — turn-ownership gating on top of Afford', () => {
    it('on your turn, an affordable action declaration lights the action shape', () => {
      const result = selectCombatPanel(args());
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.shapes).toEqual([
        { slot: 'action', lit: true },
        { slot: 'bonus', lit: false },
        { slot: 'reaction', lit: false },
      ]);
    });

    it('NOT your turn -> every shape reads dim even though Afford reports it affordable (the economy answer is not the turn answer)', () => {
      const result = selectCombatPanel(
        args({
          turn: {
            clock: ClockKind.TURN,
            active: 'skeleton-1',
            round: 1,
            order: ['char-1', 'skeleton-1'],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.shapes.every((s) => !s.lit)).toBe(true);
      // The declaration ROW itself is untouched — still reports "ready".
      expect(result.declarations).toEqual([
        {
          verb: Verb.ATTACK,
          slot: Slot.ACTION,
          affordable: true,
          shortfall: '',
        },
      ]);
    });

    it("Afford's own clock disagreeing with Turn's (should-never-happen) falls back to every shape dim, no declarations, rather than trusting the mismatch", () => {
      const result = selectCombatPanel(
        args({ afford: { clock: ClockKind.WORLD, declarations: [] } })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.shapes.every((s) => !s.lit)).toBe(true);
      expect(result.declarations).toEqual([]);
    });
  });

  describe('attack gate', () => {
    it('enabled: your turn + affordable + a target selected', () => {
      const result = selectCombatPanel(
        args({ selectedTargetId: 'skeleton-1' })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.attack).toEqual({ enabled: true, reason: null });
    });

    it('"Not your turn." wins first, even if unaffordable AND no target', () => {
      const result = selectCombatPanel(
        args({
          turn: {
            clock: ClockKind.TURN,
            active: 'skeleton-1',
            round: 1,
            order: ['char-1', 'skeleton-1'],
          },
          afford: {
            clock: ClockKind.TURN,
            declarations: [
              attackDeclaration({ affordable: false, shortfall: 'x' }),
            ],
          },
          selectedTargetId: null,
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.attack).toEqual({
        enabled: false,
        reason: 'Not your turn.',
      });
    });

    it('the Afford shortfall is carried verbatim when unaffordable on your turn', () => {
      const result = selectCombatPanel(
        args({
          afford: {
            clock: ClockKind.TURN,
            declarations: [
              attackDeclaration({
                affordable: false,
                shortfall: 'action: 1 needed, 0 left',
              }),
            ],
          },
          selectedTargetId: 'skeleton-1',
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.attack).toEqual({
        enabled: false,
        reason: 'action: 1 needed, 0 left',
      });
    });

    it('no Attack declaration at all on your turn -> generic "Attack unavailable."', () => {
      const result = selectCombatPanel(
        args({
          afford: { clock: ClockKind.TURN, declarations: [] },
          selectedTargetId: 'skeleton-1',
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.attack).toEqual({
        enabled: false,
        reason: 'Attack unavailable.',
      });
    });

    it('affordable + your turn but no target -> "Pick a target."', () => {
      const result = selectCombatPanel(args({ selectedTargetId: null }));
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.attack).toEqual({
        enabled: false,
        reason: 'Pick a target.',
      });
    });
  });

  describe('end turn gate', () => {
    it('enabled exactly on your turn', () => {
      const result = selectCombatPanel(args());
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.endTurn).toEqual({ enabled: true, reason: null });
    });

    it('disabled with "Not your turn." otherwise', () => {
      const result = selectCombatPanel(
        args({
          turn: {
            clock: ClockKind.TURN,
            active: 'skeleton-1',
            round: 1,
            order: ['char-1', 'skeleton-1'],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.endTurn).toEqual({
        enabled: false,
        reason: 'Not your turn.',
      });
    });
  });

  describe('targeting', () => {
    it('true exactly when your turn AND Attack is affordable — independent of whether a target is already picked', () => {
      const noTarget = selectCombatPanel(args({ selectedTargetId: null }));
      const withTarget = selectCombatPanel(
        args({ selectedTargetId: 'skeleton-1' })
      );
      if (noTarget.mode !== 'turn' || withTarget.mode !== 'turn') {
        throw new Error('unreachable');
      }
      expect(noTarget.targeting).toBe(true);
      expect(withTarget.targeting).toBe(true);
    });

    it('false when not your turn, even if Afford reports affordable', () => {
      const result = selectCombatPanel(
        args({
          turn: {
            clock: ClockKind.TURN,
            active: 'skeleton-1',
            round: 1,
            order: ['char-1', 'skeleton-1'],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.targeting).toBe(false);
    });

    it('false when your turn but Attack is unaffordable', () => {
      const result = selectCombatPanel(
        args({
          afford: {
            clock: ClockKind.TURN,
            declarations: [
              attackDeclaration({ affordable: false, shortfall: 'x' }),
            ],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.targeting).toBe(false);
    });
  });

  describe('waitingOn', () => {
    it('null on your own turn', () => {
      const result = selectCombatPanel(args());
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.waitingOn).toBeNull();
    });

    it("names the active member when it's not your turn", () => {
      const result = selectCombatPanel(
        args({
          turn: {
            clock: ClockKind.TURN,
            active: 'skeleton-1',
            round: 1,
            order: ['char-1', 'skeleton-1'],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.waitingOn).toBe('skeleton-1');
    });
  });

  it('selectedTargetId and lastBeat pass through unchanged', () => {
    const result = selectCombatPanel(
      args({
        selectedTargetId: 'skeleton-1',
        lastBeat: 'You hit skeleton-1: 17 vs AC 13 for 6',
      })
    );
    expect(result.mode).toBe('turn');
    if (result.mode !== 'turn') throw new Error('unreachable');
    expect(result.selectedTargetId).toBe('skeleton-1');
    expect(result.lastBeat).toBe('You hit skeleton-1: 17 vs AC 13 for 6');
  });
});
