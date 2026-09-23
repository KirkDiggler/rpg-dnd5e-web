import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { cubeToWorld, type CubeCoord } from '../hex-grid/hexMath';
import { NON_INTERACTIVE_FOOTPRINT_RAYCAST } from './AreaFootprintPreview';

/** Explicit provider-selected target outline, above the area fill and grid. */
export function AreaTargetOutline({
  position,
  hexSize,
}: {
  position: CubeCoord;
  hexSize: number;
}) {
  const geometry = useMemo(
    () =>
      new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 6 }, (_, i) => {
          const angle = ((30 + 60 * i) * Math.PI) / 180;
          return new THREE.Vector3(
            hexSize * Math.cos(angle),
            0,
            hexSize * Math.sin(angle)
          );
        })
      ),
    [hexSize]
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  const world = cubeToWorld(position, hexSize);
  return (
    <lineLoop
      geometry={geometry}
      position={[world.x, 0.26, world.z]}
      renderOrder={30}
      raycast={NON_INTERACTIVE_FOOTPRINT_RAYCAST}
    >
      <lineBasicMaterial color="#ffb347" depthWrite={false} depthTest={false} />
    </lineLoop>
  );
}
