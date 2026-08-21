/**
 * AtlasWalls — the session route's wall/door renderer: straight modular
 * runs (`WallRunMesh`, the same component/presentation the old route used)
 * fed by `atlasWallRuns.boundariesToWallRuns`'s envelope/connector runs,
 * plus one door frame+leaf per run's own gap.
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
 * comment for the geometry, including why it reuses `wallRuns.ts`'s pure
 * vector math but NOT its region-membership/reveal-fog/connector-
 * suppression logic, which exists only for the OLD wire's per-viewer
 * partial reveal).
 *
 * `WallRunMesh` itself (`../hex-grid/WallRunMesh`) is untouched, reused
 * exactly as the old route used it — its prop contract
 * (`EnvelopeRun[]`/`ConnectorRun[]`) has no dependency on the old wire's
 * proto shapes, confirmed by its own test suite hand-building those
 * fixtures directly rather than deriving them from `computeWallRuns`.
 * `WallRunMesh` does not place doors (its `ConnectorRun.segments` are
 * pre-split around the gap) or corner pieces (an unused
 * `envelopeCorners` prop — corners close via each run's own overlap-miter
 * extension, computed in `atlasWallRuns.ts`) — this component supplies
 * the door frame+leaf the same way `SyntyHexWall.tsx` always has.
 */

import type { ConnectorRun, EnvelopeRun } from '@/hooks/wallRuns';
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
  envelopeRuns: EnvelopeRun[];
  connectorRuns: ConnectorRun[];
  doorGaps: DoorGapPiece[];
  /** Defaults to the game's standard wall height so this renders at the
   * same scale as every other wall in the game. */
  wallHeight?: number;
}

export function AtlasWalls({
  envelopeRuns,
  connectorRuns,
  doorGaps,
  wallHeight = WALL_HEIGHT,
}: AtlasWallsProps) {
  return (
    <>
      <WallRunMesh
        envelopeRuns={envelopeRuns}
        connectorRuns={connectorRuns}
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
