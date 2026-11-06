import { ErrorBoundary } from '@/components/ui/Feedback/ErrorBoundary';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import {
  requireGroundStyle,
  type GroundCatalogSnapshot,
} from '@/rendering/groundCatalog';
import type { RegionLightingMaterialBinding } from '@/rendering/regionLightingMaterials';
import { Html, useTexture } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  buildGroundGeometry,
  groupGroundTiles,
  type GroundBatch,
  type GroundTile,
} from './groundGeometry';
import { useRememberedModelTint } from './useRememberedModelTint';

interface FloorProfile {
  readonly diffuse: string;
  readonly worldUnitsPerRepeat: number;
}
interface GroundFloorProps {
  tiles: readonly GroundTile[];
  hexSize: number;
  catalog: GroundCatalogSnapshot;
  defaultProfile?: FloorProfile;
  visualLighting?: RegionLightingMaterialBinding;
}

function Diagnostic({
  batch,
  hexSize,
  message,
}: {
  batch: GroundBatch;
  hexSize: number;
  message: string;
}) {
  const geometry = useMemo(
    () => buildGroundGeometry(batch.tiles, hexSize, 1),
    [batch.tiles, hexSize]
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group>
      <mesh
        name="ground-diagnostic"
        geometry={geometry}
        position={[0, DUNGEON_SURFACE_Y, 0]}
        userData={{ message }}
        raycast={() => null}
      >
        <meshBasicMaterial color="#d850a0" toneMapped={false} />
      </mesh>
      <Html center>
        <div role="alert" className="rounded bg-red-950 p-2 text-sm text-white">
          {message}
        </div>
      </Html>
    </group>
  );
}

function Surface({
  batch,
  hexSize,
  profile,
  visualLighting,
}: {
  batch: GroundBatch;
  hexSize: number;
  profile: FloorProfile;
  visualLighting?: RegionLightingMaterialBinding;
}) {
  const root = useRef<THREE.Mesh>(null);
  const shared = useTexture(`/models/synty/${profile.diffuse}`);
  const texture = useMemo(() => {
    const map = shared.clone();
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1, 1);
    if (batch.ref !== undefined) map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
    return map;
  }, [shared, batch.ref]);
  const geometry = useMemo(
    () =>
      buildGroundGeometry(batch.tiles, hexSize, profile.worldUnitsPerRepeat),
    [batch.tiles, hexSize, profile.worldUnitsPerRepeat]
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => texture.dispose(), [texture]);
  useRememberedModelTint(
    root,
    false,
    texture.id,
    visualLighting,
    'ground-floor',
    'workspace-basic'
  );
  return (
    <mesh
      ref={root}
      name={`ground-style-${batch.ref ?? 'default'}`}
      geometry={geometry}
      position={[0, DUNGEON_SURFACE_Y, 0]}
      raycast={() => null}
    >
      <meshBasicMaterial
        map={batch.remembered ? null : texture}
        vertexColors
        toneMapped={false}
      />
    </mesh>
  );
}

/** Shared Studio/play surface. Its caller supplies only the cells it may draw. */
export function GroundFloor({
  tiles,
  hexSize,
  catalog,
  defaultProfile,
  visualLighting,
}: GroundFloorProps) {
  const batches = useMemo(() => groupGroundTiles(tiles), [tiles]);
  return (
    <group name="region-ground">
      {batches.map((batch) => {
        const key = JSON.stringify([batch.ref ?? null, batch.remembered]);
        let profile: FloorProfile | undefined = defaultProfile;
        let problem: string | undefined;
        if (batch.ref !== undefined) {
          if (catalog.status === 'ready') {
            try {
              profile = requireGroundStyle(catalog.catalog, batch.ref);
            } catch (error) {
              problem =
                error instanceof Error
                  ? error.message
                  : 'Ground appearance unavailable';
            }
          } else
            problem =
              catalog.status === 'error'
                ? catalog.message
                : 'Ground appearances loading';
        }
        if (problem || !profile)
          return (
            <Diagnostic
              key={key}
              batch={batch}
              hexSize={hexSize}
              message={problem ?? 'Default ground profile unavailable'}
            />
          );
        return (
          <ErrorBoundary
            key={`${key}:${profile.diffuse}`}
            fallback={
              <Diagnostic
                batch={batch}
                hexSize={hexSize}
                message={`Ground image unavailable: ${batch.ref ?? 'default'}`}
              />
            }
          >
            <Suspense
              fallback={
                <Diagnostic
                  batch={batch}
                  hexSize={hexSize}
                  message="Ground image loading"
                />
              }
            >
              <Surface
                batch={batch}
                hexSize={hexSize}
                profile={profile}
                visualLighting={visualLighting}
              />
            </Suspense>
          </ErrorBoundary>
        );
      })}
    </group>
  );
}
