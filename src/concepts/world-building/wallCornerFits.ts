import { WORLD_BUILDING_CATALOG_BY_REF } from './catalog';
import { layoutWallPieces, wallLength } from './structuralWallEditing';
import type { StructuralWall } from './structuralWalls';
import { pointOnWallAxis } from './wallAngleConstraint';

export interface WallEndFits {
  start?: number;
  end?: number;
}
export interface WallFitAsset {
  width: number;
  height: number;
  depth: number;
}
export function wallFitAsset(ref: string): WallFitAsset | undefined {
  const entry = WORLD_BUILDING_CATALOG_BY_REF.get(ref);
  if (
    !entry ||
    entry.source !== 'generated' ||
    !entry.asset.tags.includes('wall-miter-90')
  )
    return undefined;
  const [width, height, depth] = entry.asset.boundsMeters;
  return { width, height, depth };
}
/** Derive presentation only. Capability is supplied by the catalog owner. */
export function deriveWallCornerFits(
  walls: readonly StructuralWall[],
  asset: (ref: string) => WallFitAsset | undefined = wallFitAsset,
  maxPieces?: number
): {
  fits: Map<string, WallEndFits>;
  reasons: Map<string, string>;
} {
  const fits = new Map<string, WallEndFits>(),
    reasons = new Map<string, string>();
  type End = { wall: StructuralWall; end: 'start' | 'end' };
  const points = new Map<string, End[]>();
  for (const wall of walls)
    for (const end of ['start', 'end'] as const) {
      const p = wall.line[end],
        key = `${p.x},${p.z}`;
      points.set(key, [...(points.get(key) ?? []), { wall, end }]);
    }
  const reject = (ends: End[], message: string): void => {
    for (const { wall } of ends) reasons.set(wall.id, message);
  };
  const terminal = ({ wall, end }: End, shape: WallFitAsset): boolean => {
    const spans = layoutWallPieces({
      wall,
      sourceWidthMeters: shape.width,
      sourceHeightMeters: shape.height,
      sourceDepthMeters: shape.depth,
      maxPieces,
    });
    const span = end === 'start' ? spans[0] : spans.at(-1);
    return (
      !!span &&
      (end === 'start'
        ? span.span.start === 0
        : span.span.end === wallLength(wall)) &&
      (span.span.end - span.span.start) / span.pieces.length >
        wall.appearance.thickness
    );
  };
  for (const ends of points.values()) {
    if (ends.length < 2) continue;
    if (ends.length !== 2 || ends[0]!.wall.id === ends[1]!.wall.id) {
      reject(ends, 'Corner fitting supports two walls, not junctions.');
      continue;
    }
    const [a, b] = ends as [End, End],
      aa = asset(a.wall.appearance.assetRef),
      bb = asset(b.wall.appearance.assetRef);
    if (!aa || !bb) {
      reject(
        ends,
        'For a flush corner, explicitly choose Castle Wall Fit 01 (or another enrolled appearance) on both walls.'
      );
      continue;
    }
    const mismatch = (['height', 'thickness', 'elevation'] as const).find(
      (key) => a.wall.appearance[key] !== b.wall.appearance[key]
    );
    if (mismatch) {
      reject(
        ends,
        `Corner fitting requires matching ${mismatch}: ${a.wall.appearance[mismatch]} versus ${b.wall.appearance[mismatch]}. Enter the same value on both walls.`
      );
      continue;
    }
    const vector = (wall: StructuralWall): { x: number; z: number } => ({
      x: wall.line.end.x - wall.line.start.x,
      z: wall.line.end.z - wall.line.start.z,
    });
    const av = vector(a.wall),
      bv = vector(b.wall);
    try {
      if (
        !pointOnWallAxis({
          anchor: { x: 0, z: 0 },
          point: bv,
          direction: { x: -av.z, z: av.x },
        })
      ) {
        reject(ends, 'Corner fitting requires perpendicular walls.');
        continue;
      }
      if (!terminal(a, aa) || !terminal(b, bb)) {
        reject(
          ends,
          'Corner fitting needs solid terminal pieces longer than their thickness, clear of openings.'
        );
        continue;
      }
    } catch {
      reject(
        ends,
        'Corner fitting could not derive supported terminal pieces.'
      );
      continue;
    }
    const al = Math.hypot(av.x, av.z),
      bl = Math.hypot(bv.x, bv.z);
    const ad = { x: av.x / al, z: av.z / al },
      bd = { x: bv.x / bl, z: bv.z / bl };
    const as = a.end === 'start' ? 1 : -1,
      bs = b.end === 'start' ? 1 : -1;
    const normal = { x: bs * bd.x - as * ad.x, z: bs * bd.z - as * ad.z };
    for (const [end, d] of [
      [a, ad],
      [b, bd],
    ] as const) {
      const slope =
        -(normal.x * -d.z + normal.z * d.x) / (normal.x * d.x + normal.z * d.z);
      fits.set(end.wall.id, { ...fits.get(end.wall.id), [end.end]: slope });
    }
  }
  return { fits, reasons };
}
