/**
 * atlas — turns a `GetAtlasResponse` into something drawable, and nothing else.
 *
 * W3 of rpg-project#227 (the web reimplementation) starts here rather than in a
 * component, because the interesting part of the new wire is geometric and can
 * be checked without a browser.
 *
 * # This is not the old wire wearing a new type
 *
 * The old `EncounterService` had no walls on it at all: `wallRuns.ts` DERIVES
 * room envelopes from hex membership, with parity-corrected rows and a reserved
 * connector column, because nothing on that wire said where a wall was. The new
 * atlas carries `boundaries` explicitly — walls are DECLARED — so almost none
 * of that derivation is needed here. That is a simplification, not a port.
 */

import { refId } from '@/utils/refs';
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import type {
  AtlasBoundary,
  AtlasDoorway,
  AtlasProp,
  Position,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  GridKind,
  HexLayout as HexLayoutPb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

/**
 * HexLayout is which way the hexes point — the render word.
 *
 * IT IS ON THE WIRE: `GetAtlasResponse.layout` (session v0.20.0,
 * rpg-toolkit#1140, toolkit ADR-0040). Read it. Do not infer it from the cells,
 * from the dungeon's `orientation:` field, or from a bounding box.
 *
 * Why that sentence needs saying: this client was the one that found the field
 * missing. Axial (q,r) fixes the topology — the same six neighbours either way —
 * but not the picture: the same cells laid out pointy-topped and flat-topped are
 * two different images, one roughly the other rotated. Drawing the reference
 * tomb the obvious way, from its authored `orientation: pointy`, produced a
 * diagonal staircase; MEASURING said flat; and the two disagreeing was the
 * report. Chasing it found `tools/spatial` running the two orientations through
 * each other's offset schemes — swapped identically both ways, so every
 * round-trip cancelled it and only a drawing could see it. Corrected in
 * rpg-toolkit#1141 → #1145; with that, the authored word and the right layout
 * agree, and the wire says which so no client has to measure again.
 *
 * The wire calls it `layout`, not `orientation`, on purpose: the composition
 * keeps `orientation` as the frame an author typed cells in, and this is what a
 * client does with the cells it receives. Same two values, a different question
 * — and the staircase happened because the two questions shared one word.
 */
export type HexLayout = 'pointy' | 'flat';

/**
 * layoutFromWire turns the atlas's layout into the render word.
 *
 * A hex map that arrives without one is a server defect, and this THROWS rather
 * than guessing: capabilities are supplied, never defaulted, and a default here
 * is exactly how the staircase got drawn. A square map has no layout and gets
 * null — the wire mirrors the composition's law that a square field must not
 * declare one.
 */
export function layoutFromWire(
  layout: HexLayoutPb,
  grid: GridKind
): HexLayout | null {
  if (grid !== GridKind.HEX) {
    return null;
  }
  switch (layout) {
    case HexLayoutPb.POINTY_TOP:
      return 'pointy';
    case HexLayoutPb.FLAT_TOP:
      return 'flat';
    default:
      throw new Error(
        'atlas is hex but carries no layout: the server must say which way the hexes point (rpg-toolkit#1140)'
      );
  }
}

/** A point in SVG user space. */
export interface Point {
  x: number;
  y: number;
}

/** A drawn wall: the shared edge between two cells the world separates. */
export interface WallSegment {
  a: Point;
  b: Point;
  blocksMovement: boolean;
  blocksLineOfSight: boolean;
}

/** A drawn doorway: the link between two cells a member may cross. */
export interface DoorwayLink {
  connection: string;
  a: Point;
  b: Point;
}

/** A prop, placed and carrying its own two answers. */
export interface PlacedProp {
  ref: string;
  /** The last segment of the ref — "coffin" out of "dnd5e:props:coffin". */
  name: string;
  center: Point;
  blocksMovement: boolean;
  blocksLineOfSight: boolean;
}

/** A cell, keyed so a click can name it back to the server. */
export interface PlacedCell {
  key: string;
  cell: Position;
  center: Point;
  /** The hexagon's six corners, ready for an SVG polygon. */
  corners: Point[];
}

export interface AtlasScene {
  cells: PlacedCell[];
  props: PlacedProp[];
  walls: WallSegment[];
  doorways: DoorwayLink[];
  viewBox: string;
}

/**
 * axialDistance is how many steps apart two cells are, in cube space.
 *
 * Axial (q,r) with s = -(q+r) derived, which is what the atlas's `GRID_KIND_HEX`
 * means by "addressed in axial coordinates, where distance is measured in cube
 * space".
 */
export function axialDistance(a: Position, b: Position): number {
  const dq = a.x - b.x;
  const dr = a.y - b.y;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** cellKey names a cell the way a Map wants it. */
export const cellKey = (p: Position | undefined): string =>
  p ? `${p.x},${p.y}` : '';

/**
 * hexCenter places an axial cell in SVG user space.
 *
 * `size` is the circumradius — centre to corner — which for a regular hexagon
 * is also its side length.
 */
export function hexCenter(
  cell: Position,
  size: number,
  layout: HexLayout
): Point {
  const q = cell.x;
  const r = cell.y;
  if (layout === 'pointy') {
    return {
      x: size * Math.sqrt(3) * (q + r / 2),
      y: size * (3 / 2) * r,
    };
  }
  return {
    x: size * (3 / 2) * q,
    y: size * Math.sqrt(3) * (r + q / 2),
  };
}

/** hexCorners returns the six corners of the hexagon centred on `center`. */
export function hexCorners(
  center: Point,
  size: number,
  layout: HexLayout
): Point[] {
  const offset = layout === 'pointy' ? -Math.PI / 6 : 0;
  return Array.from({ length: 6 }, (_, i) => {
    const angle = offset + (Math.PI / 3) * i;
    return {
      x: center.x + size * Math.cos(angle),
      y: center.y + size * Math.sin(angle),
    };
  });
}

/**
 * edgeBetween returns the segment two neighbouring cells share.
 *
 * The construction is worth stating because it is what makes a declared
 * boundary drawable at all: for adjacent regular hexagons the shared edge is
 * perpendicular to the line joining their centres, centred on its midpoint, and
 * exactly one side long. So it is the midpoint, plus and minus the unit
 * perpendicular scaled by half a side.
 *
 * Cells that are not neighbours have no shared edge, and passing them here is a
 * caller's mistake rather than something to approximate: it returns null.
 *
 * ADJACENCY IS CHECKED, not assumed. The perpendicular-bisector construction
 * above happily produces a segment for any two distinct cells, so without this
 * an invalid boundary would be DRAWN -- somewhere plausible-looking and wrong,
 * halfway across a chamber -- rather than dropped. That is the same failure the
 * missing-endpoint guard in buildScene exists to prevent, and it is worse here
 * because the result looks like a real wall.
 */
export function edgeBetween(
  from: Position,
  to: Position,
  size: number,
  layout: HexLayout
): { a: Point; b: Point } | null {
  const A = hexCenter(from, size, layout);
  const B = hexCenter(to, size, layout);
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const dist = Math.hypot(dx, dy);
  if (dist === 0 || axialDistance(from, to) !== 1) {
    return null;
  }
  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  // Unit perpendicular to the centre-to-centre line.
  const px = -dy / dist;
  const py = dx / dist;
  const half = size / 2;
  return {
    a: { x: mid.x + px * half, y: mid.y + py * half },
    b: { x: mid.x - px * half, y: mid.y - py * half },
  };
}

/** propName is the WHOLE id of a "module:type:id" ref — everything after
 * the second colon, so an exact ref keeps the family that tells it apart:
 * `dnd5e:props:plushie:skeleton-dog` is `plushie:skeleton-dog`, not
 * `skeleton-dog`. A string that is not a ref names itself. */
export const propName = (ref: string): string => refId(ref) ?? ref;

const PAD = 2;

/**
 * buildScene lays the whole atlas out once.
 *
 * Boundaries and doorways whose endpoints the server omitted are DROPPED rather
 * than drawn at the origin, because proto3 makes an absent message and a
 * message of zeroes indistinguishable at the field level, and (0,0) is a real
 * cell. A wall silently drawn across the entrance is worse than a wall missing.
 */
export function buildScene(
  atlas: Pick<GetAtlasResponse, 'cells' | 'props' | 'boundaries' | 'doorways'>,
  size: number,
  layout: HexLayout
): AtlasScene {
  const cells: PlacedCell[] = atlas.cells.map((cell) => {
    const center = hexCenter(cell, size, layout);
    return {
      key: cellKey(cell),
      cell,
      center,
      corners: hexCorners(center, size, layout),
    };
  });

  const props: PlacedProp[] = atlas.props
    .filter((p: AtlasProp) => p.at !== undefined)
    .map((p: AtlasProp) => ({
      ref: p.ref,
      name: propName(p.ref),
      center: hexCenter(p.at as Position, size, layout),
      blocksMovement: p.blocksMovement,
      blocksLineOfSight: p.blocksLineOfSight,
    }));

  const walls: WallSegment[] = [];
  for (const b of atlas.boundaries as AtlasBoundary[]) {
    if (!b.from || !b.to) {
      continue;
    }
    const edge = edgeBetween(b.from, b.to, size, layout);
    if (!edge) {
      continue;
    }
    walls.push({
      ...edge,
      blocksMovement: b.blocksMovement,
      blocksLineOfSight: b.blocksLineOfSight,
    });
  }

  const doorways: DoorwayLink[] = [];
  for (const d of atlas.doorways as AtlasDoorway[]) {
    if (!d.from || !d.to) {
      continue;
    }
    doorways.push({
      connection: d.connection,
      a: hexCenter(d.from, size, layout),
      b: hexCenter(d.to, size, layout),
    });
  }

  return { cells, props, walls, doorways, viewBox: viewBoxOf(cells, size) };
}

/** viewBoxOf frames every cell, with a hex of padding so nothing clips. */
export function viewBoxOf(cells: PlacedCell[], size: number): string {
  if (cells.length === 0) {
    return '0 0 1 1';
  }
  const xs = cells.map((c) => c.center.x);
  const ys = cells.map((c) => c.center.y);
  const minX = Math.min(...xs) - size * PAD;
  const minY = Math.min(...ys) - size * PAD;
  const maxX = Math.max(...xs) + size * PAD;
  const maxY = Math.max(...ys) + size * PAD;
  return `${minX} ${minY} ${maxX - minX} ${maxY - minY}`;
}
