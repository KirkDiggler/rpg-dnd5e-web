// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  projectRegionWallBoundaries,
  resolveAuthoringRegions,
} from './regionBoundaryGeometry';
import { createRoomLabel, useEnclosingWalls } from './regionEdits';
import {
  defaultPatternStart,
  resolvePatternStart,
  type RegionWallBoundary,
} from './regionSurfaceBoundary';
import { createRoomDraft, type RoomDraft } from './roomDraft';
import { createEmptyScene } from './sceneState';
import type { StructuralWall } from './structuralWalls';
import type { WorldPoint } from './types';

function wall(id: string, start: WorldPoint, end: WorldPoint): StructuralWall {
  return {
    id,
    label: id,
    line: { start, end },
    openings: [],
    appearance: {
      assetRef: 'dnd5e:env:dark-fortress:45_wall_01',
      height: 3,
      thickness: 0.3,
      elevation: 0,
    },
    blocker: {
      blocksMovement: true,
      blocksLineOfSight: true,
      footprint: {
        width: Math.hypot(end.x - start.x, end.z - start.z),
        depth: 0.25,
        offsetX: 0,
        offsetZ: 0,
      },
    },
  };
}
function twoRooms(): RoomDraft {
  const room = createRoomDraft(createEmptyScene('scene'), 'room');
  room.room.walls = [
    wall('z-top', { x: 0, z: 0 }, { x: 8, z: 0 }),
    wall('east', { x: 8, z: 0 }, { x: 8, z: 4 }),
    wall('bottom', { x: 8, z: 4 }, { x: 0, z: 4 }),
    wall('west', { x: 0, z: 4 }, { x: 0, z: 0 }),
    wall('a-divider', { x: 4, z: 0 }, { x: 4, z: 4 }),
  ];
  return createRoomLabel(
    createRoomLabel(room, 'left', 'left-label', 'Left', { x: 2, z: 2 }),
    'right',
    'right-label',
    'Right',
    { x: 6, z: 2 }
  );
}
function resolved(
  draft: RoomDraft,
  id = 'left'
): Extract<RegionWallBoundary, { status: 'resolved' }> {
  const result = projectRegionWallBoundaries(draft).find(
    (value) => value.id === id
  )!;
  expect(result.status).toBe('resolved');
  if (result.status !== 'resolved') throw new Error(result.reason);
  return result;
}

describe('certified room-facing wall provenance', () => {
  it('keeps runs aligned with the geometric ring rather than zipping its differently rotated witness', () => {
    const draft = twoRooms(),
      before = structuredClone(draft);
    const boundary = resolved(draft);
    const region = draft.scene.authoringRegions![0];
    expect(
      region.boundary.kind === 'automatic' &&
        region.boundary.witness?.walk[0].wallId
    ).toBe('a-divider');
    expect(boundary.sides[0]).toEqual({
      wallId: 'z-top',
      direction: 'start-to-end',
      side: 'positive-z',
      from: { x: 0, z: 0 },
      to: { x: 4, z: 0 },
      start: 0,
      end: 4,
    });
    expect(
      boundary.sides.find((side) => side.wallId === 'bottom')
    ).toMatchObject({ start: 4, end: 8 });
    expect(boundary.corners).toHaveLength(4);
    expect(draft).toEqual(before);
  });

  it('retains the certified full-span source through partial exterior overlap, without claiming its exterior tail', () => {
    const draft = createRoomDraft(createEmptyScene('scene'), 'room');
    draft.room.walls = [
      wall('owner', { x: 0, z: 0 }, { x: 10, z: 0 }),
      wall('tail', { x: 4, z: 0 }, { x: 12, z: 0 }),
      wall('east', { x: 8, z: 0 }, { x: 8, z: 4 }),
      wall('bottom', { x: 8, z: 4 }, { x: 0, z: 4 }),
      wall('west', { x: 0, z: 4 }, { x: 0, z: 0 }),
    ];
    const room = createRoomLabel(draft, 'inside', 'inside-label', 'Inside', {
      x: 2,
      z: 2,
    });
    const boundary = resolved(room, 'inside');
    expect(
      boundary.sides.find((side) => side.wallId === 'owner')
    ).toMatchObject({ start: 0, end: 8 });
    expect(boundary.sides.some((side) => side.wallId === 'tail')).toBe(false);
  });

  it('assigns shared opposite faces independently and clips same-side intervals at T junctions', () => {
    const draft = twoRooms(),
      left = resolved(draft),
      right = resolved(draft, 'right');
    expect(
      left.sides.find((side) => side.wallId === 'a-divider')
    ).toMatchObject({
      side: 'positive-z',
      direction: 'start-to-end',
      start: 0,
      end: 4,
    });
    expect(
      right.sides.find((side) => side.wallId === 'a-divider')
    ).toMatchObject({
      side: 'negative-z',
      direction: 'end-to-start',
      start: 0,
      end: 4,
    });
    expect(right.sides.find((side) => side.wallId === 'z-top')).toMatchObject({
      side: 'positive-z',
      start: 4,
      end: 8,
    });
    expect(left.sides.find((side) => side.wallId === 'z-top')).toMatchObject({
      side: 'positive-z',
      start: 0,
      end: 4,
    });
  });

  it('does not change boundary or pattern identity when labels move/rename or input walls reorder', () => {
    const draft = twoRooms(),
      before = resolved(draft),
      anchor = defaultPatternStart(before);
    expect(anchor.status).toBe('resolved');
    if (anchor.status !== 'resolved') throw new Error('Missing initial corner');
    draft.scene.mapLabels![0] = {
      ...draft.scene.mapLabels![0],
      text: 'Renamed',
      location: { x: 1, z: 1 },
    };
    draft.room.walls!.reverse();
    expect(resolved(draft)).toEqual(before);
    expect(resolvePatternStart(resolved(draft), anchor.reference)).toEqual(
      anchor
    );
  });

  it('resolves an explicitly chosen source corner after rotation instead of recomputing the default', () => {
    const draft = twoRooms(),
      anchor = defaultPatternStart(resolved(draft));
    if (anchor.status !== 'resolved') throw new Error('Missing initial corner');
    const rotate = (point: WorldPoint): WorldPoint => ({
      x: point.z === 0 ? 0 : -point.z,
      z: point.x,
    });
    for (const wall of draft.room.walls!)
      wall.line = {
        start: rotate(wall.line.start),
        end: rotate(wall.line.end),
      };
    for (const label of draft.scene.mapLabels!)
      label.location = rotate(label.location);
    const next = resolved(draft),
      found = resolvePatternStart(next, anchor.reference);
    expect(found).toEqual({ ...anchor, point: rotate(anchor.point) });
    expect(defaultPatternStart(next)).not.toEqual(found);
  });

  it('keeps unresolved/painted regions explicit and never substitutes a corner after source replacement', () => {
    let draft = twoRooms();
    const anchor = defaultPatternStart(resolved(draft));
    if (anchor.status !== 'resolved') throw new Error('Missing initial corner');
    draft.room.walls![0].id = 'replacement-top';
    expect(projectRegionWallBoundaries(draft)[0].status).toBe('unresolved');
    draft = useEnclosingWalls(draft, 'left');
    const repaired = resolved(draft);
    expect(resolvePatternStart(repaired, anchor.reference)).toEqual({
      status: 'unresolved',
      reason: 'missing-pattern-start',
    });
    draft.scene.authoringRegions![0].boundary = {
      kind: 'explicit',
      cells: [{ q: -3, r: -3 }],
    };
    expect(projectRegionWallBoundaries(draft)[0]).toEqual({
      id: 'left',
      status: 'unresolved',
      reason: 'not-wall-bound',
    });
  });

  it('carries the existing duplicate-room conflict rather than assigning a shared wall face twice', () => {
    const draft = createRoomLabel(
      twoRooms(),
      'duplicate',
      'duplicate-label',
      'Duplicate',
      { x: 1, z: 2 }
    );
    const statuses = resolveAuthoringRegions(draft);
    expect(
      projectRegionWallBoundaries(draft).filter((value) => value.id !== 'right')
    ).toEqual(statuses.filter((value) => value.id !== 'right'));
    expect(statuses.find((value) => value.id === 'left')).toMatchObject({
      status: 'unresolved',
      reason: 'duplicate-room-label',
    });
  });

  it('refuses missing, reversed and ambiguous references without choosing a replacement', () => {
    const boundary = resolved(twoRooms()),
      anchor = defaultPatternStart(boundary);
    if (anchor.status !== 'resolved') throw new Error('Missing initial corner');
    const reversed = structuredClone(anchor.reference);
    reversed.incoming.direction =
      reversed.incoming.direction === 'start-to-end'
        ? 'end-to-start'
        : 'start-to-end';
    expect(resolvePatternStart(boundary, reversed)).toEqual({
      status: 'unresolved',
      reason: 'missing-pattern-start',
    });
    const duplicate = {
      ...boundary,
      corners: [...boundary.corners, structuredClone(boundary.corners[0])],
    };
    expect(resolvePatternStart(duplicate, anchor.reference)).toEqual({
      status: 'unresolved',
      reason: 'ambiguous-pattern-start',
    });
    expect(defaultPatternStart({ ...boundary, corners: [] })).toEqual({
      status: 'unresolved',
      reason: 'no-pattern-corner',
    });
    expect(
      defaultPatternStart({
        id: 'room',
        status: 'unresolved',
        reason: 'unbound',
      })
    ).toEqual({ status: 'unresolved', reason: 'unbound' });
  });

  it('offers turns, not a flat change of source, as initial corner candidates; outputs are detached copies', () => {
    const draft = twoRooms();
    draft.scene.authoringRegions = [];
    draft.scene.mapLabels = [];
    draft.room.walls = draft.room.walls!.filter(
      (wall) => wall.id !== 'a-divider' && wall.id !== 'z-top'
    );
    draft.room.walls.push(
      wall('top-a', { x: 0, z: 0 }, { x: 4, z: 0 }),
      wall('top-b', { x: 4, z: 0 }, { x: 8, z: 0 })
    );
    const room = createRoomLabel(draft, 'whole', 'whole-label', 'Whole', {
      x: 2,
      z: 2,
    });
    const boundary = resolved(room, 'whole');
    expect(boundary.sides).toHaveLength(5);
    expect(boundary.corners).toHaveLength(4);
    expect(
      boundary.corners.some(
        (corner) => corner.point.x === 4 && corner.point.z === 0
      )
    ).toBe(false);
    const before = structuredClone(room),
      anchor = defaultPatternStart(boundary);
    if (anchor.status !== 'resolved') throw new Error('Missing initial corner');
    anchor.point.x = 999;
    anchor.reference.incoming.wallId = 'mutated';
    boundary.sides[0].from.x = 999;
    expect(room).toEqual(before);
    expect(resolved(room, 'whole').sides[0].from.x).toBe(0);
  });
});
