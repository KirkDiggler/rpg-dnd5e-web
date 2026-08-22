import { describe, expect, it } from 'vitest';
import { buildAtlasPathIndex, findAtlasPath } from './atlasPath';
import { selectMoveIndicator } from './moveIndicator';
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
  it('returns null when nothing is hovered, regardless of mode', () => {
    expect(
      selectMoveIndicator({
        mode: 'move',
        hovered: null,
        from: { x: 0, y: 0, z: 0 },
        pathIndex: corridorIndex(),
        fightLocked: false,
      })
    ).toBeNull();
    expect(
      selectMoveIndicator({
        mode: 'target',
        hovered: null,
        from: { x: 0, y: 0, z: 0 },
        pathIndex: corridorIndex(),
        fightLocked: false,
      })
    ).toBeNull();
  });

  it('a reachable hovered cell selects the path atlasPath would compute', () => {
    const index = corridorIndex();
    const from = { x: 0, y: 0, z: 0 };
    const hovered = { x: 2, y: -1, z: -1 };
    const selection = selectMoveIndicator({
      mode: 'move',
      hovered,
      from,
      pathIndex: index,
      fightLocked: false,
    });
    expect(selection).toEqual({
      kind: 'path',
      path: findAtlasPath(index, from, hovered),
    });
  });

  it('the selected path is identical to the RPC path useSessionWalk.walkTo would send (one selector, not two)', () => {
    const index = corridorIndex();
    const from = { x: 0, y: 0, z: 0 };
    const hovered = { x: 2, y: -1, z: -1 };
    const selection = selectMoveIndicator({
      mode: 'move',
      hovered,
      from,
      pathIndex: index,
      fightLocked: false,
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
      mode: 'move',
      hovered: { x: 0, y: 0, z: 0 },
      from: { x: 0, y: 0, z: 0 },
      pathIndex: index,
      fightLocked: false,
    });
    expect(selection).toEqual({ kind: 'invalid' });
  });

  it('a floor cell with no route in (isolated pocket) is invalid', () => {
    const index = unreachablePocketIndex();
    const selection = selectMoveIndicator({
      mode: 'move',
      hovered: { x: 5, y: -5, z: 0 },
      from: { x: 0, y: 0, z: 0 },
      pathIndex: index,
      fightLocked: false,
    });
    expect(selection).toEqual({ kind: 'invalid' });
  });

  it('a cell beyond a movement-blocking boundary (wall, no doorway) is invalid', () => {
    const index = walledCorridorIndex();
    const selection = selectMoveIndicator({
      mode: 'move',
      hovered: { x: 2, y: -1, z: -1 },
      from: { x: 0, y: 0, z: 0 },
      pathIndex: index,
      fightLocked: false,
    });
    expect(selection).toEqual({ kind: 'invalid' });
  });

  it('a cell off the atlas entirely (not declared floor) is invalid', () => {
    const index = corridorIndex();
    const selection = selectMoveIndicator({
      mode: 'move',
      hovered: { x: 99, y: -99, z: 0 },
      from: { x: 0, y: 0, z: 0 },
      pathIndex: index,
      fightLocked: false,
    });
    expect(selection).toEqual({ kind: 'invalid' });
  });

  it('fight-locked overrides an otherwise-reachable cell — locked, not path', () => {
    const index = corridorIndex();
    const selection = selectMoveIndicator({
      mode: 'move',
      hovered: { x: 1, y: -1, z: 0 },
      from: { x: 0, y: 0, z: 0 },
      pathIndex: index,
      fightLocked: true,
    });
    expect(selection).toEqual({ kind: 'locked' });
  });

  it('fight-locked overrides an otherwise-invalid cell too — still locked, not invalid', () => {
    const index = corridorIndex();
    const selection = selectMoveIndicator({
      mode: 'move',
      hovered: { x: 99, y: -99, z: 0 },
      from: { x: 0, y: 0, z: 0 },
      pathIndex: index,
      fightLocked: true,
    });
    expect(selection).toEqual({ kind: 'locked' });
  });

  it('no known player position or atlas index yet draws nothing (null), not a false "invalid" and not a crash', () => {
    // Distinguishes "I looked and there is no route" (a real 'invalid')
    // from "there is nothing to look up yet" (rpg-dnd5e-web#768, Copilot
    // review on PR #768) — SessionCanvas.tsx's pathIndex doc comment has
    // always said null means "nothing is drawn," so this pins the
    // selector's behavior to match it.
    expect(
      selectMoveIndicator({
        mode: 'move',
        hovered: { x: 0, y: 0, z: 0 },
        from: null,
        pathIndex: corridorIndex(),
        fightLocked: false,
      })
    ).toBeNull();
    expect(
      selectMoveIndicator({
        mode: 'move',
        hovered: { x: 0, y: 0, z: 0 },
        from: { x: 0, y: 0, z: 0 },
        pathIndex: null,
        fightLocked: false,
      })
    ).toBeNull();
  });

  it('target mode is a trivial seam: threads the hovered entity id through, ignoring path/lock state entirely', () => {
    const index = corridorIndex();
    expect(
      selectMoveIndicator({
        mode: 'target',
        hovered: { x: 1, y: -1, z: 0 },
        from: { x: 0, y: 0, z: 0 },
        pathIndex: index,
        fightLocked: true, // even fight-locked, target mode isn't 'locked'
        hoveredEntityId: 'skeleton-1',
      })
    ).toEqual({ kind: 'target', entityId: 'skeleton-1' });
  });

  it('target mode with nothing under the cursor reports a null entityId', () => {
    expect(
      selectMoveIndicator({
        mode: 'target',
        hovered: { x: 1, y: -1, z: 0 },
        from: { x: 0, y: 0, z: 0 },
        pathIndex: corridorIndex(),
        fightLocked: false,
      })
    ).toEqual({ kind: 'target', entityId: null });
  });

  describe("maxCells — the server's movement bound (toolkit#1169)", () => {
    // corridorIndex: (0,0) -- (1,0) -- (2,-1). From (0,0), hovering (1,0)
    // is a 1-cell path; hovering (2,-1) is a 2-cell path.
    it('a path within the bound still reads as a normal preview', () => {
      expect(
        selectMoveIndicator({
          mode: 'move',
          hovered: { x: 1, y: -1, z: 0 },
          from: { x: 0, y: 0, z: 0 },
          pathIndex: corridorIndex(),
          fightLocked: false,
          maxCells: 1,
        })
      ).toEqual({
        kind: 'path',
        path: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: -1, z: 0 },
        ],
      });
    });

    it('a path exactly AT the bound is still valid — not exceeded, not exclusive', () => {
      expect(
        selectMoveIndicator({
          mode: 'move',
          hovered: { x: 2, y: -1, z: -1 },
          from: { x: 0, y: 0, z: 0 },
          pathIndex: corridorIndex(),
          fightLocked: false,
          maxCells: 2,
        })
      ).toMatchObject({ kind: 'path' });
    });

    it("a path longer than the bound reads 'invalid' — the same reading as unreachable, never a client rule beyond the round-down", () => {
      expect(
        selectMoveIndicator({
          mode: 'move',
          hovered: { x: 2, y: -1, z: -1 },
          from: { x: 0, y: 0, z: 0 },
          pathIndex: corridorIndex(),
          fightLocked: false,
          maxCells: 1,
        })
      ).toEqual({ kind: 'invalid' });
    });

    it("maxCells: 0 invalidates every hover but the player's own cell", () => {
      expect(
        selectMoveIndicator({
          mode: 'move',
          hovered: { x: 1, y: -1, z: 0 },
          from: { x: 0, y: 0, z: 0 },
          pathIndex: corridorIndex(),
          fightLocked: false,
          maxCells: 0,
        })
      ).toEqual({ kind: 'invalid' });
    });

    it("undefined maxCells is unbounded — free roam's own baseline behavior, unchanged", () => {
      expect(
        selectMoveIndicator({
          mode: 'move',
          hovered: { x: 2, y: -1, z: -1 },
          from: { x: 0, y: 0, z: 0 },
          pathIndex: corridorIndex(),
          fightLocked: false,
        })
      ).toMatchObject({ kind: 'path' });
    });

    it('fightLocked still overrides maxCells entirely — checked first, same precedence as always', () => {
      expect(
        selectMoveIndicator({
          mode: 'move',
          hovered: { x: 1, y: -1, z: 0 },
          from: { x: 0, y: 0, z: 0 },
          pathIndex: corridorIndex(),
          fightLocked: true,
          maxCells: 5,
        })
      ).toEqual({ kind: 'locked' });
    });

    it("'target' mode ignores maxCells entirely", () => {
      expect(
        selectMoveIndicator({
          mode: 'target',
          hovered: { x: 2, y: -1, z: -1 },
          from: { x: 0, y: 0, z: 0 },
          pathIndex: corridorIndex(),
          fightLocked: false,
          maxCells: 0,
          hoveredEntityId: 'skeleton-1',
        })
      ).toEqual({ kind: 'target', entityId: 'skeleton-1' });
    });
  });
});
