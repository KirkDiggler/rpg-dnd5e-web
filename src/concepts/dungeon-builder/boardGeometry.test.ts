import { describe, expect, it } from 'vitest';
import {
  isSameSelection,
  neighborCell,
  stepWallFacing,
  wallBearingFacings,
} from './boardGeometry';
import type { WallDoc } from './dungeonYaml';
import type { PlacementSelection } from './types';

const roomA0: PlacementSelection = { roomId: 'room-a', index: 0 };
const roomA1: PlacementSelection = { roomId: 'room-a', index: 1 };
const roomB0: PlacementSelection = { roomId: 'room-b', index: 0 };
const topLevel0: PlacementSelection = { roomId: null, index: 0 };
const topLevel1: PlacementSelection = { roomId: null, index: 1 };
const bossA: PlacementSelection = { roomId: 'room-a', boss: true };
const bossB: PlacementSelection = { roomId: 'room-b', boss: true };

describe('isSameSelection (Kirk\'s 2026-08-02 "3D editing" arc, part 2 — click-select shared between Board.tsx and DungeonPreview3D.tsx)', () => {
  it('is false when there is no current selection', () => {
    expect(isSameSelection(null, roomA0)).toBe(false);
    expect(isSameSelection(undefined, roomA0)).toBe(false);
  });

  it('matches a room-scoped selection by roomId + index', () => {
    expect(isSameSelection(roomA0, roomA0)).toBe(true);
    expect(isSameSelection({ ...roomA0 }, roomA0)).toBe(true);
  });

  it('does not match a different index in the same room', () => {
    expect(isSameSelection(roomA0, roomA1)).toBe(false);
  });

  it('does not match the same index in a different room', () => {
    expect(isSameSelection(roomA0, roomB0)).toBe(false);
  });

  it('matches a top-level selection (roomId: null) by index alone', () => {
    expect(isSameSelection(topLevel0, topLevel0)).toBe(true);
    expect(isSameSelection(topLevel0, topLevel1)).toBe(false);
  });

  it('never matches a top-level selection against a room-scoped one at the same index — roomId: null is not a wildcard', () => {
    expect(isSameSelection(topLevel0, roomA0)).toBe(false);
    expect(isSameSelection(roomA0, topLevel0)).toBe(false);
  });

  it('matches a boss selection by roomId alone, ignoring index', () => {
    expect(isSameSelection(bossA, bossA)).toBe(true);
    expect(isSameSelection(bossA, bossB)).toBe(false);
  });

  it('never matches a boss selection against a non-boss one in the same room — boss is a distinct slot, not place[0]', () => {
    expect(isSameSelection(bossA, roomA0)).toBe(false);
    expect(isSameSelection(roomA0, bossA)).toBe(false);
  });
});

describe('wallBearingFacings / stepWallFacing (wall-mount edge-selection rework, Kirk\'s 2026-08-02 "I can only line up 1 direction" finding)', () => {
  const ABS_COL = 5;
  const ROW = 3;

  it('finds a wall authored {from: here, to: neighbor}', () => {
    const n = neighborCell(ABS_COL, ROW, 1); // NE
    const walls: WallDoc[] = [
      { from: [ABS_COL, ROW], to: [n.col, n.row], kind: 'solid' },
    ];
    expect(wallBearingFacings(walls, ABS_COL, ROW)).toEqual([1]);
  });

  it('finds a wall authored from the OTHER side, {from: neighbor, to: here}', () => {
    const n = neighborCell(ABS_COL, ROW, 4); // SW
    const walls: WallDoc[] = [
      { from: [n.col, n.row], to: [ABS_COL, ROW], kind: 'door' },
    ];
    expect(wallBearingFacings(walls, ABS_COL, ROW)).toEqual([4]);
  });

  it('returns every bearing facing, sorted 0-5, when multiple edges have walls', () => {
    const n0 = neighborCell(ABS_COL, ROW, 0);
    const n3 = neighborCell(ABS_COL, ROW, 3);
    const walls: WallDoc[] = [
      { from: [ABS_COL, ROW], to: [n0.col, n0.row], kind: 'solid' },
      { from: [ABS_COL, ROW], to: [n3.col, n3.row], kind: 'solid' },
    ];
    expect(wallBearingFacings(walls, ABS_COL, ROW)).toEqual([0, 3]);
  });

  it('returns empty for a cell with no adjacent walls', () => {
    expect(wallBearingFacings([], ABS_COL, ROW)).toEqual([]);
  });

  it('ignores a wall on an unrelated cell pair', () => {
    const walls: WallDoc[] = [
      { from: [100, 100], to: [101, 100], kind: 'solid' },
    ];
    expect(wallBearingFacings(walls, ABS_COL, ROW)).toEqual([]);
  });

  it('steps forward/backward cyclically through the bearing list', () => {
    const bearing = [1, 3, 5];
    expect(stepWallFacing(1, bearing, 1)).toBe(3);
    expect(stepWallFacing(3, bearing, 1)).toBe(5);
    expect(stepWallFacing(5, bearing, 1)).toBe(1); // wraps forward
    expect(stepWallFacing(1, bearing, -1)).toBe(5); // wraps backward
    expect(stepWallFacing(3, bearing, -1)).toBe(1);
  });

  it('snaps to the first bearing edge when current facing is not one of them', () => {
    expect(stepWallFacing(2, [1, 3, 5], 1)).toBe(1);
    expect(stepWallFacing(null, [1, 3, 5], 1)).toBe(1);
  });

  it('falls back to plain 6-direction stepping when the cell has no wall-bearing edge at all', () => {
    expect(stepWallFacing(0, [], 1)).toBe(1);
    expect(stepWallFacing(0, [], -1)).toBe(5);
    expect(stepWallFacing(null, [], 1)).toBe(1);
  });
});
