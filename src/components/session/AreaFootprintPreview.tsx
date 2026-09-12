import type { Footprint } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { CubeCoord } from '../hex-grid/hexMath';
import {
  areaFootprintProjection,
  type AreaFootprintProjection,
} from './areaFootprintProjection';

const PREVIEW_Y = 0.225;
const FILL_COLOR = '#67e8f9';
const BORDER_COLOR = '#cffafe';
const FILL_OPACITY = 0.16;
const CIRCLE_SEGMENTS = 64;

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

function ProjectedAreaFootprint({
  projection,
}: {
  projection: AreaFootprintProjection;
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

  useEffect(
    () => () => {
      fillGeometry.dispose();
      borderGeometry.dispose();
    },
    [borderGeometry, fillGeometry]
  );

  return (
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
          renderOrder={21}
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

  return projection ? <ProjectedAreaFootprint projection={projection} /> : null;
}
