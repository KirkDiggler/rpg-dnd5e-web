// @vitest-environment node
import { create } from '@bufbuild/protobuf';
import {
  GetAtlasResponseSchema,
  type GetAtlasResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  AtlasSegmentSchema,
  AtlasStructuralDoorSchema,
  AtlasStructuralWallSchema,
  PositionSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { describe, expect, it } from 'vitest';
import {
  applyCellsRevealed,
  applyConcealmentRevealed,
  applyStructuralRecords,
} from './applyReveal';
import { segmentsToWallRuns } from './atlasWallRuns';
import { cellsPatch } from './revealPatches.test-fixtures';

const cell = (x: number, y: number) => ({ x, y });
const keys = (cells: readonly { x: number; y: number }[]) =>
  cells.map((c) => `${c.x},${c.y}`).sort();

/** A valid fixed wall record. Updates retain identity/order and pass the same
 * assembled-geometry validation as snapshots before reaching the renderer. */
const structuralWall = (id: string, openingIds: string[] = []) =>
  create(AtlasStructuralWallSchema, {
    id,
    ref: `ref:${id}`,
    from: { x: 0, y: 0 },
    to: { x: 10, y: 0 },
    height: 1,
    thickness: 1,
    elevation: 0,
    openings: openingIds.map((openingId, index) => ({
      id: openingId,
      position: index + 1,
      width: 0.5,
    })),
  });
const structuralDoor = (id: string) =>
  create(AtlasStructuralDoorSchema, {
    id,
    ref: `ref:${id}`,
    from: { x: 0, y: 0 },
    to: { x: 1, y: 0 },
    height: 1,
    thickness: 1,
    elevation: 0,
  });

function withStructure(
  walls: ReturnType<typeof structuralWall>[],
  doors: ReturnType<typeof structuralDoor>[] = []
): GetAtlasResponse {
  return create(GetAtlasResponseSchema, {
    structuralWalls: walls,
    structuralDoors: doors,
  });
}

describe('fixed structural records', () => {
  it('upserts the COMPLETE changed wall by id rather than appending a twin', () => {
    const before = withStructure([structuralWall('w', ['cut-1'])]);
    const after = applyStructuralRecords(
      before,
      [structuralWall('w', ['cut-1', 'cut-2'])],
      []
    );
    expect(after.structuralWalls).toHaveLength(1);
    expect(after.structuralWalls[0]!.openings.map((o) => o.id)).toEqual([
      'cut-1',
      'cut-2',
    ]);
  });

  it('restores canonical identity order for walls and doors', () => {
    const after = applyStructuralRecords(
      create(GetAtlasResponseSchema),
      [structuralWall('w2'), structuralWall('w1')],
      [structuralDoor('d2'), structuralDoor('d1')]
    );
    expect(after.structuralWalls.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(after.structuralDoors.map((d) => d.id)).toEqual(['d1', 'd2']);
  });

  it('is a NO-OP for empty legacy arrays — the same atlas object comes back', () => {
    const before = withStructure([structuralWall('w', ['cut-1'])]);
    expect(applyStructuralRecords(before, [], [])).toBe(before);
    expect(applyStructuralRecords(before, undefined, undefined)).toBe(before);
  });

  it('cannot be reverted by a later no-change reveal', () => {
    const before = withStructure([structuralWall('w', ['cut-1'])]);
    const revealed = applyStructuralRecords(
      before,
      [structuralWall('w', ['cut-1', 'cut-2'])],
      []
    );
    const later = applyStructuralRecords(revealed, [], []);
    expect(later.structuralWalls[0]!.openings.map((o) => o.id)).toEqual([
      'cut-1',
      'cut-2',
    ]);
  });

  it('is idempotent under double application', () => {
    const before = withStructure([]);
    const once = applyStructuralRecords(
      before,
      [structuralWall('w', ['cut-1'])],
      [structuralDoor('d')]
    );
    const twice = applyStructuralRecords(
      once,
      [structuralWall('w', ['cut-1'])],
      [structuralDoor('d')]
    );
    expect(twice.structuralWalls).toEqual(once.structuralWalls);
    expect(twice.structuralDoors).toEqual(once.structuralDoors);
  });

  it('carries the same delta on concealment reveal', () => {
    const before = withStructure([structuralWall('parent')]);
    const after = applyConcealmentRevealed(before, {
      structuralWalls: [structuralWall('parent', ['cut-2'])],
      structuralDoors: [structuralDoor('hidden')],
      structuralWallOpeningsReplacements: [],
      propPresentations: [],
    });
    // The parent wall is UPDATED with its newly known cut, and the door is an
    // independent row — never nested under the wall.
    expect(after.structuralWalls[0]!.openings.map((o) => o.id)).toEqual([
      'cut-2',
    ]);
    expect(after.structuralDoors.map((d) => d.id)).toEqual(['hidden']);
  });
});

describe('a cells reveal (fog of war, rpg-project#586)', () => {
  /** The corridor known whole; the prison cell partially. */
  const known = () =>
    create(GetAtlasResponseSchema, {
      cells: [cell(0, 0), cell(1, 0), cell(2, 0), cell(3, 0)],
      regions: [
        {
          id: 'corridor',
          name: 'Corridor',
          cells: [cell(0, 0), cell(1, 0), cell(2, 0), cell(3, 0)],
        },
      ],
    });
  const slice = (cells: { x: number; y: number }[], wallIds: string[] = []) =>
    cellsPatch({
      regions: [
        { id: 'prison', name: 'Prison cell', archetype: 'cell', cells },
      ],
      segments: [{ from: { q: 4, r: -1 }, to: { q: 3, r: 1 }, height: 0 }],
      structuralWalls: wallIds.map((id) => structuralWall(id)),
    });

  it('unions a partial region by id across two beats — the first slice is kept', () => {
    const first = applyCellsRevealed(known(), slice([cell(4, 0), cell(5, 0)]));
    const second = applyCellsRevealed(first, slice([cell(4, -1), cell(4, 0)]));
    const prison = second.regions.filter((r) => r.id === 'prison');
    expect(prison).toHaveLength(1);
    expect(keys(prison[0]!.cells)).toEqual(
      keys([cell(4, 0), cell(5, 0), cell(4, -1)])
    );
    expect(prison[0]!.archetype).toBe('cell');
    // The corridor is untouched and the atlas cells gained exactly the new ones.
    expect(
      keys(second.regions.find((r) => r.id === 'corridor')!.cells)
    ).toEqual(keys(known().regions[0]!.cells));
    expect(keys(second.cells)).toEqual(
      keys([...known().cells, cell(4, 0), cell(5, 0), cell(4, -1)])
    );
  });

  it('is idempotent under replay', () => {
    const event = slice([cell(4, 0), cell(5, 0)], ['w']);
    const once = applyCellsRevealed(known(), event);
    const twice = applyCellsRevealed(once, event);
    expect(twice).toEqual(once);
  });

  it('draws a wall sent twice exactly once — segment and structural record', () => {
    const once = applyCellsRevealed(known(), slice([cell(4, 0)], ['w']));
    const twice = applyCellsRevealed(once, slice([cell(5, 0)], ['w']));
    expect(twice.segments).toHaveLength(1);
    expect(twice.structuralWalls.map((w) => w.id)).toEqual(['w']);
    expect(segmentsToWallRuns(twice, 1).wallRuns).toHaveLength(
      segmentsToWallRuns(once, 1).wallRuns.length
    );
  });

  it('newly owned cells leave sealed; the event’s sealed goes back in', () => {
    const before = known();
    before.sealed = [
      create(PositionSchema, cell(4, 0)),
      create(PositionSchema, cell(6, 0)),
    ];
    const after = applyCellsRevealed(
      before,
      cellsPatch({
        regions: [{ id: 'prison', cells: [cell(4, 0)] }],
        sealed: [cell(7, 0)],
      })
    );
    expect(keys(after.sealed)).toEqual(keys([cell(6, 0), cell(7, 0)]));
  });

  it('never drops a segment the patch did not repeat', () => {
    const before = known();
    before.segments = [
      create(AtlasSegmentSchema, {
        from: { q: 9, r: -1 },
        to: { q: 8, r: 1 },
        height: 0,
      }),
    ];
    const after = applyCellsRevealed(before, slice([cell(4, 0)]));
    expect(after.segments).toHaveLength(2);
    expect(after.segments[0]).toEqual(before.segments[0]);
  });

  it('detaches the event’s rows from the patched atlas', () => {
    const event = slice([cell(4, 0)]);
    const after = applyCellsRevealed(known(), event);
    event.regions[0]!.cells.push(create(PositionSchema, cell(9, 9)));
    expect(keys(after.regions.find((r) => r.id === 'prison')!.cells)).toEqual(
      keys([cell(4, 0)])
    );
  });
});
