/**
 * atlasToScene3D — turns a `GetAtlasResponse` (dnd5e.api.session.v1alpha1)
 * into what the 3D game route's leaf renderers need, and nothing else.
 *
 * This is the 3D twin of `src/concepts/session-tomb/atlas.ts`, which does
 * the same job for the flat SVG concept page. The two are deliberately
 * separate files rather than one shared module: atlas.ts's `Point`/
 * `hexCenter` live in SVG user space (arbitrary `size`, y-down), while this
 * file targets `hexMath.ts`'s Three.js world space (`HEX_SIZE = 1.0`
 * world units, y-up, z-down-screen) via `cubeToWorld`/`hexEdgeBetween`.
 * Sharing one geometry module across both would mean one of them
 * secretly adopting the other's convention.
 *
 * # The axial -> cube bridge
 *
 * The wire's `Position` is axial (q, r) (session v0.20.0, ADR-0040 — see
 * atlas.ts's own doc comment on `HexLayout` for the full history of why
 * that needed saying twice). `hexMath.ts`'s `CubeCoord` is cube (x, y, z)
 * with x + y + z = 0, and — since rpg-toolkit#1150's axial-basis fix —
 * `cubeToWorld`'s cube.x IS the wire's q and cube.z IS the wire's r: no
 * swap, no rotation, just the derived third coordinate. `positionToCube`
 * (in `positionBridge.ts`, re-exported here unchanged for every existing
 * caller) is that bridge, kept in exactly one place so no caller re-derives
 * it (and risks re-deriving it wrong — rpg-toolkit#1150's own postmortem is
 * that a swapped-both-ways conversion passes every round-trip test and is
 * only caught by actually drawing the shape).
 *
 * # Walls live in atlasWallRuns.ts, not here
 *
 * The floor tiles this file builds are per-hex (`SyntyHexFloor` renders
 * one tile per cell either way). Walls are not: Kirk's ruling on PR #762's
 * live review was that the game's walls should stay STRAIGHT modular runs
 * (the presentation `WallRunMesh`/`wallRuns.ts` already established for
 * the old route), not a piece per declared boundary edge. `buildScene3D`
 * composes that separate module's output (`boundariesToWallRuns`) with
 * this file's own floor tiles into one `Scene3D` — see atlasWallRuns.ts's
 * own module doc comment for the wall geometry itself, including why the
 * atlas's declared boundaries and cell mask remain the sole AUTHORITY
 * even though the PRESENTATION is now straight runs.
 */

import { coordToKey } from '@/components/hex-grid/hexMath';
import type { AbsoluteFloorTile } from '@/hooks/dungeonMapGeometry';
import type { ConnectorRun, EnvelopeRun } from '@/hooks/wallRuns';
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { boundariesToWallRuns, type DoorGapPiece } from './atlasWallRuns';
import { positionToCube, worldPositionOf } from './positionBridge';

export { positionToCube, worldPositionOf };

export interface Scene3D {
  floorTiles: Map<string, AbsoluteFloorTile>;
  envelopeRuns: EnvelopeRun[];
  connectorRuns: ConnectorRun[];
  doorGaps: DoorGapPiece[];
}

/**
 * buildScene3D lays out the whole atlas once, in hexMath's world-space
 * cube coordinates: per-cell floor tiles, plus the straight wall runs
 * `atlasWallRuns.boundariesToWallRuns` derives from the declared
 * boundaries and the floor mask.
 */
export function buildScene3D(
  atlas: Pick<GetAtlasResponse, 'cells' | 'boundaries' | 'doorways'>,
  hexSize: number
): Scene3D {
  const floorTiles = new Map<string, AbsoluteFloorTile>();
  for (const cell of atlas.cells) {
    const cube = positionToCube(cell);
    floorTiles.set(coordToKey(cube), { ...cube, roomId: '' });
  }

  const { envelopeRuns, connectorRuns, doorGaps } = boundariesToWallRuns(
    atlas,
    hexSize
  );

  return { floorTiles, envelopeRuns, connectorRuns, doorGaps };
}
