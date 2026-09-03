/**
 * The reference tomb as a version-2 document, built in code — the
 * builder's own fixture for tests and for the fixtures-mode sandbox
 * (`ConceptsView`). The canonical file is the toolkit's
 * `dungeonspec/testdata/reference-tomb.yaml` served by
 * `GetDungeon("reference-tomb")`; this one reproduces the design §2
 * shape (three regions 6/10/12 columns wide over 8 rows = the v1 embed's
 * 224 cells, both seams walled, one door each, the design's four
 * placements) so the round-trip and preview tests have a real-sized map
 * to chew on without a server.
 *
 * # Two walls, not thirty
 *
 * In the pair form each seam was a list of the fifteen crossings it
 * blocked, and the client had to guess the line back out of them. In the
 * line form (rpg-project#360 slice 2) a seam IS one wall: a thin quarter
 * line down the boundary, from one slanted midpoint to another. Both
 * seams sit between two columns whose straight crossings zigzag between
 * `u = 22` and `u = 24`, so the single line that cuts every one of them
 * runs down `u = 23` — a quarter width east of the straight midpoints,
 * which is exactly why the seam's DOOR moves.
 *
 * **The door moves one row** (design A6, amended in the build). No thin
 * line passes through a flat-side midpoint (F16), so the door that sat
 * on the straight crossing between cells `[5,3]` and `[6,3]` cannot
 * stand on this wall. It moves to the slanted midpoint of the same
 * cell — one row up, still between entrance and hall, still one
 * crossing. The thick alternative would have kept the door where it was
 * and sealed four entrance cells: the larger content change, so the door
 * moves instead.
 */
import type { DungeonDoc, PositionRef, RegionDoc } from '../dungeonYaml';
import { latticeOf, positionAt, type Lattice } from '../hexGeometry';
import {
  axialKey,
  axialNeighbors,
  fromOffset,
  normalizeEdge,
  type Axial,
  type Edge,
} from '../hexOffset';

function block(
  id: string,
  name: string,
  intensity: number,
  cols: [number, number],
  rows: [number, number]
): RegionDoc {
  const cells: Axial[] = [];
  for (let row = rows[0]; row <= rows[1]; row += 1) {
    for (let col = cols[0]; col <= cols[1]; col += 1) {
      cells.push(fromOffset('pointy', [col, row]));
    }
  }
  return { id, name, archetype: 'crypt', lighting: { intensity }, cells };
}

/** Every crossing joining a cell of `a` to an adjacent cell of `b` — the
 * seam between two regions, as the compiler derives it from the wall.
 * Kept so tests can check that the line blocks the seam the pair form
 * used to list by hand. */
export function seamEdges(a: RegionDoc, b: RegionDoc): Edge[] {
  const inB = new Set(b.cells.map(axialKey));
  const edges: Edge[] = [];
  for (const cell of a.cells) {
    for (const n of axialNeighbors(cell)) {
      if (inB.has(axialKey(n))) edges.push(normalizeEdge([cell, n]));
    }
  }
  return edges;
}

/** A position by its lattice address — how this fixture names the two
 * seam lines and the doors on them. */
export function tombPosition(l: Lattice): PositionRef {
  const p = positionAt('pointy', l);
  if (!p) throw new Error(`referenceTomb: ${l.u},${l.v} is not a position`);
  return p;
}

/** The lattice address of a cell's own centre — for tests that want to
 * name a seam line relative to the columns it runs between. */
export const tombCentre = (col: number, row: number): Lattice =>
  latticeOf('pointy', {
    cell: fromOffset('pointy', [col, row]),
    offset: [0, 0],
  });

/** Where each seam's quarter line runs, and where its door stands. */
export const TOMB_SEAMS = {
  entranceHall: { u: 23, doorV: 5 },
  hallTomb: { u: 63, doorV: 5 },
} as const;

/** The wall's ends span every row: row 0's cells reach up to v = 0 and
 * row 7's down to v = 14, so -1 and 15 put the line through all eight. */
const SEAM_TOP = -1;
const SEAM_BOTTOM = 15;

export function referenceTombDoc(): DungeonDoc {
  const entrance = block('entrance', 'Entrance', 0.6, [0, 5], [0, 7]);
  const hall = block('hall', 'Hall', 0.4, [6, 15], [0, 7]);
  const tomb = block('tomb', 'Tomb', 0.15, [16, 27], [0, 7]);
  const p = (col: number, row: number) => fromOffset('pointy', [col, row]);
  const seam = (u: number) => ({
    start: tombPosition({ u, v: SEAM_TOP }),
    end: tombPosition({ u, v: SEAM_BOTTOM }),
  });

  return {
    version: 2,
    key: 'reference-tomb',
    name: 'The Reference Tomb',
    orientation: 'pointy',
    void: 'opaque',
    regions: [entrance, hall, tomb],
    scenery: [],
    start: p(1, 3),
    walls: [
      { ...seam(TOMB_SEAMS.entranceHall.u), name: 'entrance seam' },
      { ...seam(TOMB_SEAMS.hallTomb.u), name: 'tomb seam' },
    ],
    doors: [
      {
        id: 'entrance-hall',
        at: tombPosition({
          u: TOMB_SEAMS.entranceHall.u,
          v: TOMB_SEAMS.entranceHall.doorV,
        }),
      },
      {
        id: 'hall-tomb',
        at: tombPosition({
          u: TOMB_SEAMS.hallTomb.u,
          v: TOMB_SEAMS.hallTomb.doorV,
        }),
        locked: [{ ability: 'dex', dc: 12 }],
      },
    ],
    place: [
      {
        ref: 'dnd5e:props:brazier',
        at: p(1, 1),
        blocksMovement: true,
        blocksLos: false,
      },
      {
        ref: 'dnd5e:props:pillar',
        at: p(8, 2),
        blocksMovement: true,
        blocksLos: true,
      },
      {
        ref: 'dnd5e:monsters:skeleton',
        at: p(11, 3),
        targeting: 'lowest-health',
      },
      {
        ref: 'dnd5e:monsters:skeleton-captain',
        at: p(23, 5),
        targeting: 'closest',
        boss: true,
      },
    ],
  };
}
