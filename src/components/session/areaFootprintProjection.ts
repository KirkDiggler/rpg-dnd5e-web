import {
  FootprintOrigin,
  FootprintShape,
  type Footprint,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  cubeToWorld,
  type CubeCoord,
  type WorldPos,
} from '../hex-grid/hexMath';

/** The encounter engine's fixed authored scale (`encounter.FeetPerCell`). */
export const FEET_PER_HEX = 5;

export type AreaFootprintProjection =
  | {
      kind: 'box';
      center: WorldPos;
      /** Full box depth in world units, along the aimed bearing. */
      depth: number;
      /** Full box width in world units, across the aimed bearing. */
      width: number;
      /** Three.js Y rotation; local +X points along the aimed bearing. */
      rotationY: number;
    }
  | {
      kind: 'radius';
      center: WorldPos;
      radius: number;
      rotationY: 0;
    };

interface AreaFootprintProjectionInput {
  footprint?: Footprint;
  caster: CubeCoord;
  aimed: CubeCoord | null;
  hexSize: number;
}

function finiteCube(coord: CubeCoord): boolean {
  return (
    Number.isFinite(coord.x) &&
    Number.isFinite(coord.y) &&
    Number.isFinite(coord.z) &&
    Math.abs(coord.x + coord.y + coord.z) < 1e-9
  );
}

/**
 * Places provider-authored presentation geometry in the same pointy-top plane
 * as toolkit `HexEmbedding`/`Coverage`. One web hex is `sqrt(3) * hexSize`
 * across the flats, corresponding to the engine's five-foot `CellWidth`.
 * This projects an outline only; it never rasterizes affected cells.
 */
export function areaFootprintProjection({
  footprint,
  caster,
  aimed,
  hexSize,
}: AreaFootprintProjectionInput): AreaFootprintProjection | null {
  if (
    !footprint ||
    !Number.isFinite(footprint.sizeFeet) ||
    footprint.sizeFeet <= 0 ||
    !Number.isFinite(hexSize) ||
    hexSize <= 0 ||
    !finiteCube(caster)
  ) {
    return null;
  }

  const casterCenter = cubeToWorld(caster, hexSize);
  const worldUnitsPerFoot = (Math.sqrt(3) * hexSize) / FEET_PER_HEX;
  const extent = footprint.sizeFeet * worldUnitsPerFoot;

  if (
    footprint.shape === FootprintShape.RADIUS &&
    footprint.origin === FootprintOrigin.CASTER
  ) {
    return {
      kind: 'radius',
      center: casterCenter,
      radius: extent,
      rotationY: 0,
    };
  }

  if (
    footprint.shape !== FootprintShape.BOX ||
    footprint.origin !== FootprintOrigin.CASTER_EDGE ||
    !aimed ||
    !finiteCube(aimed)
  ) {
    return null;
  }

  const aimedCenter = cubeToWorld(aimed, hexSize);
  const dx = aimedCenter.x - casterCenter.x;
  const dz = aimedCenter.z - casterCenter.z;
  const aimDistance = Math.hypot(dx, dz);
  if (aimDistance === 0) return null;

  // Toolkit `boxPolygon`: the near edge begins one inradius (half the
  // across-flats cell width) from the caster, then the full depth extends out.
  const centerDistance = (Math.sqrt(3) * hexSize + extent) / 2;
  const ux = dx / aimDistance;
  const uz = dz / aimDistance;

  return {
    kind: 'box',
    center: {
      x: casterCenter.x + ux * centerDistance,
      z: casterCenter.z + uz * centerDistance,
    },
    depth: extent,
    width: extent,
    // Three's positive Y rotation sends local +X toward world -Z, while the
    // toolkit bearing uses +Y south (the web's +Z), hence the sign inversion.
    rotationY: -Math.atan2(dz, dx),
  };
}
