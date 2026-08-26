/**
 * AtlasWalls — the session route's wall/door renderer: straight
 * authored-edge runs (`WallRunMesh`'s own `authoredRuns` prop, the same
 * tiled-Synty-piece presentation the old chamber-based route used) fed by
 * `atlasWallRuns.boundariesToWallRuns`, plus one door frame+leaf per
 * declared doorway.
 *
 * # Why straight runs, not a piece per hex edge
 *
 * Kirk's ruling on PR #762's live review, after seeing the first version
 * of this file (one `GlbInstance` per declared boundary/perimeter edge,
 * following the hex grid's own zigzag): "walls look better but we had
 * straight walls in the game previously. I do not think making the walls
 * follow the hex shapes is a good idea." The wire's AUTHORITY is
 * unchanged — `atlas.boundaries` still say which cell pairs are blocked,
 * nothing here is derived from room membership the wire doesn't declare
 * — only the PRESENTATION changed, in `atlasWallRuns.ts` (see its own
 * module doc comment for the geometry: declared boundaries and doorways
 * are chained straight off the real authored edges via
 * `authoredWallRuns.computeAuthoredWallRuns`, rpg-dnd5e-web#787 — and
 * for why the floor's own outer edge draws NOTHING now, Kirk's same-day
 * ruling change: "draw nothing, floor ends into darkness").
 *
 * `WallRunMesh` itself (`../hex-grid/WallRunMesh`) is untouched — this
 * route now renders entirely through its `authoredRuns` prop (there is
 * no separate "envelope" shape at all anymore; see `atlasWallRuns.ts`'s
 * header doc) rather than its older `envelopeRuns`/`connectorRuns`
 * props, which this route passes empty. `WallRunMesh` does not place
 * doors — this component supplies the door frame+leaf the same way
 * `SyntyHexWall.tsx` always has.
 */

import type { AuthoredWallRun } from '@/hooks/authoredWallRuns';
import { WALL_HEIGHT } from '@/rendering/calibrationConstants';
import type { DungeonShellWallProfile } from '@/rendering/dungeonShellManifest';
import { DUNGEON_SURFACE_Y } from '@/rendering/dungeonSurface';
import type { DoorInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { DoorState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useGLTF } from '@react-three/drei';
import { Suspense, useMemo } from 'react';
import type { Object3D } from 'three';
import {
  deriveShellDoorGeometry,
  SHELL_DOOR_FRAME_FOREGROUND_MARGIN,
  shellDoorLeafScale,
  shellDoorSurroundScale,
  shellLocalOffsetToWorld,
  shellVisibleWallTop,
} from '../hex-grid/dungeonShellWallHelpers';
import { ENV_BASE, GlbInstance } from '../hex-grid/GlbInstance';
import {
  DOOR_FRAME_FILE,
  DOOR_LEAF_FILE,
  doorFrameScale,
  doorLeafScale,
} from '../hex-grid/syntyHexWallHelpers';
import { WallRunMesh } from '../hex-grid/WallRunMesh';
import { ErrorBoundary } from '../ui/Feedback/ErrorBoundary';
import type { DoorGapPiece } from './atlasWallRuns';

function ProfileDoor({
  door,
  profile,
  wallHeight,
  leafShut,
  leafScene,
}: {
  door: DoorGapPiece;
  profile: DungeonShellWallProfile;
  wallHeight: number;
  leafShut: boolean;
  leafScene: Object3D;
}) {
  const surroundScene = useGLTF(
    ENV_BASE + profile.doorSurround.file.replace(/^env\//, '')
  ).scene;
  const geometry = useMemo(
    () => deriveShellDoorGeometry(surroundScene, leafScene),
    [leafScene, surroundScene]
  );
  const frameOffset = shellLocalOffsetToWorld(
    { x: 0, z: SHELL_DOOR_FRAME_FOREGROUND_MARGIN },
    door.rotationY
  );
  const framePosition = {
    x: door.position.x + frameOffset.x,
    z: door.position.z + frameOffset.z,
  };
  const visibleWallTop = shellVisibleWallTop(wallHeight, profile.cap);
  const frameScale = shellDoorSurroundScale(
    profile.doorSurround,
    visibleWallTop
  );
  const leafScale = shellDoorLeafScale(
    { bounds: geometry.leafBounds },
    geometry.opening,
    frameScale
  );
  return (
    <>
      <GlbInstance
        file={profile.doorSurround.file}
        position={framePosition}
        positionY={DUNGEON_SURFACE_Y}
        rotationY={door.rotationY}
        scale={frameScale}
      />
      {leafShut && (
        <GlbInstance
          file={DOOR_LEAF_FILE}
          position={door.leafPosition}
          positionY={DUNGEON_SURFACE_Y}
          rotationY={door.rotationY}
          scale={leafScale}
          sourceScene={leafScene}
        />
      )}
    </>
  );
}

function LoadedProfileDoor(
  props: Omit<Parameters<typeof ProfileDoor>[0], 'leafScene'>
) {
  const leafScene = useGLTF(ENV_BASE + DOOR_LEAF_FILE).scene;
  return <ProfileDoor {...props} leafScene={leafScene} />;
}

const CLOSED_DOOR_FALLBACK_NAME = 'closed-door-fallback';
const CLOSED_DOOR_FALLBACK_DEPTH = 0.3;

/** Fallback-only, licensed-asset-free occluder for a closed legacy door. */
function ClosedDoorFallback({
  door,
  wallHeight,
}: {
  door: DoorGapPiece;
  wallHeight: number;
}) {
  return (
    <mesh
      name={CLOSED_DOOR_FALLBACK_NAME}
      position={[
        door.position.x,
        DUNGEON_SURFACE_Y + wallHeight / 2,
        door.position.z,
      ]}
      rotation={[0, door.rotationY, 0]}
    >
      <boxGeometry args={[1, wallHeight, CLOSED_DOOR_FALLBACK_DEPTH]} />
      <meshBasicMaterial color="#2c313d" toneMapped={false} />
    </mesh>
  );
}

function ResilientLegacyDoorLeaf({
  door,
  wallHeight,
  leafShut,
}: {
  door: DoorGapPiece;
  wallHeight: number;
  leafShut: boolean;
}) {
  const fallback = <ClosedDoorFallback door={door} wallHeight={wallHeight} />;
  return (
    <ErrorBoundary fallback={fallback}>
      {leafShut ? (
        <Suspense fallback={fallback}>
          <GlbInstance
            file={DOOR_LEAF_FILE}
            position={door.leafPosition}
            rotationY={door.rotationY}
            scale={doorLeafScale(wallHeight)}
          />
        </Suspense>
      ) : null}
    </ErrorBoundary>
  );
}

export interface AtlasWallsProps {
  wallRuns: AuthoredWallRun[];
  doorGaps: DoorGapPiece[];
  /** Live door state keyed by door id (`DoorGapPiece.connection` speaks
   * the same id — `useSessionDoors`). The frame always renders; the LEAF
   * renders only while the door is shut (closed or locked,
   * rpg-project#268). Absent — no state known yet — the leaf renders, the
   * pre-doors look: a door drawn shut until told otherwise beats a gap
   * drawn open that the server then refuses. */
  doors?: ReadonlyMap<string, DoorInfo>;
  /** A click on a door's frame or leaf, by door id — the open/unlock
   * affordance lives with the caller, which knows who is acting. */
  onDoorClick?: (door: string) => void;
  /** Defaults to the game's standard wall height so this renders at the
   * same scale as every other wall in the game. */
  wallHeight?: number;
  /** Optional measured shell profile. Omitted preserves the legacy assets
   * and transforms exactly. */
  profile?: DungeonShellWallProfile;
  /** The leaf scene already read by DungeonShell's atomic profile gate.
   * Supplying it avoids a second hook read; standalone AtlasWalls callers
   * retain the loaded-profile behavior when omitted. */
  profileLeafScene?: Object3D;
  /** Resource-fallback only: isolate legacy leaf loading so a pending or
   * rejected leaf gets a closed procedural occluder instead. Defaults false
   * so loading and ordinary legacy paths stay exactly as before. */
  resilientDoorLeaves?: boolean;
}

export function AtlasWalls({
  wallRuns,
  doorGaps,
  doors,
  onDoorClick,
  wallHeight = WALL_HEIGHT,
  profile,
  profileLeafScene,
  resilientDoorLeaves = false,
}: AtlasWallsProps) {
  return (
    <>
      <WallRunMesh
        envelopeRuns={[]}
        connectorRuns={[]}
        authoredRuns={wallRuns}
        wallHeight={wallHeight}
        profile={profile}
      />
      {doorGaps.map((door) => {
        const state = doors?.get(door.connection)?.state;
        const leafShut = state === undefined || state !== DoorState.OPEN;
        return (
          <group
            key={door.key}
            onClick={
              onDoorClick
                ? (e) => {
                    e.stopPropagation();
                    onDoorClick(door.connection);
                  }
                : undefined
            }
          >
            {profile ? (
              profileLeafScene ? (
                <ProfileDoor
                  door={door}
                  profile={profile}
                  wallHeight={wallHeight}
                  leafShut={leafShut}
                  leafScene={profileLeafScene}
                />
              ) : (
                <LoadedProfileDoor
                  door={door}
                  profile={profile}
                  wallHeight={wallHeight}
                  leafShut={leafShut}
                />
              )
            ) : (
              <>
                <GlbInstance
                  file={DOOR_FRAME_FILE}
                  position={door.position}
                  rotationY={door.rotationY}
                  scale={doorFrameScale(wallHeight)}
                />
                {resilientDoorLeaves
                  ? leafShut && (
                      <ResilientLegacyDoorLeaf
                        door={door}
                        wallHeight={wallHeight}
                        leafShut={leafShut}
                      />
                    )
                  : leafShut && (
                      <GlbInstance
                        file={DOOR_LEAF_FILE}
                        position={door.leafPosition}
                        rotationY={door.rotationY}
                        scale={doorLeafScale(wallHeight)}
                      />
                    )}
              </>
            )}
          </group>
        );
      })}
    </>
  );
}
