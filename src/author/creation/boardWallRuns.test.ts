/**
 * boardWallRuns — the board's straightened wall picture (#800) is the
 * SAME geometry 3D renders, projected. The projection is pinned by a
 * PIXEL formula (exact numbers for known inputs), never a round-trip:
 * a conversion swapped identically both ways passes every consistency
 * test (rpg-toolkit#1150, rpg-dnd5e-web#1141 — twice real), and only
 * asserting the actual picture catches it. The reference-tomb golden
 * pins the input mapping + projection against `buildScene3D`'s own
 * output for the same document — same run module on both sides, so any
 * disagreement is a mapping or projection defect by construction.
 */
import { DOOR_FRAME_CALIBRATED_WIDTH } from '@/components/hex-grid/syntyHexWallHelpers';
import { buildScene3D } from '@/components/session/atlasToScene3D';
import { describe, expect, it } from 'vitest';
import { hexCenter } from '../../concepts/session-tomb/atlas';
import {
  emptyDungeon,
  paintCell,
  setWallHeights,
  toggleWall,
  wallEdges,
} from '../dungeonYaml';
import { fixtureAtlasOf } from '../fixtures/fixtureAtlas';
import { referenceTombDoc } from '../fixtures/referenceTomb';
import { edgeKey, fromOffset, type Axial } from '../hexOffset';
import { BOARD_HEX_SIZE } from './CreationBoard';
import {
  boardWallScene,
  cubeToWorld,
  HEX_SIZE,
  worldToBoard,
} from './boardWallRuns';

const asPosition = (a: Axial) => ({ x: a.q, y: a.r }) as never;

describe('worldToBoard (the ONE world → SVG projection)', () => {
  it('is the pixel formula: scale by boardSize/worldSize, world z becomes SVG y', () => {
    // Exact numbers, not a round-trip. scale = 24 / 1.
    expect(worldToBoard({ x: 1, z: 2 }, 1, 24)).toEqual({ x: 24, y: 48 });
    expect(worldToBoard({ x: -0.5, z: 0 }, 1, 24)).toEqual({ x: -12, y: 0 });
    // A real hex center: cube (2, 3) at world size 1 sits at
    // (√3·(2+1.5), 1.5·3) = (6.06217782649107, 4.5); at board size 24
    // that must land at exactly 24× those numbers.
    const p = worldToBoard({ x: 6.06217782649107, z: 4.5 }, 1, 24);
    expect(p.x).toBeCloseTo(145.4922678357857, 10);
    expect(p.y).toBe(108);
    // The scale is a ratio, not a bake-in of 24: doubling the world
    // unit halves the SVG magnitude for the same world point.
    expect(worldToBoard({ x: 6, z: 3 }, 2, 24)).toEqual({ x: 72, y: 36 });
  });

  it('sends 3D cell centers exactly onto the board’s own hex centers (the pure-scale proof)', () => {
    // The board places cells via hexCenter (SVG, y-down, BOARD_HEX_SIZE);
    // 3D places them via cubeToWorld (world, HEX_SIZE). The projection
    // claims those are the same formulas at different sizes — prove it
    // on cells in all four quadrants rather than assume it.
    const cells: Axial[] = [
      { q: 0, r: 0 },
      { q: 2, r: 3 },
      { q: -4, r: 5 },
      { q: 7, r: -2 },
      { q: -3, r: -3 },
    ];
    for (const cell of cells) {
      const world = cubeToWorld(
        { x: cell.q, y: -cell.q - cell.r, z: cell.r },
        HEX_SIZE
      );
      const projected = worldToBoard(world, HEX_SIZE, BOARD_HEX_SIZE);
      const board = hexCenter(asPosition(cell), BOARD_HEX_SIZE, 'pointy');
      expect(projected.x).toBeCloseTo(board.x, 10);
      expect(projected.y).toBeCloseTo(board.y, 10);
    }
  });
});

describe('boardWallScene', () => {
  it('returns null for a flat-top document — the board keeps literal edges, mirroring 3D’s pointy-only gate (#763)', () => {
    let doc = emptyDungeon('flat');
    doc = paintCell(doc, 'region-1', fromOffset('flat', [1, 1]));
    doc = paintCell(doc, 'region-1', fromOffset('flat', [2, 1]));
    doc = toggleWall(doc, [
      fromOffset('flat', [1, 1]),
      fromOffset('flat', [2, 1]),
    ]);
    expect(boardWallScene(doc, BOARD_HEX_SIZE)).toBeNull();
  });

  it('reference tomb golden: 2D run endpoints are exactly the projection of the 3D preview’s runs', () => {
    const doc = referenceTombDoc();
    const scene2d = boardWallScene(doc, BOARD_HEX_SIZE);
    expect(scene2d).not.toBeNull();
    // The 3D preview path for the same document (fixtureAtlasOf is what
    // the sandbox preview compiles with; the same module the game uses).
    const scene3d = buildScene3D(fixtureAtlasOf(doc), HEX_SIZE, 'pointy');
    expect(scene2d!.runs.length).toBeGreaterThan(0);
    expect(scene2d!.runs.length).toBe(scene3d.wallRuns.length);
    const byKey = new Map(scene3d.wallRuns.map((r) => [r.key, r] as const));
    for (const run of scene2d!.runs) {
      const three = byKey.get(run.key);
      expect(three, `2D run ${run.key} exists in 3D`).toBeDefined();
      // Exact equality, not closeTo: same module, same input mapping,
      // same floats — anything less means the 2D input mapping diverged
      // from what 3D consumes.
      expect(run.a).toEqual(
        worldToBoard(three!.start, HEX_SIZE, BOARD_HEX_SIZE)
      );
      expect(run.b).toEqual(worldToBoard(three!.end, HEX_SIZE, BOARD_HEX_SIZE));
    }
  });

  it('the tomb’s axis-true runs stay axis-true in SVG space', () => {
    // The tomb's walls are its two authored column seams; #799 renders
    // them exactly vertical in world space (|dirX| < 1e-6). A projection
    // that rotated, sheared, or mixed axes would break that here.
    const scene2d = boardWallScene(referenceTombDoc(), BOARD_HEX_SIZE)!;
    for (const run of scene2d.runs) {
      expect(Math.abs(run.a.x - run.b.x)).toBeLessThan(1e-6 * BOARD_HEX_SIZE);
    }
  });

  it('threads each run’s source doc edges through (#804) — the union is exactly walls[]', () => {
    const doc = referenceTombDoc();
    const scene2d = boardWallScene(doc, BOARD_HEX_SIZE)!;
    const threaded = scene2d.runs.flatMap((r) => r.edges).map(edgeKey);
    // Every doc wall appears in exactly one run's source list, and no
    // run carries an edge the doc doesn't have.
    expect(threaded.sort()).toEqual(wallEdges(doc).map(edgeKey).sort());
    for (const run of scene2d.runs) {
      expect(run.edges.length).toBeGreaterThan(0);
    }
  });

  it("an authored height reaches its 2D run — and splits the run where the document's heights change (rpg-project#273)", () => {
    // Raise part of the tomb's first seam: the shared engine must break
    // the chain at the height boundary and each side must carry its own
    // multiplier out to the board.
    const doc = referenceTombDoc();
    const raisedEdges = wallEdges(doc).slice(0, 3);
    const raisedKeys = new Set(raisedEdges.map(edgeKey));
    const raisedDoc = setWallHeights(doc, raisedEdges, 2);
    const scene2d = boardWallScene(raisedDoc, BOARD_HEX_SIZE)!;
    for (const run of scene2d.runs) {
      const inRaised = run.edges.map((e) => raisedKeys.has(edgeKey(e)));
      // No run mixes raised and standard edges — the chain split there.
      expect(new Set(inRaised).size).toBe(1);
      expect(run.height).toBe(inRaised[0] ? 2 : 0);
    }
    expect(scene2d.runs.some((r) => r.height === 2)).toBe(true);
    expect(scene2d.runs.some((r) => r.height === 0)).toBe(true);
  });

  it('doors sit exactly in the run gaps, one per door edge, keyed to their document door', () => {
    const doc = referenceTombDoc();
    const scene2d = boardWallScene(doc, BOARD_HEX_SIZE)!;
    const scene3d = buildScene3D(fixtureAtlasOf(doc), HEX_SIZE, 'pointy');
    expect(scene2d.doors.map((d) => d.doorId)).toEqual([
      'entrance-hall',
      'hall-tomb',
    ]);
    scene2d.doors.forEach((door, i) => {
      const gap = scene3d.doorGaps[i];
      // One end IS the gap's leaf end; the midpoint IS the gap's center
      // — the door is drawn in the gap, not on the raw hex edge.
      expect(door.a).toEqual(
        worldToBoard(gap.leafPosition, HEX_SIZE, BOARD_HEX_SIZE)
      );
      const center = worldToBoard(gap.position, HEX_SIZE, BOARD_HEX_SIZE);
      expect((door.a.x + door.b.x) / 2).toBeCloseTo(center.x, 9);
      expect((door.a.y + door.b.y) / 2).toBeCloseTo(center.y, 9);
      // And it spans the full calibrated gap the flanking runs stop at.
      const len = Math.hypot(door.b.x - door.a.x, door.b.y - door.a.y);
      expect(len).toBeCloseTo(
        DOOR_FRAME_CALIBRATED_WIDTH * (BOARD_HEX_SIZE / HEX_SIZE),
        9
      );
    });
  });
});
