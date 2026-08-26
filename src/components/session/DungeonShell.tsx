import type { DoorInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useGLTF, useTexture } from '@react-three/drei';
import { Suspense, useEffect } from 'react';
import type { DungeonShellProfile } from '../../rendering/dungeonShellManifest';
import {
  type ShellFallbackReason,
  resolveDungeonShellProfile,
} from '../../rendering/dungeonShellProfile';
import { HEX_SIZE } from '../hex-grid/hexMath';
import { SyntyHexFloor } from '../hex-grid/SyntyHexFloor';
import { DOOR_LEAF_FILE } from '../hex-grid/syntyHexWallHelpers';
import { ErrorBoundary } from '../ui/Feedback/ErrorBoundary';
import type { Scene3D } from './atlasToScene3D';
import { AtlasWalls } from './AtlasWalls';
import { useDungeonShellCatalog } from './useDungeonShellCatalog';

export type { ShellFallbackReason } from '../../rendering/dungeonShellProfile';

export interface DungeonShellProps {
  scene: Scene3D;
  doors?: ReadonlyMap<string, DoorInfo>;
  onDoorClick?: (door: string) => void;
  onFallbackReason?: (reason: ShellFallbackReason | null) => void;
}

const modelUrl = (file: `env/${string}.glb`) => `/models/synty/${file}`;
const textureUrl = (file: `textures/${string}.png`) => `/models/synty/${file}`;

function FallbackReporter({
  reason,
  onFallbackReason,
}: Pick<DungeonShellProps, 'onFallbackReason'> & {
  reason: ShellFallbackReason | null;
}) {
  useEffect(() => {
    onFallbackReason?.(reason);
  }, [onFallbackReason, reason]);
  return null;
}

function LegacyShell({
  scene,
  doors,
  onDoorClick,
  reason,
  onFallbackReason,
  suppressDoorLeaves,
}: DungeonShellProps & {
  reason: ShellFallbackReason | null;
  suppressDoorLeaves?: boolean;
}) {
  return (
    <>
      <FallbackReporter reason={reason} onFallbackReason={onFallbackReason} />
      <SyntyHexFloor floorTiles={scene.floorTiles} hexSize={HEX_SIZE} />
      <AtlasWalls
        wallRuns={scene.wallRuns}
        doorGaps={scene.doorGaps}
        doors={doors}
        onDoorClick={onDoorClick}
        suppressDoorLeaves={suppressDoorLeaves}
      />
    </>
  );
}

function ProfileResources({
  scene,
  profile,
  doors,
  onDoorClick,
  onFallbackReason,
}: DungeonShellProps & {
  profile: DungeonShellProfile;
}) {
  // Every resource is read before either profile leaf is returned. This is
  // the atomic gate: a profile can never paint a floor without its walls.
  useTexture(textureUrl(profile.floor.diffuse));
  useGLTF(modelUrl(profile.wall.body.file));
  useGLTF(modelUrl(profile.wall.base.file));
  useGLTF(modelUrl(profile.wall.cap.file));
  useGLTF(modelUrl(profile.wall.doorSurround.file));
  const leafScene = useGLTF(modelUrl(`env/${DOOR_LEAF_FILE}`)).scene;

  return (
    <>
      <FallbackReporter reason={null} onFallbackReason={onFallbackReason} />
      <SyntyHexFloor
        floorTiles={scene.floorTiles}
        hexSize={HEX_SIZE}
        profile={profile.floor}
      />
      <AtlasWalls
        wallRuns={scene.wallRuns}
        doorGaps={scene.doorGaps}
        doors={doors}
        onDoorClick={onDoorClick}
        profile={profile.wall}
        profileLeafScene={leafScene}
      />
    </>
  );
}

function profileKey(profile: DungeonShellProfile): string {
  return JSON.stringify(profile);
}

export function DungeonShell({
  scene,
  doors,
  onDoorClick,
  onFallbackReason,
}: DungeonShellProps) {
  const catalog = useDungeonShellCatalog();
  const selection = resolveDungeonShellProfile(scene.archetypes, catalog);

  if (selection.kind !== 'profile') {
    return (
      <LegacyShell
        scene={scene}
        doors={doors}
        onDoorClick={onDoorClick}
        reason={selection.kind === 'legacy' ? selection.reason : null}
        onFallbackReason={onFallbackReason}
      />
    );
  }

  const fallback = (
    <LegacyShell
      scene={scene}
      doors={doors}
      onDoorClick={onDoorClick}
      reason={null}
      onFallbackReason={onFallbackReason}
      suppressDoorLeaves
    />
  );
  const failed = (
    <LegacyShell
      scene={scene}
      doors={doors}
      onDoorClick={onDoorClick}
      reason="manifest-unavailable"
      onFallbackReason={onFallbackReason}
      suppressDoorLeaves
    />
  );

  return (
    <ErrorBoundary key={profileKey(selection.profile)} fallback={failed}>
      <Suspense fallback={fallback}>
        <ProfileResources
          scene={scene}
          profile={selection.profile}
          doors={doors}
          onDoorClick={onDoorClick}
          onFallbackReason={onFallbackReason}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
