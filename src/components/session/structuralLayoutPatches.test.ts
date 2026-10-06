// @vitest-environment node
import { clone, create } from '@bufbuild/protobuf';
import {
  ConcealmentRevealedSchema,
  RegionRevealedSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { GetAtlasResponseSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  AtlasStructuralDoorSchema,
  AtlasStructuralWallSchema,
  StructuralWallOpeningsReplacementSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  applyConcealmentRevealed,
  applyRegionRevealed,
  applyStructuralRecords,
} from './applyReveal';

const opening = (id: string, position = 3, width = 1) => ({
  id,
  position,
  width,
});
const wall = () =>
  create(AtlasStructuralWallSchema, {
    id: 'wall',
    ref: 'content:wall',
    from: { x: 0, y: 0 },
    to: { x: 10, y: 0 },
    height: 8,
    thickness: 0.5,
    elevation: -1,
    openings: [opening('old')],
  });
const door = () =>
  create(AtlasStructuralDoorSchema, {
    id: 'site/door',
    ref: 'content:door',
    from: { x: 3, y: 0 },
    to: { x: 5, y: 0 },
    height: 8,
    thickness: 0.5,
    elevation: -1,
  });
const baseline = () =>
  create(GetAtlasResponseSchema, { structuralWalls: [wall()] });
const replacement = (wallId = 'wall', openings = [opening('new', 4, 2)]) =>
  create(StructuralWallOpeningsReplacementSchema, { wallId, openings });

describe('structural component replacements', () => {
  it('replaces only openings and introduces the door in the same immutable update', () => {
    const before = baseline();
    const event = create(ConcealmentRevealedSchema, {
      concealment: 'secret',
      structuralDoors: [door()],
      structuralWallOpeningsReplacements: [replacement()],
    });
    const after = applyConcealmentRevealed(before, event);
    expect(after.structuralWalls[0]).toEqual({
      ...wall(),
      openings: replacement().openings,
    });
    expect(after.structuralDoors).toEqual([door()]);
    expect(before.structuralWalls[0].openings.map((o) => o.id)).toEqual([
      'old',
    ]);
    expect(before.structuralDoors).toEqual([]);
    after.structuralWalls[0].openings[0].width = 9;
    after.structuralDoors[0].from!.x = 9;
    expect(event.structuralWallOpeningsReplacements[0].openings[0].width).toBe(
      2
    );
    expect(event.structuralDoors[0].from!.x).toBe(3);
  });

  it('applies the same component through a room reveal', () => {
    const after = applyRegionRevealed(
      baseline(),
      create(RegionRevealedSchema, {
        region: { id: 'room' },
        structuralWallOpeningsReplacements: [replacement()],
      })
    );
    expect(after.structuralWalls[0].openings.map((o) => o.id)).toEqual(['new']);
  });

  it('distinguishes an absent record from present empty/default clears', () => {
    const before = baseline();
    expect(
      applyConcealmentRevealed(before, create(ConcealmentRevealedSchema))
    ).toBe(before);
    for (const patch of [
      replacement('wall', []),
      create(StructuralWallOpeningsReplacementSchema, { wallId: 'wall' }),
    ]) {
      const after = applyStructuralRecords(before, [], [], [patch]);
      expect(after.structuralWalls[0].openings).toEqual([]);
      expect(before.structuralWalls[0].openings).toHaveLength(1);
    }
  });

  it('rejects an unknown baseline atomically, including its sibling door', () => {
    const before = baseline();
    const untouched = clone(GetAtlasResponseSchema, before);
    expect(() =>
      applyStructuralRecords(before, [], [door()], [replacement('missing')])
    ).toThrow(/missing.*wall|unknown.*wall/i);
    expect(before).toEqual(untouched);
  });

  it.each([
    ['empty wall id', [replacement('')]],
    ['duplicate wall patches', [replacement(), replacement()]],
    ['empty opening id', [replacement('wall', [opening('')])]],
    [
      'duplicate opening ids',
      [replacement('wall', [opening('same', 2), opening('same', 6)])],
    ],
  ] as const)('refuses %s without partial application', (_name, patches) => {
    const before = baseline();
    const untouched = clone(GetAtlasResponseSchema, before);
    expect(() =>
      applyStructuralRecords(before, [], [door()], patches)
    ).toThrow();
    expect(before).toEqual(untouched);
  });

  it('refuses a same-event full wall and component collision', () => {
    expect(() =>
      applyStructuralRecords(baseline(), [wall()], [], [replacement()])
    ).toThrow(/duplicate|collision/i);
  });

  it.each([
    [opening('outside', 10, 2)],
    [opening('one', 3, 2), opening('two', 4, 2)],
    [opening('bad-width', 3, -1)],
  ])('validates the assembled geometry before committing it', (...openings) => {
    const before = baseline();
    expect(() =>
      applyStructuralRecords(
        before,
        [],
        [door()],
        [replacement('wall', openings)]
      )
    ).toThrow();
    expect(before.structuralDoors).toEqual([]);
    expect(before.structuralWalls[0].openings.map((o) => o.id)).toEqual([
      'old',
    ]);
  });
});
