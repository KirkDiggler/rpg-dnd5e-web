import type {
  WorldScene,
  WorldTransform,
} from '@/concepts/world-building/types';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import type { VisualPointLightSource } from '@/rendering/visualPointLightSelection';

export interface CompositionLightPlacement {
  readonly compositionId: string;
  readonly placementId: string;
  readonly transform: WorldTransform;
}

function rotateYaw(x: number, z: number, yaw: number): [number, number] {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  // Three.js positive-Y yaw turns +X toward -Z.
  return [x * cosine + z * sine, -x * sine + z * cosine];
}

/**
 * Project enabled authored declarations to render coordinates. The offset is
 * part-local: part yaw applies first, the shared rendered-prop surface lift is
 * added once, then the complete composition placement applies once.
 * Group/support records are authoring relations, not transforms.
 */
export function projectCompositionPointLights(
  scene: WorldScene,
  placement: CompositionLightPlacement
): VisualPointLightSource[] {
  return scene.items.flatMap((item) => {
    const light = item.pointLight;
    if (!light?.enabled) return [];

    const [partOffsetX, partOffsetZ] = rotateYaw(
      light.offset.x,
      light.offset.z,
      item.transform.rotationY
    );
    const localX = item.transform.x + partOffsetX;
    const localY = item.transform.y + DUNGEON_SURFACE_Y + light.offset.y;
    const localZ = item.transform.z + partOffsetZ;
    const [placedX, placedZ] = rotateYaw(
      localX,
      localZ,
      placement.transform.rotationY
    );

    return [
      {
        key: `composition:${placement.placementId}:${item.id}`,
        compositionId: placement.compositionId,
        placementId: placement.placementId,
        partId: item.id,
        position: [
          placement.transform.x + placedX,
          placement.transform.y + localY,
          placement.transform.z + placedZ,
        ] as const,
        color: light.color,
        intensity: light.intensity,
        distance: light.range,
      },
    ];
  });
}
