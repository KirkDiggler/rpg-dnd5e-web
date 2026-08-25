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
import type { DoorInfo } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { DoorState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { GlbInstance } from '../hex-grid/GlbInstance';
import { WallRunMesh } from '../hex-grid/WallRunMesh';
import {
  DOOR_FRAME_FILE,
  DOOR_LEAF_FILE,
  doorFrameScale,
  doorLeafScale,
} from '../hex-grid/syntyHexWallHelpers';
import type { DoorGapPiece } from './atlasWallRuns';

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
}

export function AtlasWalls({
  wallRuns,
  doorGaps,
  doors,
  onDoorClick,
  wallHeight = WALL_HEIGHT,
}: AtlasWallsProps) {
  return (
    <>
      <WallRunMesh
        envelopeRuns={[]}
        connectorRuns={[]}
        authoredRuns={wallRuns}
        wallHeight={wallHeight}
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
          </group>
        );
      })}
    </>
  );
}
