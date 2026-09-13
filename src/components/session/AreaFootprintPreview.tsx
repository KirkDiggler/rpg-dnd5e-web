import type { Footprint } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { createHexShape } from '../hex-grid/hexGeometry';
import { cubeToWorld, type CubeCoord } from '../hex-grid/hexMath';
import {
  areaFootprintProjection,
  type AreaFootprintProjection,
} from './areaFootprintProjection';

const PREVIEW_Y = 0.225;
const FILL_COLOR = '#67e8f9';
const BORDER_COLOR = '#cffafe';
const GRID_COLOR = '#dbeafe';
const FILL_OPACITY = 0.16;
const GRID_OPACITY = 0.42;
const GRID_Y = PREVIEW_Y + 0.003;
const CIRCLE_SEGMENTS = 64;
const CLIP_EPSILON = 1e-9;

/** Opts preview drawing out of R3F raycasting, not merely out of handlers. */
export const NON_INTERACTIVE_FOOTPRINT_RAYCAST: THREE.Object3D['raycast'] =
  () => undefined;

export interface AreaFootprintPreviewProps {
  footprint?: Footprint;
  caster: CubeCoord;
  /** Existing effective canvas hover; a box has no direction without it. */
  aimed: CubeCoord | null;
  hexSize: number;
}

interface GridPoint {
  x: number;
  z: number;
}

interface GridSegment {
  from: GridPoint;
  to: GridPoint;
}

function toProjectionLocal(
  point: GridPoint,
  projection: AreaFootprintProjection
): GridPoint {
  const dx = point.x - projection.center.x;
  const dz = point.z - projection.center.z;
  const cos = Math.cos(projection.rotationY);
  const sin = Math.sin(projection.rotationY);
  return {
    x: cos * dx - sin * dz,
    z: sin * dx + cos * dz,
  };
}

function clipToBox(
  from: GridPoint,
  to: GridPoint,
  halfDepth: number,
  halfWidth: number
): GridSegment | null {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  let start = 0;
  let end = 1;

  for (const [origin, delta, lower, upper] of [
    [from.x, dx, -halfDepth, halfDepth],
    [from.z, dz, -halfWidth, halfWidth],
  ] as const) {
    if (Math.abs(delta) < CLIP_EPSILON) {
      if (origin < lower || origin > upper) return null;
      continue;
    }
    const first = (lower - origin) / delta;
    const second = (upper - origin) / delta;
    start = Math.max(start, Math.min(first, second));
    end = Math.min(end, Math.max(first, second));
    if (start > end) return null;
  }

  return {
    from: { x: from.x + dx * start, z: from.z + dz * start },
    to: { x: from.x + dx * end, z: from.z + dz * end },
  };
}

function clipToCircle(
  from: GridPoint,
  to: GridPoint,
  radius: number
): GridSegment | null {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const a = dx * dx + dz * dz;
  const b = 2 * (from.x * dx + from.z * dz);
  const c = from.x * from.x + from.z * from.z - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (a < CLIP_EPSILON || discriminant < 0) return null;

  const root = Math.sqrt(Math.max(0, discriminant));
  const first = (-b - root) / (2 * a);
  const second = (-b + root) / (2 * a);
  const start = Math.max(0, Math.min(first, second));
  const end = Math.min(1, Math.max(first, second));
  if (start > end || end - start < CLIP_EPSILON) return null;

  return {
    from: { x: from.x + dx * start, z: from.z + dz * start },
    to: { x: from.x + dx * end, z: from.z + dz * end },
  };
}

function worldBounds(projection: AreaFootprintProjection) {
  if (projection.kind === 'radius') {
    return {
      minX: projection.center.x - projection.radius,
      maxX: projection.center.x + projection.radius,
      minZ: projection.center.z - projection.radius,
      maxZ: projection.center.z + projection.radius,
    };
  }

  const halfDepth = projection.depth / 2;
  const halfWidth = projection.width / 2;
  const cos = Math.cos(projection.rotationY);
  const sin = Math.sin(projection.rotationY);
  const extentX = Math.abs(cos) * halfDepth + Math.abs(sin) * halfWidth;
  const extentZ = Math.abs(sin) * halfDepth + Math.abs(cos) * halfWidth;
  return {
    minX: projection.center.x - extentX,
    maxX: projection.center.x + extentX,
    minZ: projection.center.z - extentZ,
    maxZ: projection.center.z + extentZ,
  };
}

function clipGridEdge(
  from: GridPoint,
  to: GridPoint,
  projection: AreaFootprintProjection
): GridSegment | null {
  const localFrom = toProjectionLocal(from, projection);
  const localTo = toProjectionLocal(to, projection);
  const clipped =
    projection.kind === 'box'
      ? clipToBox(
          localFrom,
          localTo,
          projection.depth / 2,
          projection.width / 2
        )
      : clipToCircle(localFrom, localTo, projection.radius);
  if (!clipped) return null;

  const cos = Math.cos(projection.rotationY);
  const sin = Math.sin(projection.rotationY);
  const toWorld = (point: GridPoint): GridPoint => ({
    x: projection.center.x + cos * point.x + sin * point.z,
    z: projection.center.z - sin * point.x + cos * point.z,
  });
  return { from: toWorld(clipped.from), to: toWorld(clipped.to) };
}

/**
 * Draw-only hex seams clipped to the supplied footprint. Candidate lattice
 * cells exist only long enough to emit three unique visual edges; this does
 * not compute, return, or imply the engine's affected-cell set.
 */
function createAreaFootprintGridGeometry(
  projection: AreaFootprintProjection,
  hexSize: number
): THREE.BufferGeometry {
  const bounds = worldBounds(projection);
  const corners = [
    [bounds.minX - hexSize, bounds.minZ - hexSize],
    [bounds.minX - hexSize, bounds.maxZ + hexSize],
    [bounds.maxX + hexSize, bounds.minZ - hexSize],
    [bounds.maxX + hexSize, bounds.maxZ + hexSize],
  ] as const;
  const axial = corners.map(([x, z]) => {
    const r = z / (1.5 * hexSize);
    return { q: x / (Math.sqrt(3) * hexSize) - r / 2, r };
  });
  const minQ = Math.floor(Math.min(...axial.map(({ q }) => q))) - 1;
  const maxQ = Math.ceil(Math.max(...axial.map(({ q }) => q))) + 1;
  const minR = Math.floor(Math.min(...axial.map(({ r }) => r))) - 1;
  const maxR = Math.ceil(Math.max(...axial.map(({ r }) => r))) + 1;
  const cornersAroundCenter = createHexShape(hexSize, 1)
    .getPoints(1)
    .slice(0, 6)
    .map((point) => ({ x: point.x, z: -point.y }));
  const positions: number[] = [];

  for (let q = minQ; q <= maxQ; q += 1) {
    for (let r = minR; r <= maxR; r += 1) {
      const center = cubeToWorld({ x: q, y: -q - r, z: r }, hexSize);
      // Opposing cells own edges 3..5, so 0..2 draws each ordinary seam once.
      for (let edge = 0; edge < 3; edge += 1) {
        const first = cornersAroundCenter[edge]!;
        const second = cornersAroundCenter[edge + 1]!;
        const clipped = clipGridEdge(
          { x: center.x + first.x, z: center.z + first.z },
          { x: center.x + second.x, z: center.z + second.z },
          projection
        );
        if (!clipped) continue;
        positions.push(
          clipped.from.x,
          0,
          clipped.from.z,
          clipped.to.x,
          0,
          clipped.to.z
        );
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  return geometry;
}

function ProjectedAreaFootprint({
  projection,
  hexSize,
}: {
  projection: AreaFootprintProjection;
  hexSize: number;
}) {
  const fillGeometry = useMemo(
    () =>
      projection.kind === 'box'
        ? new THREE.PlaneGeometry(projection.depth, projection.width)
        : new THREE.CircleGeometry(projection.radius, CIRCLE_SEGMENTS),
    [projection]
  );
  const borderGeometry = useMemo(
    () => new THREE.EdgesGeometry(fillGeometry),
    [fillGeometry]
  );
  const gridGeometry = useMemo(
    () => createAreaFootprintGridGeometry(projection, hexSize),
    [hexSize, projection]
  );

  useEffect(
    () => () => {
      fillGeometry.dispose();
      borderGeometry.dispose();
      gridGeometry.dispose();
    },
    [borderGeometry, fillGeometry, gridGeometry]
  );

  return (
    <>
      <group
        name="area-footprint-preview"
        position={[projection.center.x, PREVIEW_Y, projection.center.z]}
        rotation={[0, projection.rotationY, 0]}
      >
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <mesh
            name="area-footprint-preview-fill"
            geometry={fillGeometry}
            raycast={NON_INTERACTIVE_FOOTPRINT_RAYCAST}
            renderOrder={20}
          >
            <meshBasicMaterial
              color={FILL_COLOR}
              transparent
              opacity={FILL_OPACITY}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <lineSegments
            name="area-footprint-preview-border"
            geometry={borderGeometry}
            raycast={NON_INTERACTIVE_FOOTPRINT_RAYCAST}
            renderOrder={22}
          >
            <lineBasicMaterial
              color={BORDER_COLOR}
              transparent
              opacity={0.95}
              depthWrite={false}
            />
          </lineSegments>
        </group>
      </group>
      <lineSegments
        name="area-footprint-preview-grid"
        position={[0, GRID_Y, 0]}
        geometry={gridGeometry}
        raycast={NON_INTERACTIVE_FOOTPRINT_RAYCAST}
        renderOrder={21}
      >
        <lineBasicMaterial
          color={GRID_COLOR}
          transparent
          opacity={GRID_OPACITY}
          depthWrite={false}
        />
      </lineSegments>
    </>
  );
}

/** Generic provider-footprint drawing; unsupported/invalid placement is null. */
export function AreaFootprintPreview({
  footprint,
  caster,
  aimed,
  hexSize,
}: AreaFootprintPreviewProps) {
  const projection = useMemo(
    () =>
      areaFootprintProjection({
        footprint,
        caster: { x: caster.x, y: caster.y, z: caster.z },
        aimed: aimed ? { x: aimed.x, y: aimed.y, z: aimed.z } : null,
        hexSize,
      }),
    [aimed, caster.x, caster.y, caster.z, footprint, hexSize]
  );

  return projection ? (
    <ProjectedAreaFootprint projection={projection} hexSize={hexSize} />
  ) : null;
}
