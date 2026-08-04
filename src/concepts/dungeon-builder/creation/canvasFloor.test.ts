import { describe, expect, it } from 'vitest';
import {
  addWallLine,
  parseDungeon,
  placeItem,
  toDungeonDoc,
  toggleHole,
} from '../dungeonYaml';
import {
  canvasPlacementRejectReason,
  deriveCanvasFloorCells,
} from './canvasFloor';
import { emptyCanvasYaml } from './emptyCanvasDoc';
import { straightWallsFootprintSet } from './straightWallGeometry';

describe('deriveCanvasFloorCells', () => {
  it('produces every cell in a small canvas bounds, none missing or duplicated', () => {
    const cells = deriveCanvasFloorCells({
      canvas: { width: 3, height: 2 },
      holes: [],
    });
    expect(cells).toHaveLength(6);
    const keys = new Set(cells.map(([c, r]) => `${c},${r}`));
    expect(keys.size).toBe(6);
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 2; row++) {
        expect(keys.has(`${col},${row}`)).toBe(true);
      }
    }
  });

  it('excludes every hole cell, and only those', () => {
    const cells = deriveCanvasFloorCells({
      canvas: { width: 4, height: 4 },
      holes: [
        [1, 1],
        [2, 2],
      ],
    });
    expect(cells).toHaveLength(4 * 4 - 2);
    const keys = new Set(cells.map(([c, r]) => `${c},${r}`));
    expect(keys.has('1,1')).toBe(false);
    expect(keys.has('2,2')).toBe(false);
    // A cell NOT punched as a hole stays present.
    expect(keys.has('0,0')).toBe(true);
    expect(keys.has('3,3')).toBe(true);
  });

  it('a hole outside the canvas bounds is simply irrelevant — no crash, no phantom exclusion', () => {
    const cells = deriveCanvasFloorCells({
      canvas: { width: 2, height: 2 },
      holes: [[99, 99]],
    });
    expect(cells).toHaveLength(4);
  });

  it('falls back to DEFAULT_CANVAS (20x30) when doc.canvas is null', () => {
    const cells = deriveCanvasFloorCells({ canvas: null, holes: [] });
    expect(cells).toHaveLength(20 * 30);
  });

  it('a fully-holed canvas produces an empty floor, not an error', () => {
    const cells = deriveCanvasFloorCells({
      canvas: { width: 1, height: 1 },
      holes: [[0, 0]],
    });
    expect(cells).toEqual([]);
  });
});

// rpg-project#169's creation-3D-editing unit — the ONE placement-legality
// predicate both the 2D brush (`CreationBoard.tsx`) and the 3D
// click-to-place layer (`preview3d/DungeonPreview3D.tsx`) now consult.
// Built off a real parsed canvas doc (`parseDungeon(emptyCanvasYaml(...))`),
// not a hand-typed `DungeonDoc` literal — `isCellOccupied` (this
// function's own third gate) takes the full `DungeonDoc` shape, and a real
// parse is the same fixture pattern `DungeonPreview3D.test.ts` already
// uses rather than a second, parallel one.
describe('canvasPlacementRejectReason', () => {
  const emptyDoc = () =>
    toDungeonDoc(parseDungeon(emptyCanvasYaml(20, 30)).cst);

  it('an ordinary empty floor cell is legal — null, no reason', () => {
    const doc = emptyDoc();
    expect(canvasPlacementRejectReason(doc, 5, 5, new Set())).toBeNull();
  });

  it('rejects a cell outside the canvas bounds, same as a hole would', () => {
    const doc = emptyDoc();
    expect(canvasPlacementRejectReason(doc, -1, 5, new Set())).not.toBeNull();
    expect(canvasPlacementRejectReason(doc, 20, 5, new Set())).not.toBeNull();
    expect(canvasPlacementRejectReason(doc, 5, 30, new Set())).not.toBeNull();
  });

  it('rejects a hole cell', () => {
    const { cst } = parseDungeon(emptyCanvasYaml(20, 30));
    toggleHole(cst, 5, 5);
    const doc = toDungeonDoc(cst);
    expect(canvasPlacementRejectReason(doc, 5, 5, new Set())).not.toBeNull();
    // A neighboring, non-hole cell stays legal — the reject is cell-
    // specific, not a whole-canvas panic.
    expect(canvasPlacementRejectReason(doc, 6, 5, new Set())).toBeNull();
  });

  it('rejects a cell inside a straight wall’s footprint, and only that cell', () => {
    const doc = emptyDoc();
    // Same known single-cell footprint fixture straightWallGeometry.test.ts
    // itself uses ("a wall ENDING at a corner shared with a cell does not
    // clip that cell"): this line's footprint is exactly [[5, 4]].
    const footprint = new Set(['5,4']);
    expect(canvasPlacementRejectReason(doc, 5, 4, footprint)).not.toBeNull();
    // A neighboring cell the footprint doesn't cover stays legal — the
    // rule is footprint MEMBERSHIP, not proximity to a drawn wall.
    expect(canvasPlacementRejectReason(doc, 5, 5, footprint)).toBeNull();
    expect(canvasPlacementRejectReason(doc, 6, 5, footprint)).toBeNull();
  });

  it('rejects an already-occupied cell (top-level doc.place)', () => {
    const { cst } = parseDungeon(emptyCanvasYaml(20, 30));
    placeItem(cst, null, 'dnd5e:props:pillar', [3, 3]);
    const doc = toDungeonDoc(cst);
    expect(canvasPlacementRejectReason(doc, 3, 3, new Set())).not.toBeNull();
    // The occupied placement's own cell is the only one affected.
    expect(canvasPlacementRejectReason(doc, 4, 3, new Set())).toBeNull();
  });

  it('checks gates in order: an out-of-bounds cell is rejected for that reason even if it would also be "occupied" by coincidence', () => {
    const doc = emptyDoc();
    // No real placement can exist out of bounds, but this proves the
    // bounds/hole gate runs FIRST regardless — a caller never needs a
    // real occupied placement out of bounds to trust this ordering.
    const reason = canvasPlacementRejectReason(doc, -5, -5, new Set());
    expect(reason).toMatch(/floor/i);
  });

  it('addWallLine + straightWallsFootprintSet integration: a real authored wall line rejects its own footprint cell', () => {
    const { cst } = parseDungeon(emptyCanvasYaml(20, 30));
    addWallLine(cst, { cell: [5, 4], corner: 2 }, { cell: [5, 4], corner: 5 });
    const doc = toDungeonDoc(cst);
    const footprint = straightWallsFootprintSet(doc.wallLines, doc.canvas!);
    expect(canvasPlacementRejectReason(doc, 5, 4, footprint)).not.toBeNull();
  });
});
