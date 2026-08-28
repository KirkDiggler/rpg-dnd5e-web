import { describe, expect, it } from 'vitest';
import { buildAtlasPathIndex, findAtlasPath } from './atlasPath';
import { affordableCellCount, selectMoveIndicator } from './moveIndicator';
import { cubeToPosition } from './positionBridge';

const pos = (x: number, y: number) => ({ x, y }) as never;

/** A 1x3 open corridor: (0,0) -- (1,0) -- (2,-1) (hex-adjacent, no
 * boundaries/doorways/props — every edge is open floor). Mirrors
 * useSessionWalk.test.ts's own `corridorIndex` fixture exactly, so the
 * "identical to what the walk hook sends" test below is a direct
 * cross-check against that file's "walkTo a reachable cell sends the
 * request path" case. */
function corridorIndex() {
  return buildAtlasPathIndex({
    cells: [pos(0, 0), pos(1, 0), pos(2, -1)],
    boundaries: [],
    doorways: [],
    props: [],
  });
}

/** Two open cells, (0,0) and (5,-5) declared as floor but with nothing
 * connecting them (no adjacent cells between) — an isolated, unreachable
 * pocket even though the destination itself is legitimate floor. */
function unreachablePocketIndex() {
  return buildAtlasPathIndex({
    cells: [pos(0, 0), pos(5, -5)],
    boundaries: [],
    doorways: [],
    props: [],
  });
}

/** The same 1x3 corridor, but with a movement-blocking boundary (and no
 * doorway) between the middle and far cell — a "wall" separating a
 * reachable cell from an unreachable one. */
function walledCorridorIndex() {
  return buildAtlasPathIndex({
    cells: [pos(0, 0), pos(1, 0), pos(2, -1)],
    boundaries: [
      { from: pos(1, 0), to: pos(2, -1), blocksMovement: true } as never,
    ],
    doorways: [],
    props: [],
  });
}

describe('selectMoveIndicator', () => {
  it('returns null when nothing is hovered', () => {
    expect(
      selectMoveIndicator({
        hovered: null,
        from: { x: 0, y: 0, z: 0 },
        pathIndex: corridorIndex(),
        locked: false,
      })
    ).toBeNull();
  });

  it('a reachable hovered cell selects the path atlasPath would compute', () => {
    const index = corridorIndex();
    const from = { x: 0, y: 0, z: 0 };
    const hovered = { x: 2, y: -1, z: -1 };
    const selection = selectMoveIndicator({
      hovered,
      from,
      pathIndex: index,
      locked: false,
    });
    expect(selection).toEqual({
      kind: 'path',
      path: findAtlasPath(index, from, hovered),
      // No budget supplied — every cell reads affordable.
      affordable: 3,
    });
  });

  it('the selected path is identical to the RPC path useSessionWalk.walkTo would send (one selector, not two)', () => {
    const index = corridorIndex();
    const from = { x: 0, y: 0, z: 0 };
    const hovered = { x: 2, y: -1, z: -1 };
    const selection = selectMoveIndicator({
      hovered,
      from,
      pathIndex: index,
      locked: false,
    });
    if (selection?.kind !== 'path') {
      throw new Error('expected a path selection');
    }
    // Same slice(1)+cubeToPosition shaping useSessionWalk.walkTo applies
    // before calling sessionClient.move — matches
    // useSessionWalk.test.ts's "walkTo a reachable cell sends the request
    // path" case exactly: (0,0) is the start cell (excluded), then (1,0)
    // and the destination (2,-1) remain.
    const requestPath = selection.path.slice(1).map(cubeToPosition);
    expect(requestPath).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: -1 },
    ]);
  });

  it('the current cell (self-hover) is invalid — nothing to walk, same as a click no-op', () => {
    const index = corridorIndex();
    const selection = selectMoveIndicator({
      hovered: { x: 0, y: 0, z: 0 },
      from: { x: 0, y: 0, z: 0 },
      pathIndex: index,
      locked: false,
    });
    expect(selection).toEqual({ kind: 'invalid' });
  });

  it('a floor cell with no route in (isolated pocket) is invalid', () => {
    const index = unreachablePocketIndex();
    const selection = selectMoveIndicator({
      hovered: { x: 5, y: -5, z: 0 },
      from: { x: 0, y: 0, z: 0 },
      pathIndex: index,
      locked: false,
    });
    expect(selection).toEqual({ kind: 'invalid' });
  });

  it('a cell beyond a movement-blocking boundary (wall, no doorway) is invalid', () => {
    const index = walledCorridorIndex();
    const selection = selectMoveIndicator({
      hovered: { x: 2, y: -1, z: -1 },
      from: { x: 0, y: 0, z: 0 },
      pathIndex: index,
      locked: false,
    });
    expect(selection).toEqual({ kind: 'invalid' });
  });

  it('a cell off the atlas entirely (not declared floor) is invalid', () => {
    const index = corridorIndex();
    const selection = selectMoveIndicator({
      hovered: { x: 99, y: -99, z: 0 },
      from: { x: 0, y: 0, z: 0 },
      pathIndex: index,
      locked: false,
    });
    expect(selection).toEqual({ kind: 'invalid' });
  });

  it('locked overrides an otherwise-reachable cell — locked, not path', () => {
    const index = corridorIndex();
    const selection = selectMoveIndicator({
      hovered: { x: 1, y: -1, z: 0 },
      from: { x: 0, y: 0, z: 0 },
      pathIndex: index,
      locked: true,
    });
    expect(selection).toEqual({ kind: 'locked' });
  });

  it('locked overrides an otherwise-invalid cell too — still locked, not invalid', () => {
    const index = corridorIndex();
    const selection = selectMoveIndicator({
      hovered: { x: 99, y: -99, z: 0 },
      from: { x: 0, y: 0, z: 0 },
      pathIndex: index,
      locked: true,
    });
    expect(selection).toEqual({ kind: 'locked' });
  });

  it('no known player position or atlas index yet draws nothing (null), not a false "invalid" and not a crash', () => {
    // Distinguishes "I looked and there is no route" (a real 'invalid')
    // from "there is nothing to look up yet" — SessionCanvas.tsx's
    // pathIndex doc comment has always said null means "nothing is
    // drawn," so this pins the selector's behavior to match it.
    expect(
      selectMoveIndicator({
        hovered: { x: 0, y: 0, z: 0 },
        from: null,
        pathIndex: corridorIndex(),
        locked: false,
      })
    ).toBeNull();
    expect(
      selectMoveIndicator({
        hovered: { x: 0, y: 0, z: 0 },
        from: { x: 0, y: 0, z: 0 },
        pathIndex: null,
        locked: false,
      })
    ).toBeNull();
  });

  it('an attackable hovered entity reads as a target regardless of path/lock state (rpg-project#249: Attack is a hover state, not a mode)', () => {
    const index = corridorIndex();
    expect(
      selectMoveIndicator({
        hovered: { x: 1, y: -1, z: 0 },
        from: { x: 0, y: 0, z: 0 },
        pathIndex: index,
        locked: true, // even locked, an attackable hover isn't 'locked'
        hoveredEntityId: 'skeleton-1',
        attackable: true,
      })
    ).toEqual({ kind: 'target', entityId: 'skeleton-1' });
  });

  it('a hovered entity that is NOT attackable falls through to the ordinary walk-preview logic (out of reach, or not your turn)', () => {
    const index = corridorIndex();
    expect(
      selectMoveIndicator({
        hovered: { x: 1, y: -1, z: 0 },
        from: { x: 0, y: 0, z: 0 },
        pathIndex: index,
        locked: false,
        hoveredEntityId: 'skeleton-1',
        attackable: false,
      })
    ).toMatchObject({ kind: 'path' });
  });

  it('a hovered entity with no hoveredEntityId at all is simply not a target hover', () => {
    expect(
      selectMoveIndicator({
        hovered: { x: 1, y: -1, z: 0 },
        from: { x: 0, y: 0, z: 0 },
        pathIndex: corridorIndex(),
        locked: false,
        attackable: true, // meaningless without an id — ignored
      })
    ).toMatchObject({ kind: 'path' });
  });
});

describe('the movement budget marks the path', () => {
  const from = { x: 0, y: 0, z: 0 };
  // The 1x3 corridor's far end: a 3-cell path (start included), so two
  // cells are ENTERED and the server prices the walk at 10 feet.
  const hovered = { x: 2, y: -1, z: -1 };

  function selectionWithBudget(budgetFeet: number | undefined) {
    return selectMoveIndicator({
      hovered,
      from,
      pathIndex: corridorIndex(),
      locked: false,
      budgetFeet,
    });
  }

  it('carries the WHOLE path regardless of budget, so a click still sends what the preview drew', () => {
    const index = corridorIndex();
    const full = findAtlasPath(index, from, hovered);

    for (const budget of [undefined, 0, 5, 10, 999]) {
      const selection = selectionWithBudget(budget);
      expect(selection).toMatchObject({ kind: 'path', path: full });
    }
  });

  it('affords exactly the cells the budget pays for', () => {
    // 10 ft buys both steps: the full 3-cell path.
    expect(selectionWithBudget(10)).toMatchObject({ affordable: 3 });
    // 5 ft buys one step: start + one entered cell.
    expect(selectionWithBudget(5)).toMatchObject({ affordable: 2 });
    // A budget that does not divide evenly cannot buy a partial cell.
    expect(selectionWithBudget(9)).toMatchObject({ affordable: 2 });
  });

  it('treats 0 feet as a real answer, not as "no budget"', () => {
    // Standing still is free, so the walker's own cell is still affordable —
    // but nothing beyond it is. This is the case that would break if a
    // caller folded a present 0 into undefined.
    expect(selectionWithBudget(0)).toMatchObject({ affordable: 1 });
    expect(selectionWithBudget(undefined)).toMatchObject({ affordable: 3 });
  });

  it('never affords more cells than the path has', () => {
    expect(selectionWithBudget(999)).toMatchObject({ affordable: 3 });
  });
});

describe('affordableCellCount', () => {
  it('is the identity on path length when no budget applies', () => {
    expect(affordableCellCount(4, undefined)).toBe(4);
    expect(affordableCellCount(0, undefined)).toBe(0);
  });

  it('counts the free start cell plus one cell per five feet', () => {
    expect(affordableCellCount(9, 0)).toBe(1);
    expect(affordableCellCount(9, 5)).toBe(2);
    expect(affordableCellCount(9, 30)).toBe(7);
  });

  it('clamps to the path and refuses to read a negative budget as credit', () => {
    expect(affordableCellCount(3, 100)).toBe(3);
    expect(affordableCellCount(3, -5)).toBe(1);
  });

  it('has nothing to afford in an empty path', () => {
    expect(affordableCellCount(0, 30)).toBe(0);
  });
});
