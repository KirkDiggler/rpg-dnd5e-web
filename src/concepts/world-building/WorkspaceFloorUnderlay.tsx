import { useDungeonShellCatalog } from '@/components/session/useDungeonShellCatalog';
import { ErrorBoundary } from '@/components/ui/Feedback/ErrorBoundary';
import type { DungeonShellFloorProfile } from '@/rendering/dungeonShellManifest';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { useTexture } from '@react-three/drei';
import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { createWorkspaceFloorGeometry } from './workspaceFloorGeometry';

export function WorkspaceFloorSurface({
  radius,
  profile,
}: {
  radius: number;
  profile: DungeonShellFloorProfile;
}) {
  const sharedTexture = useTexture(`/models/synty/${profile.diffuse}`);
  const texture = useMemo(() => {
    const owned = sharedTexture.clone();
    owned.wrapS = THREE.RepeatWrapping;
    owned.wrapT = THREE.RepeatWrapping;
    owned.repeat.set(1, 1);
    owned.needsUpdate = true;
    return owned;
  }, [sharedTexture]);
  const geometry = useMemo(
    () => createWorkspaceFloorGeometry(radius, profile.worldUnitsPerRepeat),
    [profile.worldUnitsPerRepeat, radius]
  );

  useEffect(
    () => () => {
      geometry.dispose();
      texture.dispose();
    },
    [geometry, texture]
  );

  return (
    <mesh
      name="workspace-floor-underlay"
      geometry={geometry}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, DUNGEON_SURFACE_Y - 0.006, 0]}
      raycast={() => null}
      receiveShadow
    >
      <meshBasicMaterial map={texture} color="#8f8b82" toneMapped={false} />
    </mesh>
  );
}

/**
 * Optional room-authoring visual. Catalog and texture loading stay inside this
 * boundary so the plain, interactive ground remains mounted at every state.
 */
export function WorkspaceFloorUnderlay({ radius }: { radius: number }) {
  const shellCatalog = useDungeonShellCatalog();
  if (shellCatalog.status !== 'ready') return null;

  return (
    <Suspense fallback={null}>
      <ErrorBoundary fallback={<group name="workspace-floor-underlay-error" />}>
        <WorkspaceFloorSurface
          radius={radius}
          profile={shellCatalog.catalog.profiles.crypt.floor}
        />
      </ErrorBoundary>
    </Suspense>
  );
}
