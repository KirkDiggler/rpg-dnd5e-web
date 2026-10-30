// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  projectRegionWallBoundaries,
  resolveRegions,
} from './regionBoundaryGeometry';
import { createRegion, removeRegion } from './regionEdits';
import {
  createRoomDraft,
  eraseCells,
  paintCells,
  type RoomDraft,
} from './roomDraft';
import { finishWall } from './roomFinishTestFixtures';
import { createEmptyScene } from './sceneState';

/*
 * Regions are the floor (rpg-project#725): a region resolves to the cells it
 * lists. The enclosure finder (authored endpoint joins, collinear coverage,
 * certified faces, witnesses, seed-on-boundary refusals) is retired with the
 * automatic regions, so its geometry tests are gone; what remains is the
 * projection from listed cells and the wall-side answer for every region.
 */

function hallAndNook(): RoomDraft {
  let draft = createRoomDraft(createEmptyScene('scene'), 'room');
  draft = paintCells(draft, [
    { q: 2, r: 0 },
    { q: 0, r: 0 },
    { q: 1, r: 0 },
  ]);
  draft = createRegion(draft, 'nook', 'Nook');
  return paintCells(draft, [{ q: 0, r: 1 }], 'nook');
}

describe('resolveRegions', () => {
  it('resolves each painted region to exactly the cells it owns, in list order', () => {
    const draft = hallAndNook(),
      before = structuredClone(draft);
    expect(resolveRegions(draft)).toEqual([
      {
        id: 'room-region',
        status: 'resolved',
        area: {
          kind: 'hex-union',
          cells: [
            { q: 0, r: 0 },
            { q: 1, r: 0 },
            { q: 2, r: 0 },
          ],
        },
      },
      {
        id: 'nook',
        status: 'resolved',
        area: { kind: 'hex-union', cells: [{ q: 0, r: 1 }] },
      },
    ]);
    expect(draft).toEqual(before);
  });

  it('a declared, unpainted region is unresolved with reason empty', () => {
    expect(
      resolveRegions(createRoomDraft(createEmptyScene('scene'), 'room'))
    ).toEqual([{ id: 'room-region', status: 'unresolved', reason: 'empty' }]);
    const erased = eraseCells(hallAndNook(), [{ q: 0, r: 1 }]);
    expect(resolveRegions(erased)[1]).toEqual({
      id: 'nook',
      status: 'unresolved',
      reason: 'empty',
    });
  });

  it('follows repainting and removal: cells move with their owner', () => {
    const moved = paintCells(hallAndNook(), [{ q: 2, r: 0 }], 'nook');
    const [hall, nook] = resolveRegions(moved);
    expect(hall).toMatchObject({
      area: {
        cells: [
          { q: 0, r: 0 },
          { q: 1, r: 0 },
        ],
      },
    });
    expect(nook).toMatchObject({
      area: {
        cells: [
          { q: 2, r: 0 },
          { q: 0, r: 1 },
        ],
      },
    });
    const removed = resolveRegions(removeRegion(moved, 'nook'));
    expect(removed.map((row) => row.id)).toEqual(['room-region']);
    expect(removed[0]).toMatchObject({ status: 'resolved' });
    if (removed[0].status !== 'resolved') throw new Error('unresolved');
    expect(removed[0].area.cells).toHaveLength(4);
  });

  it('reads no walls: closing walls around the floor changes nothing', () => {
    const draft = hallAndNook();
    const walled: RoomDraft = {
      ...draft,
      room: {
        ...draft.room,
        walls: [
          finishWall('north', { x: -2, z: -2 }, { x: 6, z: -2 }),
          finishWall('east', { x: 6, z: -2 }, { x: 6, z: 3 }),
          finishWall('south', { x: 6, z: 3 }, { x: -2, z: 3 }),
          finishWall('west', { x: -2, z: 3 }, { x: -2, z: -2 }),
        ],
      },
    };
    expect(resolveRegions(walled)).toEqual(resolveRegions(draft));
  });

  it('returns detached cells', () => {
    const draft = hallAndNook();
    const [hall] = resolveRegions(draft);
    if (hall.status !== 'resolved') throw new Error('unresolved');
    hall.area.cells[0].q = 99;
    const [again] = resolveRegions(draft);
    if (again.status !== 'resolved') throw new Error('unresolved');
    expect(again.area.cells[0]).toEqual({ q: 0, r: 0 });
  });
});

describe('projectRegionWallBoundaries', () => {
  // Only the retired automatic regions were wall-bound; a region of listed
  // cells names no wall face, painted or not, walled or not.
  it('answers not-wall-bound for every region', () => {
    const draft = createRegion(hallAndNook(), 'cellar', 'Cellar');
    draft.room.walls = [
      finishWall('north', { x: -2, z: -2 }, { x: 6, z: -2 }),
      finishWall('east', { x: 6, z: -2 }, { x: 6, z: 3 }),
      finishWall('south', { x: 6, z: 3 }, { x: -2, z: 3 }),
      finishWall('west', { x: -2, z: 3 }, { x: -2, z: -2 }),
    ];
    expect(projectRegionWallBoundaries(draft)).toEqual(
      ['room-region', 'nook', 'cellar'].map((id) => ({
        id,
        status: 'unresolved',
        reason: 'not-wall-bound',
      }))
    );
  });
});
