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
 * the floor cell mask still says where the outside is, nothing here is
 * derived from room membership the wire doesn't declare — only the
 * PRESENTATION changed, in `atlasWallRuns.ts` (see its own module doc
 * comment for the geometry: envelope and interior seams alike are now
 * chained straight off the real authored edges via
 * `authoredWallRuns.computeAuthoredWallRuns`, rpg-dnd5e-web#787).
 *
 * `WallRunMesh` itself (`../hex-grid/WallRunMesh`) is untouched — this
 * route now renders entirely through its `authoredRuns` prop (envelope
 * and connector runs are no longer a separate shape at all; see
 * `atlasWallRuns.ts`'s header doc for why unifying them is correct, not
 * merely convenient) rather than its older `envelopeRuns`/`connectorRuns`
 * props, which this route passes empty. `WallRunMesh` does not place
 * doors — this component supplies the door frame+leaf the same way
 * `SyntyHexWall.tsx` always has.
 */

import type { AuthoredWallRun } from '@/hooks/authoredWallRuns';
import { WALL_HEIGHT } from '@/rendering/calibrationConstants';
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
  /** Defaults to the game's standard wall height so this renders at the
   * same scale as every other wall in the game. */
  wallHeight?: number;
}

export function AtlasWalls({
  wallRuns,
  doorGaps,
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
      {doorGaps.map((door) => (
        <group key={door.key}>
          <GlbInstance
            file={DOOR_FRAME_FILE}
            position={door.position}
            rotationY={door.rotationY}
            scale={doorFrameScale(wallHeight)}
          />
          <GlbInstance
            file={DOOR_LEAF_FILE}
            position={door.leafPosition}
            rotationY={door.rotationY}
            scale={doorLeafScale(wallHeight)}
          />
        </group>
      ))}
    </>
  );
}
