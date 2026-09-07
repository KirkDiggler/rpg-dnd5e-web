import {
  cubeToWorld,
  HEX_SIZE,
  hexCorners,
  type WorldPos,
} from '@/components/hex-grid/hexMath';
import type { PropModelBounds } from '@/components/hex-grid/PropModel';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import * as THREE from 'three';
import type { WorldScene } from './types';

export interface MeasuredWorldPropBounds {
  assetRef: string;
  bounds: PropModelBounds;
}

export interface CompositionGuideBounds {
  center: [number, number, number];
  size: [number, number, number];
}

/** The authored composition origin is the center of the real shared X0/Z0 hex. */
export function placementAnchorHex(): {
  center: WorldPos;
  corners: WorldPos[];
} {
  const center = cubeToWorld({ x: 0, y: 0, z: 0 }, HEX_SIZE);
  return { center, corners: hexCorners(center, HEX_SIZE) };
}

/**
 * Merge only loaded PropModel measurements at their authored transforms.
 * This is a visual authoring guide, not a footprint or persisted scene fact.
 */
export function compositionGuideBounds(
  scene: WorldScene,
  measuredById: ReadonlyMap<string, MeasuredWorldPropBounds>
): CompositionGuideBounds | null {
  const aggregate = new THREE.Box3();
  let hasBounds = false;

  for (const item of scene.items) {
    const measured = measuredById.get(item.id);
    if (!measured || measured.assetRef !== item.assetRef) return null;

    const { bounds } = measured;
    if (
      !Number.isFinite(bounds.width) ||
      !Number.isFinite(bounds.height) ||
      !Number.isFinite(bounds.depth) ||
      !Number.isFinite(bounds.minY) ||
      !Number.isFinite(bounds.maxY) ||
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      bounds.depth <= 0
    ) {
      return null;
    }

    const cos = Math.cos(item.transform.rotationY);
    const sin = Math.sin(item.transform.rotationY);
    const halfX =
      (Math.abs(cos) * bounds.width + Math.abs(sin) * bounds.depth) / 2;
    const halfZ =
      (Math.abs(sin) * bounds.width + Math.abs(cos) * bounds.depth) / 2;
    const floorY = DUNGEON_SURFACE_Y + item.transform.y;

    aggregate.expandByPoint(
      new THREE.Vector3(
        item.transform.x - halfX,
        floorY + bounds.minY,
        item.transform.z - halfZ
      )
    );
    aggregate.expandByPoint(
      new THREE.Vector3(
        item.transform.x + halfX,
        floorY + bounds.maxY,
        item.transform.z + halfZ
      )
    );
    hasBounds = true;
  }

  if (!hasBounds) return null;
  const center = aggregate.getCenter(new THREE.Vector3());
  const size = aggregate.getSize(new THREE.Vector3());
  return {
    center: [center.x, center.y, center.z],
    size: [size.x, size.y, size.z],
  };
}
