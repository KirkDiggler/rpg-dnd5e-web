/**
 * The reference tomb as a version-2 document, built in code — the
 * builder's own fixture for tests and for the fixtures-mode sandbox
 * (`ConceptsView`). The canonical file is the toolkit's
 * `dungeonspec/testdata/reference-tomb.yaml` (plan T2) served by
 * `GetDungeon("reference-tomb")`; this one reproduces the design §2
 * shape (three regions 6/10/12 columns wide over 8 rows = the v1 embed's
 * 224 cells, both seams walled, one doorway each, the design's four
 * placements) so the round-trip and preview tests have a real-sized map
 * to chew on without a server.
 */
import type { DungeonDoc, RegionDoc } from '../dungeonYaml';
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

/** Every edge joining a cell of `a` to an adjacent cell of `b` — the
 * seam between two regions, as the builder would draw it wall by wall. */
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

export function referenceTombDoc(): DungeonDoc {
  const entrance = block('entrance', 'Entrance', 0.6, [0, 5], [0, 7]);
  const hall = block('hall', 'Hall', 0.4, [6, 15], [0, 7]);
  const tomb = block('tomb', 'Tomb', 0.15, [16, 27], [0, 7]);
  const p = (col: number, row: number) => fromOffset('pointy', [col, row]);

  const entranceHallDoor: Edge = normalizeEdge([p(5, 3), p(6, 3)]);
  const hallTombDoor: Edge = normalizeEdge([p(15, 3), p(16, 3)]);
  const doorKeys = new Set([entranceHallDoor, hallTombDoor].map(axialPairKey));
  const walls = [...seamEdges(entrance, hall), ...seamEdges(hall, tomb)]
    .filter((e) => !doorKeys.has(axialPairKey(e)))
    .map((edge) => ({ edges: [edge] }));

  return {
    version: 2,
    key: 'reference-tomb',
    name: 'The Reference Tomb',
    orientation: 'pointy',
    void: 'opaque',
    regions: [entrance, hall, tomb],
    start: p(1, 3),
    walls,
    doors: [
      { id: 'entrance-hall', edges: [entranceHallDoor] },
      {
        id: 'hall-tomb',
        edges: [hallTombDoor],
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

function axialPairKey([a, b]: Edge): string {
  return `${axialKey(a)}|${axialKey(b)}`;
}
