import { cubeToWorld, HEX_SIZE } from '@/components/hex-grid/hexMath';
import type { Scene3D } from '@/components/session/atlasToScene3D';
import { WALL_HEIGHT } from '@/rendering/calibrationConstants';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';

export interface LocalWorldDieCollider {
  readonly id: string;
  readonly kind: 'floor' | 'wall' | 'door';
  readonly position: readonly [number, number, number];
  readonly halfExtents: readonly [number, number, number];
  readonly rotationY: number;
}

export function buildLocalWorldDieColliders(
  scene: Scene3D,
  openDoorIds: ReadonlySet<string>
): readonly LocalWorldDieCollider[] {
  const colliders: LocalWorldDieCollider[] = [];
  for (const [key, tile] of scene.floorTiles) {
    const world = cubeToWorld(tile, HEX_SIZE);
    colliders.push({
      id: `floor:${key}`,
      kind: 'floor',
      position: [world.x, DUNGEON_SURFACE_Y - 0.04, world.z],
      halfExtents: [0.82, 0.04, 0.72],
      rotationY: 0,
    });
  }
  for (const wall of scene.wallRuns) {
    const dx = wall.end.x - wall.start.x;
    const dz = wall.end.z - wall.start.z;
    const length = Math.hypot(dx, dz);
    if (!Number.isFinite(length) || length <= 0) continue;
    const height = wall.height > 0 ? WALL_HEIGHT * wall.height : WALL_HEIGHT;
    colliders.push({
      id: wall.key,
      kind: 'wall',
      position: [
        (wall.start.x + wall.end.x) / 2,
        DUNGEON_SURFACE_Y + height / 2,
        (wall.start.z + wall.end.z) / 2,
      ],
      halfExtents: [length / 2, height / 2, 0.08],
      rotationY: -Math.atan2(dz, dx),
    });
  }
  for (const door of scene.doorGaps) {
    if (openDoorIds.has(door.connection)) continue;
    colliders.push({
      id: door.connection,
      kind: 'door',
      position: [
        door.position.x,
        DUNGEON_SURFACE_Y + WALL_HEIGHT / 2,
        door.position.z,
      ],
      halfExtents: [0.5, WALL_HEIGHT / 2, 0.1],
      rotationY: door.rotationY,
    });
  }
  const kindOrder = { floor: 0, wall: 1, door: 2 } as const;
  colliders.sort((left, right) => {
    const byKind = kindOrder[left.kind] - kindOrder[right.kind];
    if (byKind !== 0) return byKind;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
  return Object.freeze(
    colliders.map((collider) =>
      Object.freeze({
        ...collider,
        position: Object.freeze(collider.position),
        halfExtents: Object.freeze(collider.halfExtents),
      })
    )
  );
}
