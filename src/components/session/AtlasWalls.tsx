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
import { useMemo } from 'react';
import { ENV_BASE, GlbInstance } from '../hex-grid/GlbInstance';
import { WallRunMesh } from '../hex-grid/WallRunMesh';
import {
  deriveShellDoorGeometry,
  extendWallRunsAtDoorGaps,
  SHELL_DOOR_FRAME_FOREGROUND_MARGIN,
  shellDoorLeafScale,
  shellDoorSurroundScale,
  shellLocalOffsetToWorld,
} from '../hex-grid/dungeonShellWallHelpers';
import {
  DOOR_FRAME_FILE,
  DOOR_LEAF_FILE,
  doorFrameScale,
  doorLeafScale,
} from '../hex-grid/syntyHexWallHelpers';
import type { DoorGapPiece } from './atlasWallRuns';

function ProfileDoor({
  door,
  profile,
  wallHeight,
  leafShut,
}: {
  door: DoorGapPiece;
  profile: DungeonShellWallProfile;
  wallHeight: number;
  leafShut: boolean;
}) {
  const surroundScene = useGLTF(
    ENV_BASE + profile.doorSurround.file.replace(/^env\//, '')
  ).scene;
  const leafScene = useGLTF(ENV_BASE + DOOR_LEAF_FILE).scene;
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
  const leafScale = shellDoorLeafScale(
    { bounds: geometry.leafBounds },
    geometry.opening,
    wallHeight,
    profile.doorSurround
  );
  return (
    <>
      <GlbInstance
        file={profile.doorSurround.file}
        position={framePosition}
        positionY={DUNGEON_SURFACE_Y}
        rotationY={door.rotationY}
        scale={shellDoorSurroundScale(profile.doorSurround, wallHeight)}
      />
      {leafShut && (
        <GlbInstance
          file={DOOR_LEAF_FILE}
          position={door.leafPosition}
          positionY={DUNGEON_SURFACE_Y}
          rotationY={door.rotationY}
          scale={leafScale}
        />
      )}
    </>
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
}

export function AtlasWalls({
  wallRuns,
  doorGaps,
  doors,
  onDoorClick,
  wallHeight = WALL_HEIGHT,
  profile,
}: AtlasWallsProps) {
  const visualWallRuns = useMemo(
    () => (profile ? extendWallRunsAtDoorGaps(wallRuns, doorGaps) : wallRuns),
    [doorGaps, profile, wallRuns]
  );
  return (
    <>
      <WallRunMesh
        envelopeRuns={[]}
        connectorRuns={[]}
        authoredRuns={visualWallRuns}
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
              <ProfileDoor
                door={door}
                profile={profile}
                wallHeight={wallHeight}
                leafShut={leafShut}
              />
            ) : (
              <>
                <GlbInstance
                  file={DOOR_FRAME_FILE}
                  position={door.position}
                  rotationY={door.rotationY}
                  scale={doorFrameScale(wallHeight)}
                />
                {leafShut && (
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
