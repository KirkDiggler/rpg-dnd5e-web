import { describe, expect, it } from 'vitest';
import { isSameSelection } from './boardGeometry';
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
