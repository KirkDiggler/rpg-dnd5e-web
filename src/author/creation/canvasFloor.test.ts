import { create } from '@bufbuild/protobuf';
import {
  FloorPlanSchema,
  type FloorPlan,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
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
  resolveCanvasFloor,
  sortCellsLexicographic,
} from './canvasFloor';
import { emptyCanvasYaml } from './emptyCanvasDoc';
import {
  STANDABLE_COVERAGE_THRESHOLD,
  standableFootprintKeys,
  straightWallsFootprintCoverage,
  straightWallsFootprintSet,
} from './straightWallGeometry';

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

describe('sortCellsLexicographic', () => {
  it('sorts ascending by column, then row', () => {
    const sorted = sortCellsLexicographic([
      [2, 0],
      [0, 1],
      [0, 0],
      [1, 5],
    ]);
    expect(sorted).toEqual([
      [0, 0],
      [0, 1],
      [1, 5],
      [2, 0],
    ]);
  });

  it('does not mutate its input', () => {
    const input: [number, number][] = [
      [1, 1],
      [0, 0],
    ];
    sortCellsLexicographic(input);
    expect(input).toEqual([
      [1, 1],
      [0, 0],
    ]);
  });
});

// v0.3 wire consumption unit (2026-08-05) — resolveCanvasFloor prefers a
// live FloorPlan.floor_cells (rpg-api-protos v0.1.120) over the
// client-derived fallback. No live server carries this field yet (the
// rpg-api-protos#214 conformance review's finding A4 — canvas mode is
// spec.md §1 group (c), not started server-side): every FloorPlan fixture
// below is hand-constructed to exercise the shape the wire will carry
// once Wave 0 ships, not a real recorded response. Marked SYNTHETIC per
// this concept's existing fixtures.ts convention.
describe('resolveCanvasFloor — v0.3 wire consumption (SYNTHETIC fixtures, no live server carries these fields yet)', () => {
  const doc = {
    canvas: { width: 3, height: 2 },
    holes: [] as [number, number][],
  };

  function floorPlanWithCells(cells: [number, number][]): FloorPlan {
    return create(FloorPlanSchema, {
      rooms: [],
      connectors: [],
      height: 0,
      doorRow: 0,
      floorCells: cells.map(([column, row]) => ({ column, row })),
      regions: [],
    });
  }

  it('null floorPlan falls back to derived, labeled "derived"', () => {
    const result = resolveCanvasFloor(doc, null);
    expect(result.source).toBe('derived');
    expect(result.cells).toEqual(
      sortCellsLexicographic(deriveCanvasFloorCells(doc))
    );
  });

  it('a live response with EMPTY floor_cells falls back to derived — rollout gap (A4), not "declares none"', () => {
    const result = resolveCanvasFloor(doc, floorPlanWithCells([]));
    expect(result.source).toBe('derived');
    expect(result.cells).toEqual(
      sortCellsLexicographic(deriveCanvasFloorCells(doc))
    );
  });

  it('a live response with non-empty floor_cells renders from the wire, sort-normalized', () => {
    // Deliberately authoring-order (not sorted) on the wire fixture, to
    // prove resolveCanvasFloor normalizes rather than trusting response
    // order verbatim.
    const wireCells: [number, number][] = [
      [2, 1],
      [0, 0],
      [1, 0],
    ];
    const result = resolveCanvasFloor(doc, floorPlanWithCells(wireCells));
    expect(result.source).toBe('server');
    expect(result.cells).toEqual(sortCellsLexicographic(wireCells));
  });

  it('server cells win even when they disagree with the derived set (e.g. a hole the server does not know about)', () => {
    const docWithHole = {
      canvas: { width: 3, height: 2 },
      holes: [[1, 0]] as [number, number][],
    };
    // v0.3's canvas structural floor has no hole concept server-side
    // (`holes:` is explicitly ABOVE v0.3, spec.md §2) — a real future
    // server response would legitimately include [1,0] even though the
    // client's own doc punches a hole there. Wire wins.
    const wireCells: [number, number][] = [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ];
    const result = resolveCanvasFloor(
      docWithHole,
      floorPlanWithCells(wireCells)
    );
    expect(result.source).toBe('server');
    expect(result.cells.some(([c, r]) => c === 1 && r === 0)).toBe(true);
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
    expect(canvasPlacementRejectReason(doc, 5, 5, new Set(), true)).toBeNull();
  });

  it('rejects a cell outside the canvas bounds, same as a hole would', () => {
    const doc = emptyDoc();
    expect(
      canvasPlacementRejectReason(doc, -1, 5, new Set(), true)
    ).not.toBeNull();
    expect(
      canvasPlacementRejectReason(doc, 20, 5, new Set(), true)
    ).not.toBeNull();
    expect(
      canvasPlacementRejectReason(doc, 5, 30, new Set(), true)
    ).not.toBeNull();
  });

  it('rejects a hole cell', () => {
    const { cst } = parseDungeon(emptyCanvasYaml(20, 30));
    toggleHole(cst, 5, 5);
    const doc = toDungeonDoc(cst);
    expect(
      canvasPlacementRejectReason(doc, 5, 5, new Set(), true)
    ).not.toBeNull();
    // A neighboring, non-hole cell stays legal — the reject is cell-
    // specific, not a whole-canvas panic.
    expect(canvasPlacementRejectReason(doc, 6, 5, new Set(), true)).toBeNull();
  });

  it('rejects a cell inside a straight wall’s footprint, and only that cell, when requiresStandable', () => {
    const doc = emptyDoc();
    // Same known single-cell footprint fixture straightWallGeometry.test.ts
    // itself uses ("a wall ENDING at a corner shared with a cell does not
    // clip that cell"): this line's footprint is exactly [[5, 4]].
    const footprint = new Set(['5,4']);
    expect(
      canvasPlacementRejectReason(doc, 5, 4, footprint, true)
    ).not.toBeNull();
    // A neighboring cell the footprint doesn't cover stays legal — the
    // rule is footprint MEMBERSHIP, not proximity to a drawn wall.
    expect(canvasPlacementRejectReason(doc, 5, 5, footprint, true)).toBeNull();
    expect(canvasPlacementRejectReason(doc, 6, 5, footprint, true)).toBeNull();
  });

  it('rejects an already-occupied cell (top-level doc.place)', () => {
    const { cst } = parseDungeon(emptyCanvasYaml(20, 30));
    placeItem(cst, null, 'dnd5e:props:pillar', [3, 3]);
    const doc = toDungeonDoc(cst);
    expect(
      canvasPlacementRejectReason(doc, 3, 3, new Set(), true)
    ).not.toBeNull();
    // The occupied placement's own cell is the only one affected.
    expect(canvasPlacementRejectReason(doc, 4, 3, new Set(), true)).toBeNull();
  });

  it('checks gates in order: an out-of-bounds cell is rejected for that reason even if it would also be "occupied" by coincidence', () => {
    const doc = emptyDoc();
    // No real placement can exist out of bounds, but this proves the
    // bounds/hole gate runs FIRST regardless — a caller never needs a
    // real occupied placement out of bounds to trust this ordering.
    const reason = canvasPlacementRejectReason(doc, -5, -5, new Set(), true);
    expect(reason).toMatch(/floor/i);
  });

  it('addWallLine + straightWallsFootprintSet integration: a real authored wall line rejects its own footprint cell', () => {
    const { cst } = parseDungeon(emptyCanvasYaml(20, 30));
    addWallLine(cst, { cell: [5, 4], corner: 2 }, { cell: [5, 4], corner: 5 });
    const doc = toDungeonDoc(cst);
    const footprint = straightWallsFootprintSet(doc.wallLines, doc.canvas!);
    expect(
      canvasPlacementRejectReason(doc, 5, 4, footprint, true)
    ).not.toBeNull();
  });

  // rpg-project#169's "props on footprint cells" unit — Kirk's exact ask:
  // a bookcase resting against a drawn wall. `requiresStandable: false`
  // relaxes ONLY the footprint gate; every other gate (floor bounds,
  // holes, already-occupied) still applies to a prop exactly as it does
  // to a monster.
  describe('requiresStandable: false (props)', () => {
    it('a footprint cell is a LEGAL prop target — the standable gate is skipped', () => {
      const doc = emptyDoc();
      const footprint = new Set(['5,4']);
      expect(
        canvasPlacementRejectReason(doc, 5, 4, footprint, false)
      ).toBeNull();
    });

    it('the SAME footprint cell is still rejected for a placement that requires standable ground', () => {
      const doc = emptyDoc();
      const footprint = new Set(['5,4']);
      expect(
        canvasPlacementRejectReason(doc, 5, 4, footprint, true)
      ).not.toBeNull();
    });

    it('a hole is still rejected for a prop — the floor gate is unconditional', () => {
      const { cst } = parseDungeon(emptyCanvasYaml(20, 30));
      toggleHole(cst, 5, 5);
      const doc = toDungeonDoc(cst);
      expect(
        canvasPlacementRejectReason(doc, 5, 5, new Set(), false)
      ).not.toBeNull();
    });

    it('an already-occupied cell is still rejected for a prop — the occupied gate is unconditional', () => {
      const { cst } = parseDungeon(emptyCanvasYaml(20, 30));
      placeItem(cst, null, 'dnd5e:props:pillar', [3, 3]);
      const doc = toDungeonDoc(cst);
      expect(
        canvasPlacementRejectReason(doc, 3, 3, new Set(), false)
      ).not.toBeNull();
    });

    it('addWallLine + straightWallsFootprintSet integration: a real authored wall line permits a prop on its own footprint cell', () => {
      const { cst } = parseDungeon(emptyCanvasYaml(20, 30));
      addWallLine(
        cst,
        { cell: [5, 4], corner: 2 },
        { cell: [5, 4], corner: 5 }
      );
      const doc = toDungeonDoc(cst);
      const footprint = straightWallsFootprintSet(doc.wallLines, doc.canvas!);
      expect(
        canvasPlacementRejectReason(doc, 5, 4, footprint, false)
      ).toBeNull();
    });
  });

  // Coverage-based standability (rpg-project#169's live-design follow-up
  // with Kirk, 2026-08-07) — the full real pipeline, not a hand-typed
  // Set: a genuinely low-coverage footprint cell is legal even for a
  // MONSTER (`requiresStandable: true`), and a genuinely high-coverage
  // one stays blocked, driven entirely by `straightWallsFootprintCoverage`
  // + `standableFootprintKeys` against a real authored wallLine.
  describe('coverage-based standability — the real pipeline (requiresStandable: true)', () => {
    it('a low-coverage footprint cell is standable for a monster too — not just placeable for a prop', () => {
      const { cst } = parseDungeon(emptyCanvasYaml(50, 30));
      // The exact bench fixture from straightWallGeometry.test.ts's own
      // "hexCoverageFraction — measurement bench": cell (39,19) has
      // coverage ~1.67%, well under STANDABLE_COVERAGE_THRESHOLD (10%).
      addWallLine(
        cst,
        { cell: [37, 20], corner: 0 },
        { cell: [44, 18], corner: 0 }
      );
      const doc = toDungeonDoc(cst);
      const coverage = straightWallsFootprintCoverage(
        doc.wallLines,
        doc.canvas!
      );
      expect(coverage.get('39,19')).toBeLessThan(STANDABLE_COVERAGE_THRESHOLD);
      const standable = standableFootprintKeys(coverage);
      expect(
        canvasPlacementRejectReason(doc, 39, 19, standable, true)
      ).toBeNull();
    });

    it('a high-coverage footprint cell on the SAME line stays blocked for a monster', () => {
      const { cst } = parseDungeon(emptyCanvasYaml(50, 30));
      addWallLine(
        cst,
        { cell: [37, 20], corner: 0 },
        { cell: [44, 18], corner: 0 }
      );
      const doc = toDungeonDoc(cst);
      const coverage = straightWallsFootprintCoverage(
        doc.wallLines,
        doc.canvas!
      );
      // (42,19) is ~44.87% in the same bench — well above the threshold.
      expect(coverage.get('42,19')).toBeGreaterThan(
        STANDABLE_COVERAGE_THRESHOLD
      );
      const standable = standableFootprintKeys(coverage);
      expect(
        canvasPlacementRejectReason(doc, 42, 19, standable, true)
      ).not.toBeNull();
    });
  });
});
