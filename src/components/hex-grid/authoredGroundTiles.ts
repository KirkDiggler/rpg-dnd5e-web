import type { AbsoluteFloorTile } from '@/hooks/dungeonMapGeometry';
import * as THREE from 'three';
import type { GroundTile } from './groundGeometry';
import { cubeToWorld } from './hexMath';
import {
  CRYPT_MEMORY_COLOR,
  rememberedFloorColor,
  watchZoneFloorColor,
} from './sceneKnowledge';
import {
  CRYPT_DARK_FLOOR_TINT,
  computeFloorPoolColor,
  type DungeonFloorLighting,
  type FloorPoolLight,
} from './syntyHexFloorHelpers';

/** Compose existing lighting/knowledge overlays on explicit source-color ground. */
export function authoredGroundTiles({
  tiles,
  refs,
  hexSize,
  lighting,
  remembered,
  poolLights,
}: {
  tiles: readonly AbsoluteFloorTile[];
  refs: ReadonlyMap<string, string>;
  hexSize: number;
  lighting?: DungeonFloorLighting;
  remembered?: ReadonlySet<string>;
  poolLights?: readonly FloorPoolLight[];
}): GroundTile[] {
  const out: GroundTile[] = [];
  for (const tile of tiles) {
    const key = `${tile.x},${tile.y},${tile.z}`;
    const ref = refs.get(key);
    if (ref === undefined) continue;
    const cell = { x: tile.x, y: tile.y, z: tile.z };
    const isRemembered = remembered?.has(key) ?? false;
    if (isRemembered) {
      out.push({
        cell,
        ref,
        remembered: true,
        color: [
          CRYPT_MEMORY_COLOR.r,
          CRYPT_MEMORY_COLOR.g,
          CRYPT_MEMORY_COLOR.b,
        ],
      });
      continue;
    }
    const exposure = Math.max(
      0,
      Math.min(1, lighting?.exposureByCell.get(key) ?? 1)
    );
    const base = CRYPT_DARK_FLOOR_TINT.clone().lerp(
      new THREE.Color(1, 1, 1),
      exposure
    );
    const world = cubeToWorld(cell, hexSize);
    const pooled = computeFloorPoolColor(
      base,
      world.x,
      world.z,
      lighting?.poolsByCell.get(key) ?? poolLights ?? []
    );
    const fog = rememberedFloorColor(
      pooled,
      lighting?.litByCell?.get(key) ?? 1
    );
    const color = lighting?.watchZoneCells?.has(key)
      ? watchZoneFloorColor(fog)
      : fog;
    out.push({
      cell,
      ref,
      remembered: false,
      color: [color.r, color.g, color.b],
    });
  }
  return out;
}
