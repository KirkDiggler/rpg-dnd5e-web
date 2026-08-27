import {
  coordToKey,
  cubeToWorld,
  HEX_SIZE,
  type CubeCoord,
} from '../../components/hex-grid/hexMath';
import type { Scene3D } from '../../components/session/atlasToScene3D';

export interface DungeonDiceBoxCollider {
  readonly id: string;
  readonly kind: 'floor' | 'wall' | 'door';
  readonly position: readonly [number, number, number];
  readonly halfExtents: readonly [number, number, number];
  readonly rotationY: number;
}

export function chooseDungeonDiceOrigin(
  scene: Scene3D,
  preferred: CubeCoord,
  occupiedKeys: ReadonlySet<string>
): readonly [number, number] {
  const preferredWorld = cubeToWorld(preferred, HEX_SIZE);
  let closest: readonly [number, number] | undefined;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const tile of scene.floorTiles.values()) {
    if (occupiedKeys.has(coordToKey(tile))) continue;
    const world = cubeToWorld(tile, HEX_SIZE);
    const distance = Math.hypot(
      world.x - preferredWorld.x,
      world.z - preferredWorld.z
    );
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = [world.x, world.z];
    }
  }
  return closest ?? [preferredWorld.x, preferredWorld.z];
}

export function buildDungeonDiceColliders(
  scene: Scene3D,
  options: {
    readonly surfaceY: number;
    readonly wallHeight: number;
    readonly openDoorIds: ReadonlySet<string>;
  }
): readonly DungeonDiceBoxCollider[] {
  const colliders: DungeonDiceBoxCollider[] = [];

  for (const [key, tile] of scene.floorTiles) {
    const world = cubeToWorld(tile, HEX_SIZE);
    colliders.push({
      id: `floor:${key}`,
      kind: 'floor',
      position: [world.x, options.surfaceY - 0.04, world.z],
      halfExtents: [0.82, 0.04, 0.72],
      rotationY: 0,
    });
  }

  for (const wall of scene.wallRuns) {
    const deltaX = wall.end.x - wall.start.x;
    const deltaZ = wall.end.z - wall.start.z;
    const length = Math.hypot(deltaX, deltaZ);
    if (!Number.isFinite(length) || length <= 0) continue;
    const height =
      wall.height > 0 ? options.wallHeight * wall.height : options.wallHeight;
    colliders.push({
      id: wall.key,
      kind: 'wall',
      position: [
        (wall.start.x + wall.end.x) / 2,
        options.surfaceY + height / 2,
        (wall.start.z + wall.end.z) / 2,
      ],
      halfExtents: [length / 2, height / 2, 0.08],
      rotationY: -Math.atan2(deltaZ, deltaX),
    });
  }

  for (const door of scene.doorGaps) {
    if (options.openDoorIds.has(door.connection)) continue;
    colliders.push({
      id: door.connection,
      kind: 'door',
      position: [
        door.position.x,
        options.surfaceY + options.wallHeight / 2,
        door.position.z,
      ],
      halfExtents: [0.5, options.wallHeight / 2, 0.1],
      rotationY: door.rotationY,
    });
  }

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
