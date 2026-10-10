import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import * as THREE from 'three';
import { workspaceBoundary, type RoomWorkspace } from './workspaceGeometry';

export function createGroundBoundaryGeometry(
  workspace: number | RoomWorkspace,
  roomAuthoring: boolean = true
): THREE.BufferGeometry {
  if (typeof workspace !== 'number' && workspace.kind === 'centered-odd-r') {
    return new THREE.BufferGeometry().setFromPoints(
      workspaceBoundary(workspace).flatMap(({ a, b }) =>
        [a, b].map(
          (p) => new THREE.Vector3(p.x, DUNGEON_SURFACE_Y + 0.015, p.z)
        )
      )
    );
  }
  const radius =
    typeof workspace === 'number' ? workspace : workspace.horizontalLimit + 1;
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
