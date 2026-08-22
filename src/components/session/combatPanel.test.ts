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

/** Mirrors the toolkit's own `affordMove`: always `Slot.NONE`, always
 * carries `remaining`. */
function moveDeclaration(overrides: Partial<Declaration> = {}): Declaration {
  return {
    verb: Verb.MOVE,
    slot: Slot.NONE,
    affordable: true,
    shortfall: '',
    remaining: 30,
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
    // Defaults to true so the many existing "targeting" assertions below
    // keep testing the isYourTurn-AND-requested gate meaningfully — the
    // dedicated "explicit request" describe block covers `false`.
    targetingRequested: true,
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
          remaining: undefined,
        },
      ]);
    });

    it("Afford's own clock disagreeing with Turn's (should-never-happen) falls back to every shape dim, no declarations, no movement, rather than trusting the mismatch", () => {
      const result = selectCombatPanel(
        args({ afford: { clock: ClockKind.WORLD, declarations: [] } })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.shapes.every((s) => !s.lit)).toBe(true);
      expect(result.declarations).toEqual([]);
      expect(result.movement).toBeNull();
      expect(result.moveMaxCells).toBe(0);
    });
  });

  describe('movement (toolkit#1169) — a currency, not a slot', () => {
    it('reports remainingFeet/affordable verbatim from the Move declaration, and floor-divides by 5 for moveMaxCells', () => {
      const result = selectCombatPanel(
        args({
          afford: {
            clock: ClockKind.TURN,
            declarations: [
              attackDeclaration(),
              moveDeclaration({ remaining: 17 }),
            ],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.movement).toEqual({ remainingFeet: 17, affordable: true });
      expect(result.moveMaxCells).toBe(3); // floor(17/5)
    });

    it('an unaffordable Move (fewer than 5 ft left) still reports the real number, moveMaxCells 0', () => {
      const result = selectCombatPanel(
        args({
          afford: {
            clock: ClockKind.TURN,
            declarations: [
              moveDeclaration({
                remaining: 3,
                affordable: false,
                shortfall: 'movement: 3 ft left',
              }),
            ],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.movement).toEqual({ remainingFeet: 3, affordable: false });
      expect(result.moveMaxCells).toBe(0);
    });

    it('null when no Move declaration is present at all (a stale server predating toolkit#1169) — the honest "nothing to report" reading, not a guessed zero', () => {
      const result = selectCombatPanel(
        args({
          afford: {
            clock: ClockKind.TURN,
            declarations: [attackDeclaration()],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.movement).toBeNull();
      expect(result.moveMaxCells).toBe(0);
    });

    it('Move never appears in the generic declarations list — it has its own dedicated field', () => {
      const result = selectCombatPanel(
        args({
          afford: {
            clock: ClockKind.TURN,
            declarations: [attackDeclaration(), moveDeclaration()],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.declarations).toHaveLength(1);
      expect(result.declarations[0]!.verb).toBe(Verb.ATTACK);
    });
  });

  describe('attack gate/button state', () => {
    it("kind: 'attack', enabled: your turn + affordable + a target selected", () => {
      const result = selectCombatPanel(
        args({ selectedTargetId: 'skeleton-1' })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.attack).toEqual({
        kind: 'attack',
        enabled: true,
        reason: null,
      });
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
        kind: 'attack',
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
        kind: 'attack',
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
        kind: 'attack',
        enabled: false,
        reason: 'Attack unavailable.',
      });
    });

    it("affordable + your turn but no target -> kind: 'pick-target', always enabled", () => {
      const result = selectCombatPanel(args({ selectedTargetId: null }));
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.attack).toEqual({ kind: 'pick-target', enabled: true });
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

  describe('targeting — an explicit request (toolkit#1169), not auto-derived', () => {
    it('true when requested AND your turn — independent of whether a target is already picked', () => {
      const noTarget = selectCombatPanel(
        args({ selectedTargetId: null, targetingRequested: true })
      );
      const withTarget = selectCombatPanel(
        args({ selectedTargetId: 'skeleton-1', targetingRequested: true })
      );
      if (noTarget.mode !== 'turn' || withTarget.mode !== 'turn') {
        throw new Error('unreachable');
      }
      expect(noTarget.targeting).toBe(true);
      expect(withTarget.targeting).toBe(true);
    });

    it('false when NOT requested, even on your turn with Attack affordable', () => {
      const result = selectCombatPanel(args({ targetingRequested: false }));
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.targeting).toBe(false);
    });

    it('false when not your turn, even if requested AND Afford reports affordable — a stale request never leaks the target reticle into a locked turn', () => {
      const result = selectCombatPanel(
        args({
          turn: {
            clock: ClockKind.TURN,
            active: 'skeleton-1',
            round: 1,
            order: ['char-1', 'skeleton-1'],
          },
          targetingRequested: true,
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.targeting).toBe(false);
    });

    it('true even when Attack is unaffordable — targeting no longer depends on Attack affordability at all, only the explicit request + turn ownership', () => {
      const result = selectCombatPanel(
        args({
          afford: {
            clock: ClockKind.TURN,
            declarations: [
              attackDeclaration({ affordable: false, shortfall: 'x' }),
            ],
          },
          targetingRequested: true,
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.targeting).toBe(true);
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
