import {
  coordToKey,
  HEX_SIZE,
  worldToCube,
} from '@/components/hex-grid/hexMath';
import type { Scene3D } from '@/components/session/atlasToScene3D';

export function isLocalWorldDieFloorPoint(
  scene: Scene3D,
  worldX: number,
  worldZ: number
): boolean {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return false;
  return scene.floorTiles.has(
    coordToKey(worldToCube({ x: worldX, z: worldZ }, HEX_SIZE))
  );
}
