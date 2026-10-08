import { useDungeonShellCatalog } from '@/components/session/useDungeonShellCatalog';
import { ErrorBoundary } from '@/components/ui/Feedback/ErrorBoundary';
import type { DungeonShellFloorProfile } from '@/rendering/dungeonShellManifest';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import { useTexture } from '@react-three/drei';
import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { usePresentationWorkspace } from './usePresentationWorkspace';
import { createWorkspaceFloorGeometry } from './workspaceFloorGeometry';
import type { RoomWorkspace } from './workspaceGeometry';

type WorkspaceFloorExtent =
  | { workspace: RoomWorkspace; radius?: number }
  | { radius: number; workspace?: RoomWorkspace };

export function WorkspaceFloorSurface({
  radius,
  workspace,
  profile,
}: WorkspaceFloorExtent & { profile: DungeonShellFloorProfile }) {
  const presentationWorkspace = usePresentationWorkspace(workspace);
  const sharedTexture = useTexture(`/models/synty/${profile.diffuse}`);
  const texture = useMemo(() => {
    const owned = sharedTexture.clone();
    owned.wrapS = THREE.RepeatWrapping;
    owned.wrapT = THREE.RepeatWrapping;
    owned.repeat.set(1, 1);
    owned.needsUpdate = true;
    return owned;
  }, [sharedTexture]);
  const geometry = useMemo(() => {
    const extent = presentationWorkspace ?? radius;
    if (extent === undefined)
      throw new Error('Workspace floor requires a workspace or legacy radius.');
    return createWorkspaceFloorGeometry(extent, profile.worldUnitsPerRepeat);
  }, [profile.worldUnitsPerRepeat, radius, presentationWorkspace]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => texture.dispose(), [texture]);

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
export function WorkspaceFloorUnderlay({
  radius,
  workspace,
}: WorkspaceFloorExtent) {
  const shellCatalog = useDungeonShellCatalog();
  if (shellCatalog.status !== 'ready') return null;

  return (
    <Suspense fallback={null}>
      <ErrorBoundary fallback={<group name="workspace-floor-underlay-error" />}>
        {workspace ? (
          <WorkspaceFloorSurface
            workspace={workspace}
            profile={shellCatalog.catalog.profiles.crypt.floor}
          />
        ) : (
          <WorkspaceFloorSurface
            radius={radius!}
            profile={shellCatalog.catalog.profiles.crypt.floor}
          />
        )}
      </ErrorBoundary>
    </Suspense>
  );
}
