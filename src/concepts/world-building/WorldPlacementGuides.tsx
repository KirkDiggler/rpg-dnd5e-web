import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { useMemo } from 'react';
import * as THREE from 'three';
import {
  placementAnchorHex,
  type CompositionGuideBounds,
} from './placementGuides';

function makeAnchorFillGeometry(
  center: { x: number; z: number },
  corners: readonly { x: number; z: number }[]
) {
  const positions = [center.x, DUNGEON_SURFACE_Y + 0.017, center.z];
  for (const corner of corners) {
    positions.push(corner.x, DUNGEON_SURFACE_Y + 0.017, corner.z);
  }
  const indices: number[] = [];
  for (let index = 0; index < corners.length; index += 1) {
    indices.push(0, index + 1, ((index + 1) % corners.length) + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function WorldPlacementGuideControl({
  showCompositionBounds,
  onShowCompositionBoundsChange,
}: {
  showCompositionBounds: boolean;
  onShowCompositionBoundsChange: (show: boolean) => void;
}) {
  return (
    <label className="wb-placement-guide-control">
      <input
        type="checkbox"
        checked={showCompositionBounds}
        onChange={(event) =>
          onShowCompositionBoundsChange(event.currentTarget.checked)
        }
      />
      <i
        className="wb-placement-guide-swatch wb-placement-guide-swatch--bounds"
        aria-hidden="true"
      />
      <span>Show composition bounds</span>
    </label>
  );
}

export function WorldPlacementGuides({
  bounds,
  showCompositionBounds,
}: {
  bounds: CompositionGuideBounds | null;
  showCompositionBounds: boolean;
}) {
  const anchor = useMemo(placementAnchorHex, []);
  const fillGeometry = useMemo(
    () => makeAnchorFillGeometry(anchor.center, anchor.corners),
    [anchor.center, anchor.corners]
  );
  const outlineGeometry = useMemo(
    () =>
      new THREE.BufferGeometry().setFromPoints(
        anchor.corners.map(
          (corner) =>
            new THREE.Vector3(corner.x, DUNGEON_SURFACE_Y + 0.023, corner.z)
        )
      ),
    [anchor.corners]
  );

  return (
    <group name="world-building-placement-guides">
      <mesh
        name="world-building-placement-anchor-fill"
        geometry={fillGeometry}
        raycast={() => null}
        renderOrder={3}
      >
        <meshBasicMaterial
          color="#fbbf24"
          transparent
          opacity={0.22}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <lineLoop
        name="world-building-placement-anchor-outline"
        geometry={outlineGeometry}
        raycast={() => null}
        renderOrder={4}
      >
        <lineBasicMaterial color="#fbbf24" toneMapped={false} />
      </lineLoop>
      {showCompositionBounds && bounds && (
        <mesh
          name="world-building-composition-bounds"
          position={bounds.center}
          raycast={() => null}
          renderOrder={5}
        >
          <boxGeometry args={bounds.size} />
          <meshBasicMaterial
            color="#fb923c"
            wireframe
            transparent
            opacity={0.9}
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}
