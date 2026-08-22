import {
  ClockKind,
  Slot,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectTurnHud } from './turnHud';

function declaration(overrides: Partial<Declaration> = {}): Declaration {
  return {
    verb: Verb.ATTACK,
    slot: Slot.ACTION,
    affordable: true,
    shortfall: '',
    ...overrides,
  } as Declaration;
}

describe('selectTurnHud', () => {
  it('world clock -> free-roam, regardless of declarations', () => {
    expect(selectTurnHud({ clock: ClockKind.WORLD, declarations: [] })).toEqual(
      { mode: 'free-roam' }
    );
  });

  it('unspecified clock (not yet fetched) -> free-roam, same as world', () => {
    expect(
      selectTurnHud({ clock: ClockKind.UNSPECIFIED, declarations: [] })
    ).toEqual({ mode: 'free-roam' });
  });

  it('turn clock with Attack unaffordable -> action shape unlit + shortfall carried verbatim', () => {
    const result = selectTurnHud({
      clock: ClockKind.TURN,
      declarations: [
        declaration({
          slot: Slot.ACTION,
          affordable: false,
          shortfall: 'action: 1 needed, 0 left',
        }),
      ],
    });

    expect(result.mode).toBe('turn');
    if (result.mode !== 'turn') throw new Error('unreachable');
    expect(result.shapes).toEqual([
      { slot: 'action', lit: false },
      { slot: 'bonus', lit: false },
      { slot: 'reaction', lit: false },
    ]);
    expect(result.declarations).toEqual([
      {
        verb: Verb.ATTACK,
        slot: Slot.ACTION,
        affordable: false,
        shortfall: 'action: 1 needed, 0 left',
      },
    ]);
  });

  it('turn clock with Attack affordable on the action slot -> action shape lit', () => {
    const result = selectTurnHud({
      clock: ClockKind.TURN,
      declarations: [
        declaration({ slot: Slot.ACTION, affordable: true, shortfall: '' }),
      ],
    });

    expect(result.mode).toBe('turn');
    if (result.mode !== 'turn') throw new Error('unreachable');
    expect(result.shapes).toEqual([
      { slot: 'action', lit: true },
      { slot: 'bonus', lit: false },
      { slot: 'reaction', lit: false },
    ]);
  });

  it('bonus- and reaction-slotted affordable declarations light their own shapes independently', () => {
    const result = selectTurnHud({
      clock: ClockKind.TURN,
      declarations: [
        declaration({ slot: Slot.BONUS, affordable: true }),
        declaration({ slot: Slot.REACTION, affordable: true }),
      ],
    });

    expect(result.mode).toBe('turn');
    if (result.mode !== 'turn') throw new Error('unreachable');
    expect(result.shapes).toEqual([
      { slot: 'action', lit: false },
      { slot: 'bonus', lit: true },
      { slot: 'reaction', lit: true },
    ]);
  });

  it('a declaration is unaffordable on its slot -> that shape stays dim even though another affordable declaration exists', () => {
    const result = selectTurnHud({
      clock: ClockKind.TURN,
      declarations: [
        declaration({ slot: Slot.ACTION, affordable: false }),
        declaration({ slot: Slot.BONUS, affordable: true }),
      ],
    });

    expect(result.mode).toBe('turn');
    if (result.mode !== 'turn') throw new Error('unreachable');
    expect(result.shapes).toEqual([
      { slot: 'action', lit: false },
      { slot: 'bonus', lit: true },
      { slot: 'reaction', lit: false },
    ]);
  });

  it('SLOT_NONE declaration lights nothing but is still listed', () => {
    const result = selectTurnHud({
      clock: ClockKind.TURN,
      declarations: [
        declaration({ slot: Slot.NONE, affordable: true, shortfall: '' }),
      ],
    });

    expect(result.mode).toBe('turn');
    if (result.mode !== 'turn') throw new Error('unreachable');
    expect(result.shapes).toEqual([
      { slot: 'action', lit: false },
      { slot: 'bonus', lit: false },
      { slot: 'reaction', lit: false },
    ]);
    expect(result.declarations).toEqual([
      { verb: Verb.ATTACK, slot: Slot.NONE, affordable: true, shortfall: '' },
    ]);
  });

  it('a SLOT_NONE declaration that has run out is still listed, unaffordable, nothing lit', () => {
    const result = selectTurnHud({
      clock: ClockKind.TURN,
      declarations: [
        declaration({
          slot: Slot.NONE,
          affordable: false,
          shortfall: 'attacks: 1 needed, 0 left',
        }),
      ],
    });

    expect(result.mode).toBe('turn');
    if (result.mode !== 'turn') throw new Error('unreachable');
    expect(result.shapes.every((s) => !s.lit)).toBe(true);
    expect(result.declarations).toEqual([
      {
        verb: Verb.ATTACK,
        slot: Slot.NONE,
        affordable: false,
        shortfall: 'attacks: 1 needed, 0 left',
      },
    ]);
  });

  describe('SLOT_UNSPECIFIED — a producer bug, not a fourth shape', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('lights nothing, still lists the declaration, and logs once', () => {
      const result = selectTurnHud({
        clock: ClockKind.TURN,
        declarations: [
          declaration({ slot: Slot.UNSPECIFIED, affordable: true }),
        ],
      });

      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.shapes.every((s) => !s.lit)).toBe(true);
      expect(result.declarations).toEqual([
        {
          verb: Verb.ATTACK,
          slot: Slot.UNSPECIFIED,
          affordable: true,
          shortfall: '',
        },
      ]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('logs exactly once even when multiple declarations carry SLOT_UNSPECIFIED', () => {
      selectTurnHud({
        clock: ClockKind.TURN,
        declarations: [
          declaration({ slot: Slot.UNSPECIFIED }),
          declaration({ slot: Slot.UNSPECIFIED }),
          declaration({ slot: Slot.ACTION }),
        ],
      });

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('does not log when every declaration has a real slot', () => {
      selectTurnHud({
        clock: ClockKind.TURN,
        declarations: [declaration({ slot: Slot.ACTION })],
      });

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  it('empty declarations on the turn clock -> all three shapes dim, empty declaration list', () => {
    const result = selectTurnHud({ clock: ClockKind.TURN, declarations: [] });

    expect(result.mode).toBe('turn');
    if (result.mode !== 'turn') throw new Error('unreachable');
    expect(result.shapes).toEqual([
      { slot: 'action', lit: false },
      { slot: 'bonus', lit: false },
      { slot: 'reaction', lit: false },
    ]);
    expect(result.declarations).toEqual([]);
  });
});
