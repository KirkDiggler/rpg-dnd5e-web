import {
  ClockKind,
  Currency,
  MemberKind,
  ShortfallReason,
  Slot,
  Standing,
  Verb,
  type Declaration,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import { selectCombatPanel, type SelectCombatPanelArgs } from './combatPanel';

function participant(overrides: Partial<Participant> = {}): Participant {
  return {
    member: 'char-1',
    name: 'Aldric',
    kind: MemberKind.PLAYER,
    standing: Standing.UP,
    active: true,
    ...overrides,
  } as Participant;
}

const defaultParticipants: Participant[] = [
  participant(),
  participant({
    member: 'skeleton-1',
    name: 'skeleton-1',
    kind: MemberKind.MONSTER,
    active: false,
  }),
];

/** One in-reach ATTACK declaration for a given target. */
function attackDeclaration(
  target: string,
  overrides: Partial<Declaration> = {}
): Declaration {
  return {
    verb: Verb.ATTACK,
    slot: Slot.ACTION,
    affordable: true,
    shortfall: '',
    target,
    ...overrides,
  } as Declaration;
}

/** The single untargeted "nothing in reach" declaration. */
function noTargetDeclaration(
  overrides: Partial<Declaration> = {}
): Declaration {
  return {
    verb: Verb.ATTACK,
    slot: Slot.ACTION,
    affordable: false,
    shortfall: 'no target in reach',
    why: {
      reason: ShortfallReason.NO_TARGET_IN_REACH,
      currency: Currency.UNSPECIFIED,
      needed: 0,
      left: 0,
      text: 'no target in reach',
    },
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
      participants: defaultParticipants,
    },
    afford: {
      clock: ClockKind.TURN,
      declarations: [attackDeclaration('skeleton-1')],
    },
    member: 'char-1',
    hoveredEntityId: null,
    lastBeat: null,
    ...overrides,
  };
}

describe('selectCombatPanel', () => {
  it('world clock -> free-roam, regardless of Afford/hover/beat', () => {
    expect(
      selectCombatPanel(
        args({
          turn: {
            clock: ClockKind.WORLD,
            active: '',
            round: 0,
            participants: [],
          },
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
            participants: [],
          },
        })
      )
    ).toEqual({ mode: 'free-roam' });
  });

  describe('participants — names, active, you, downed (rpg-dnd5e-web#564)', () => {
    it('maps the roster by name, marking active/you/downed independently', () => {
      const result = selectCombatPanel(
        args({
          turn: {
            clock: ClockKind.TURN,
            active: 'skeleton-1',
            round: 3,
            participants: [
              participant({ active: false }),
              participant({
                member: 'skeleton-1',
                name: 'skeleton-1',
                kind: MemberKind.MONSTER,
                standing: Standing.DOWNED,
                active: true,
              }),
            ],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.round).toBe(3);
      expect(result.participants).toEqual([
        {
          id: 'char-1',
          name: 'Aldric',
          isActive: false,
          isYou: true,
          isDowned: false,
        },
        {
          id: 'skeleton-1',
          name: 'skeleton-1',
          isActive: true,
          isYou: false,
          isDowned: true,
        },
      ]);
    });

    it('a single-member roster (degenerate but legal) still maps cleanly', () => {
      const result = selectCombatPanel(
        args({
          turn: {
            clock: ClockKind.TURN,
            active: 'char-1',
            round: 1,
            participants: [participant()],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.participants).toEqual([
        {
          id: 'char-1',
          name: 'Aldric',
          isActive: true,
          isYou: true,
          isDowned: false,
        },
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

    it('NOT your turn -> every shape reads dim even though Afford reports it affordable, AND attackTargets is empty (the economy answer is not the turn answer)', () => {
      const result = selectCombatPanel(
        args({
          turn: {
            clock: ClockKind.TURN,
            active: 'skeleton-1',
            round: 1,
            participants: defaultParticipants,
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.shapes.every((s) => !s.lit)).toBe(true);
      expect(result.attackTargets).toEqual([]);
    });

    it("Afford's own clock disagreeing with Turn's (should-never-happen) falls back to every shape dim, no targets, no movement, rather than trusting the mismatch", () => {
      const result = selectCombatPanel(
        args({ afford: { clock: ClockKind.WORLD, declarations: [] } })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.shapes.every((s) => !s.lit)).toBe(true);
      expect(result.attackTargets).toEqual([]);
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
              attackDeclaration('skeleton-1'),
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

    it('null when no Move declaration is present at all — the honest "nothing to report" reading, not a guessed zero', () => {
      const result = selectCombatPanel(
        args({
          afford: {
            clock: ClockKind.TURN,
            declarations: [attackDeclaration('skeleton-1')],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.movement).toBeNull();
      expect(result.moveMaxCells).toBe(0);
    });
  });

  describe('attackTargets — per-target declarations drive the floor (rpg-project#249 §3)', () => {
    it('one row per in-reach target, named from the roster, affordability and why carried through', () => {
      const result = selectCombatPanel(
        args({
          afford: {
            clock: ClockKind.TURN,
            declarations: [
              attackDeclaration('skeleton-1', { affordable: true }),
            ],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.attackTargets).toEqual([
        {
          id: 'skeleton-1',
          name: 'skeleton-1',
          affordable: true,
          whyText: null,
        },
      ]);
      expect(result.noTargetInReachText).toBeNull();
    });

    it('several candidates in reach all appear, independently affordable', () => {
      const result = selectCombatPanel(
        args({
          turn: {
            clock: ClockKind.TURN,
            active: 'char-1',
            round: 1,
            participants: [
              participant(),
              participant({
                member: 'skeleton-1',
                name: 'skeleton-1',
                kind: MemberKind.MONSTER,
                active: false,
              }),
              participant({
                member: 'skeleton-2',
                name: 'skeleton-2',
                kind: MemberKind.MONSTER,
                active: false,
              }),
            ],
          },
          afford: {
            clock: ClockKind.TURN,
            declarations: [
              attackDeclaration('skeleton-1', { affordable: true }),
              attackDeclaration('skeleton-2', {
                affordable: false,
                why: {
                  reason: ShortfallReason.NO_BUDGET,
                  currency: Currency.ACTION,
                  needed: 1,
                  left: 0,
                  text: 'action: 1 needed, 0 left',
                } as never,
              }),
            ],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.attackTargets).toEqual([
        {
          id: 'skeleton-1',
          name: 'skeleton-1',
          affordable: true,
          whyText: null,
        },
        {
          id: 'skeleton-2',
          name: 'skeleton-2',
          affordable: false,
          whyText: 'action: 1 needed, 0 left',
        },
      ]);
    });

    it("nothing in reach -> attackTargets empty, noTargetInReachText carries the single untargeted declaration's text", () => {
      const result = selectCombatPanel(
        args({
          afford: {
            clock: ClockKind.TURN,
            declarations: [noTargetDeclaration()],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.attackTargets).toEqual([]);
      expect(result.noTargetInReachText).toBe('no target in reach');
    });

    it('prefers why.text over the legacy shortfall string when both are present', () => {
      const result = selectCombatPanel(
        args({
          afford: {
            clock: ClockKind.TURN,
            declarations: [
              attackDeclaration('skeleton-1', {
                affordable: false,
                shortfall: 'legacy text',
                why: {
                  reason: ShortfallReason.NO_BUDGET,
                  currency: Currency.ACTION,
                  needed: 1,
                  left: 0,
                  text: 'structured text',
                } as never,
              }),
            ],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.attackTargets[0]!.whyText).toBe('structured text');
    });

    it('falls back to the legacy shortfall string when why is absent (a v0.1.131 server)', () => {
      const result = selectCombatPanel(
        args({
          afford: {
            clock: ClockKind.TURN,
            declarations: [
              attackDeclaration('skeleton-1', {
                affordable: false,
                shortfall: 'legacy only',
              }),
            ],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.attackTargets[0]!.whyText).toBe('legacy only');
    });

    it('not your turn -> attackTargets and noTargetInReachText both empty, regardless of what Afford says', () => {
      const result = selectCombatPanel(
        args({
          turn: {
            clock: ClockKind.TURN,
            active: 'skeleton-1',
            round: 1,
            participants: defaultParticipants,
          },
          afford: {
            clock: ClockKind.TURN,
            declarations: [attackDeclaration('skeleton-1')],
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.attackTargets).toEqual([]);
      expect(result.noTargetInReachText).toBeNull();
    });
  });

  describe('hoverLabel', () => {
    it('"Attack <name>" when hovering an affordable in-reach target', () => {
      const result = selectCombatPanel(args({ hoveredEntityId: 'skeleton-1' }));
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.hoverLabel).toBe('Attack skeleton-1');
    });

    it("that target's own shortfall text when hovering an unaffordable in-reach target", () => {
      const result = selectCombatPanel(
        args({
          afford: {
            clock: ClockKind.TURN,
            declarations: [
              attackDeclaration('skeleton-1', {
                affordable: false,
                why: {
                  reason: ShortfallReason.NO_BUDGET,
                  currency: Currency.ACTION,
                  needed: 1,
                  left: 0,
                  text: 'action: 1 needed, 0 left',
                } as never,
              }),
            ],
          },
          hoveredEntityId: 'skeleton-1',
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.hoverLabel).toBe('action: 1 needed, 0 left');
    });

    it('null when hovering nothing', () => {
      const result = selectCombatPanel(args({ hoveredEntityId: null }));
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.hoverLabel).toBeNull();
    });

    it('null when hovering an entity that is not an in-reach candidate at all', () => {
      const result = selectCombatPanel(args({ hoveredEntityId: 'zombie-9' }));
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.hoverLabel).toBeNull();
    });

    it('null when not your turn, even if hovering a subject that would otherwise be in reach', () => {
      const result = selectCombatPanel(
        args({
          turn: {
            clock: ClockKind.TURN,
            active: 'skeleton-1',
            round: 1,
            participants: defaultParticipants,
          },
          hoveredEntityId: 'skeleton-1',
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.hoverLabel).toBeNull();
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
            participants: defaultParticipants,
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

  describe('waitingOnName', () => {
    it('null on your own turn', () => {
      const result = selectCombatPanel(args());
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.waitingOnName).toBeNull();
    });

    it("names the active member (by roster name) when it's not your turn", () => {
      const result = selectCombatPanel(
        args({
          turn: {
            clock: ClockKind.TURN,
            active: 'skeleton-1',
            round: 1,
            participants: defaultParticipants,
          },
        })
      );
      expect(result.mode).toBe('turn');
      if (result.mode !== 'turn') throw new Error('unreachable');
      expect(result.waitingOnName).toBe('skeleton-1');
    });
  });

  it('lastBeat passes through unchanged', () => {
    const result = selectCombatPanel(
      args({ lastBeat: 'You hit skeleton-1 — 17 vs AC 13, 6 slashing.' })
    );
    expect(result.mode).toBe('turn');
    if (result.mode !== 'turn') throw new Error('unreachable');
    expect(result.lastBeat).toBe(
      'You hit skeleton-1 — 17 vs AC 13, 6 slashing.'
    );
  });
});
