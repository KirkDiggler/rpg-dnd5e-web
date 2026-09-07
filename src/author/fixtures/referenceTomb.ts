/**
 * The reference tomb — THE TOOLKIT'S OWN FILE, parsed.
 *
 * `reference-tomb.yaml` beside this module is a verbatim copy of
 * `rulebooks/dnd5e/encounter/dungeonspec/testdata/reference-tomb.yaml` on
 * the toolkit's wall-geometry branch: the file the compiler compiles and
 * `GetDungeon("reference-tomb")` serves. It is not a conversion, not a
 * reconstruction, and not this module's idea of what the tomb should be
 * — the builder's fixture and the server's fixture are one text, so a
 * disagreement about what the tomb IS cannot hide between them.
 *
 * That matters twice over here. The file's positions are named from
 * FLOOR cells (`start: {cell: [5,7], offset: [0.25, 0.375]}`, not the
 * row-8 cell the same point could also be named from), and its doors sit
 * at the nearest position on the line to where the pair form had them.
 * Both are things a conversion gets subtly wrong and a copy cannot.
 *
 * # Two walls, and a door that moved one row
 *
 * Each seam is ONE wall: a thin quarter line down the boundary, from one
 * slanted midpoint to another. Under the pair form it was fifteen
 * crossings and the client fitted the line back out of them.
 *
 * Under the pair form both doors opened a straight west-east crossing,
 * whose side midpoint lies half a width from the column's centres — a
 * quarter line does not pass through it, and no thin line does (design
 * F16). So each door moved one row onto the slanted midpoint the wall
 * actually crosses, which opens a crossing between the same two rooms
 * one hex over. The toolkit's file says this in its own comment; this
 * one repeats it because the door's position is the thing a reader will
 * question.
 */
import type { RegionDoc } from '../dungeonYaml';
import { parseDungeon, type DungeonDoc } from '../dungeonYaml';
import { latticeOf, positionAt, type Lattice } from '../hexGeometry';
import {
  axialKey,
  axialNeighbors,
  fromOffset,
  normalizeEdge,
  type Edge,
} from '../hexOffset';
import referenceTombYaml from './reference-tomb.yaml?raw';

/** The file's own bytes, for the test that pins the round trip against
 * the text the server reads rather than against this module's output. */
export const REFERENCE_TOMB_YAML: string = referenceTombYaml;

export function referenceTombDoc(): DungeonDoc {
  return parseDungeon(REFERENCE_TOMB_YAML);
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

/** A position by its lattice address, in the orientation-only canonical
 * spelling — for tests that name a point rather than read one. */
export function tombPosition(l: Lattice) {
  const p = positionAt('pointy', l);
  if (!p) throw new Error(`referenceTomb: ${l.u},${l.v} is not a position`);
  return p;
}

/** The lattice address of a cell's own centre. */
export const tombCentre = (col: number, row: number): Lattice =>
  latticeOf('pointy', {
    cell: fromOffset('pointy', [col, row]),
    offset: [0, 0],
  });

/** Where each seam's quarter line runs, and where its door stands — read
 * off the file rather than restated, so this cannot drift from it. */
export function tombSeams(doc: DungeonDoc = referenceTombDoc()) {
  return doc.walls.map((wall, index) => ({
    index,
    name: wall.name,
    start: latticeOf('pointy', wall.start),
    end: latticeOf('pointy', wall.end),
    door: doc.doors[index]
      ? latticeOf('pointy', doc.doors[index].at)
      : undefined,
  }));
}
