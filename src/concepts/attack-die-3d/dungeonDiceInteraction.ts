import {
  coordToKey,
  HEX_SIZE,
  worldToCube,
} from '../../components/hex-grid/hexMath';
import type { Scene3D } from '../../components/session/atlasToScene3D';

export function adjustDungeonDiceHeight(
  currentHeight: number,
  pointerDeltaY: number,
  minimum: number,
  maximum: number
): number {
  return Math.min(
    maximum,
    Math.max(minimum, currentHeight - pointerDeltaY * 0.01)
  );
}

export function isDungeonDiceFloorPoint(
  scene: Scene3D,
  worldX: number,
  worldZ: number
): boolean {
  return scene.floorTiles.has(
    coordToKey(worldToCube({ x: worldX, z: worldZ }, HEX_SIZE))
  );
}

export function isDungeonDieOutOfBounds(
  scene: Scene3D,
  position: Readonly<{ x: number; y: number; z: number }>,
  surfaceY: number
): boolean {
  if (position.y < surfaceY - 0.5) return true;
  return (
    position.y < surfaceY + 0.05 &&
    !isDungeonDiceFloorPoint(scene, position.x, position.z)
  );
}
