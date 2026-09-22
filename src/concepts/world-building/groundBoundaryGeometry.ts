import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import * as THREE from 'three';

export function createGroundBoundaryGeometry(
  radius: number,
  roomAuthoring: boolean
): THREE.BufferGeometry {
  if (roomAuthoring) {
    const ground = new THREE.CircleGeometry(radius, 6);
    const position = ground.getAttribute('position');
    const points = Array.from(
      { length: 6 },
      (_, index) =>
        new THREE.Vector3(
          position.getX(index + 1),
          DUNGEON_SURFACE_Y + 0.015,
          -position.getY(index + 1)
        )
    );
    ground.dispose();
    return new THREE.BufferGeometry().setFromPoints(points);
  }

  return new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 6 }, (_, index) => {
      const angle = Math.PI / 6 + (index * Math.PI) / 3;
      return new THREE.Vector3(
        Math.cos(angle) * radius,
        DUNGEON_SURFACE_Y + 0.015,
        Math.sin(angle) * radius
      );
    })
  );
}
