import * as THREE from 'three';
import type { WorldScene } from './types';
import type { WorldBuildingDragPayload } from './worldBuildingDrag';

export type WorldBuildingDropTarget =
  | { kind: 'ground'; point: { x: number; z: number } }
  | {
      kind: 'surface';
      point: { x: number; y: number; z: number };
      supportId: string;
    };

interface TaggedObject extends THREE.Object3D {
  userData: {
    worldBuildingGround?: boolean;
    worldBuildingSupportId?: string;
  };
}

function taggedAncestor(
  object: THREE.Object3D,
  key: 'worldBuildingGround' | 'worldBuildingSupportId'
): TaggedObject | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const tagged = current as TaggedObject;
    if (tagged.userData[key]) return tagged;
    current = current.parent;
  }
  return null;
}

function hasUpwardWorldFace(intersection: THREE.Intersection): boolean {
  if (!intersection.face) return false;
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(
    intersection.object.matrixWorld
  );
  return (
    intersection.face.normal.clone().applyMatrix3(normalMatrix).normalize().y >
    0.55
  );
}

export function dropTargetFromIntersections(
  payload: WorldBuildingDragPayload,
  intersections: readonly THREE.Intersection[],
  floorY: number
): WorldBuildingDropTarget | null {
  if (payload.kind === 'prop') {
    for (const intersection of intersections) {
      const support = taggedAncestor(
        intersection.object,
        'worldBuildingSupportId'
      );
      if (support && hasUpwardWorldFace(intersection)) {
        return {
          kind: 'surface',
          point: {
            x: intersection.point.x,
            y: Math.max(0, intersection.point.y - floorY),
            z: intersection.point.z,
          },
          supportId: support.userData.worldBuildingSupportId!,
        };
      }
      if (taggedAncestor(intersection.object, 'worldBuildingGround')) {
        return {
          kind: 'ground',
          point: { x: intersection.point.x, z: intersection.point.z },
        };
      }
    }
    return null;
  }

  // Arrangement Y values are floor-relative, so stamps intentionally seek the
  // real ground even when the pointer ray also crosses a prop.
  const ground = intersections.find((intersection) =>
    taggedAncestor(intersection.object, 'worldBuildingGround')
  );
  return ground
    ? {
        kind: 'ground',
        point: { x: ground.point.x, z: ground.point.z },
      }
    : null;
}

export function resolveWorldSelectionId(
  scene: WorldScene,
  intersections: readonly THREE.Intersection[]
): string | null {
  const hitIds = [
    ...new Set(
      intersections.flatMap((intersection) => {
        const id = intersection.object.userData.worldBuildingInteractionId;
        return typeof id === 'string' ? [id] : [];
      })
    ),
  ];
  return (
    hitIds.find((id) => {
      const item = scene.items.find((entry) => entry.id === id);
      return !!item?.supportId && hitIds.includes(item.supportId);
    }) ??
    hitIds[0] ??
    null
  );
}
