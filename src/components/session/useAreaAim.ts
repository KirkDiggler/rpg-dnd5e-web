import { useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import {
  worldToCube,
  worldToFractionalCube,
  type CubeCoord,
} from '../hex-grid/hexMath';

/** Shared floor-plane aiming, with cell snapping for point placement. */
export function useAreaAim(
  enabled: boolean,
  hexSize: number,
  onCast?: (aim: CubeCoord) => void,
  snapToCell = false
) {
  const { gl, camera } = useThree();
  const [aim, setAim] = useState<CubeCoord | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    let down: { x: number; y: number } | null = null;
    const project = (event: MouseEvent): CubeCoord | null => {
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return null;
      raycaster.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
          -((event.clientY - bounds.top) / bounds.height) * 2 + 1
        ),
        camera
      );
      const point = raycaster.ray.intersectPlane(floor, new THREE.Vector3());
      return point
        ? (snapToCell ? worldToCube : worldToFractionalCube)(
            { x: point.x, z: point.z },
            hexSize
          )
        : null;
    };
    const move = (event: PointerEvent) => {
      const next = project(event);
      if (next) setAim(next);
    };
    const start = (event: PointerEvent) => {
      if (event.button === 0) down = { x: event.clientX, y: event.clientY };
    };
    const click = (event: MouseEvent) => {
      if (event.button !== 0) return;
      // Own left clicks while armed, including clicks over a creature model.
      event.stopImmediatePropagation();
      if (
        !down ||
        Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5
      )
        return;
      down = null;
      const next = project(event);
      if (next) {
        setAim(next);
        onCast?.(next);
      }
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('click', click, true);
    return () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerdown', start);
      canvas.removeEventListener('click', click, true);
    };
  }, [enabled, hexSize, gl, camera, onCast, snapToCell]);
  return enabled ? aim : null;
}
