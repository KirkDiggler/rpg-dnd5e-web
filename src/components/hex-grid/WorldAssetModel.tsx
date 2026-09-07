import {
  resolveWorldAsset,
  type WorldAssetResolutionDiagnostic,
} from '@/generated/worldAssetCatalog';
import { SYNTY_SCALE } from '@/rendering/calibrationConstants';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import type * as THREE from 'three';
import type { PropModelBounds } from './PropModel';

export interface WorldAssetModelProps {
  /** A promoted exact ref. Family refs and unknown exact refs never fall back. */
  assetRef: string;
  position: [number, number, number];
  rotationY?: number;
  onBoundsMeasured?: (bounds: PropModelBounds) => void;
  onDiagnostic?: (diagnostic: WorldAssetResolutionDiagnostic) => void;
}

function LoadedWorldAssetModel({
  url,
  boundsMeters,
  position,
  rotationY,
  onBoundsMeasured,
}: {
  url: string;
  boundsMeters: [number, number, number];
  position: [number, number, number];
  rotationY: number;
  onBoundsMeasured?: (bounds: PropModelBounds) => void;
}) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const measuredBounds = useMemo<PropModelBounds>(
    () => ({
      minY: 0,
      maxY: boundsMeters[1] * SYNTY_SCALE,
      width: boundsMeters[0] * SYNTY_SCALE,
      height: boundsMeters[1] * SYNTY_SCALE,
      depth: boundsMeters[2] * SYNTY_SCALE,
    }),
    [boundsMeters]
  );
  useEffect(
    () => onBoundsMeasured?.(measuredBounds),
    [measuredBounds, onBoundsMeasured]
  );

  return (
    <group
      name="world-asset-model"
      position={[position[0], position[1] + DUNGEON_SURFACE_Y, position[2]]}
      rotation={[0, rotationY, 0]}
      scale={SYNTY_SCALE}
    >
      <primitive object={cloned as THREE.Object3D} />
    </group>
  );
}

/**
 * Generic renderer for provider-normalized world assets. The provider has
 * already baked scale correction, yaw, centering, and grounding into the GLB;
 * the consumer adds only authored position/yaw and the shared Synty scale.
 */
export function WorldAssetModel({
  assetRef,
  position,
  rotationY = 0,
  onBoundsMeasured,
  onDiagnostic,
}: WorldAssetModelProps) {
  const asset = resolveWorldAsset(assetRef, onDiagnostic);
  if (!asset) return null;
  return (
    <LoadedWorldAssetModel
      url={asset.url}
      boundsMeters={asset.boundsMeters}
      position={position}
      rotationY={rotationY}
      onBoundsMeasured={onBoundsMeasured}
    />
  );
}
