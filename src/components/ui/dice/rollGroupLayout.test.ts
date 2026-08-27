import { describe, expect, it } from 'vitest';
import type { DiceKind } from './diceRollGroup';
import {
  layoutHeldRollGroup,
  layoutRestingRollGroup,
  type RollGroupMemberLayout,
} from './rollGroupLayout';

function makeDice(kinds: readonly DiceKind[]) {
  return kinds.map((kind, index) => ({
    id: `die:${index + 1}`,
    kind,
  }));
}

function expectFiniteLayout(layout: readonly RollGroupMemberLayout[]) {
  for (const member of layout) {
    expect(Number.isFinite(member.center[0])).toBe(true);
    expect(Number.isFinite(member.center[1])).toBe(true);
    expect(Number.isFinite(member.radius)).toBe(true);
    expect(member.radius).toBeGreaterThan(0);
  }
}

function expectNoOverlap(layout: readonly RollGroupMemberLayout[]) {
  for (let index = 0; index < layout.length; index += 1) {
    for (let other = index + 1; other < layout.length; other += 1) {
      const first = layout[index];
      const second = layout[other];
      const distance = Math.hypot(
        first.center[0] - second.center[0],
        first.center[1] - second.center[1]
      );
      expect(distance + 1e-9).toBeGreaterThanOrEqual(
        first.radius + second.radius
      );
    }
  }
}

function extents(layout: readonly RollGroupMemberLayout[]) {
  return layout.reduce(
    (current, member) => ({
      minX: Math.min(current.minX, member.center[0] - member.radius),
      maxX: Math.max(current.maxX, member.center[0] + member.radius),
      minY: Math.min(current.minY, member.center[1] - member.radius),
      maxY: Math.max(current.maxY, member.center[1] + member.radius),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    }
  );
}

describe('rollGroupLayout', () => {
  it.each([
    [['d20'] as const],
    [['d20', 'd6'] as const],
    [['d20', 'd6', 'd8'] as const],
    [['d4', 'd6', 'd8', 'd20'] as const],
    [['d6', 'd6', 'd6', 'd6', 'd6', 'd6', 'd6', 'd6'] as const],
  ])('returns a compact, stable held layout for %j', (kinds) => {
    const dice = makeDice(kinds);
    const layout = layoutHeldRollGroup(dice);
    const bounds = extents(layout);

    expect(layout.map((member) => member.dieId)).toEqual(
      dice.map((die) => die.id)
    );
    expect(layoutHeldRollGroup(dice)).toEqual(layout);
    expectFiniteLayout(layout);
    expectNoOverlap(layout);
    expect(bounds.minX).toBeGreaterThanOrEqual(-0.5);
    expect(bounds.maxX).toBeLessThanOrEqual(0.5);
    expect(bounds.minY).toBeGreaterThanOrEqual(-0.5);
    expect(bounds.maxY).toBeLessThanOrEqual(0.5);
  });

  it.each([
    [['d20'] as const],
    [['d20', 'd6'] as const],
    [['d20', 'd6', 'd8'] as const],
    [['d4', 'd6', 'd8', 'd20'] as const],
    [['d6', 'd6', 'd6', 'd6', 'd6', 'd6', 'd6', 'd6'] as const],
  ])('returns a deterministic seeded resting layout for %j', (kinds) => {
    const dice = makeDice(kinds);
    const first = layoutRestingRollGroup(dice, 0x1020_3040);
    const second = layoutRestingRollGroup(dice, 0x1020_3040);
    const changedSeed = layoutRestingRollGroup(dice, 0x1020_3041);
    const bounds = extents(first);

    expect(first.map((member) => member.dieId)).toEqual(
      dice.map((die) => die.id)
    );
    expect(second).toEqual(first);
    expect(layoutRestingRollGroup([...dice], 0x1020_3040)).toEqual(first);
    if (dice.length > 1) expect(changedSeed).not.toEqual(first);
    expectFiniteLayout(first);
    expectNoOverlap(first);
    expect(bounds.minX).toBeGreaterThanOrEqual(-0.72);
    expect(bounds.maxX).toBeLessThanOrEqual(0.72);
    expect(bounds.minY).toBeGreaterThanOrEqual(-0.72);
    expect(bounds.maxY).toBeLessThanOrEqual(0.72);
  });
});
